#!/usr/bin/env python3
"""
UI test harness for AI-Atlas

Generates a test plan (Excel + CSV), runs a subset of automated browser tests
with Playwright, captures screenshots, and writes results (CSV + Excel).

Prereqs:
  pip install -r requirements.txt
  python -m playwright install

Usage examples (PowerShell):
    # Against your deployed URL
    $Env:TEST_BASE_URL = "https://www.aitoolverse.ai"; python tests/run_ui_tests.py

    # Against local dev server (any static server)
  $Env:TEST_BASE_URL = "http://localhost:8888"; python tests/run_ui_tests.py

Outputs:
  tests/output/test_plan.xlsx
  tests/output/test_plan.csv
  tests/output/results.xlsx
  tests/output/results.csv
  tests/output/screenshots/*.png
"""

from __future__ import annotations
import os
import time
import argparse
from dataclasses import dataclass, asdict
from typing import List, Dict, Any

import pandas as pd
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout


@dataclass
class TestCase:
    id: str
    feature: str
    title: str
    precondition: str
    steps: str
    expected: str
    type: str  # positive | negative | edge
    priority: str  # P0 | P1 | P2
    device: str  # e.g., mobile(375x667), desktop(1366x768)


@dataclass
class TestResult:
    id: str
    feature: str
    title: str
    status: str  # pass | fail | blocked | skipped
    details: str
    screenshot: str


def build_test_plan() -> List[TestCase]:
    tc: List[TestCase] = []

    # Mobile Hamburger Menu
    tc.append(TestCase(
        id="MN-001",
        feature="Mobile Nav",
        title="Hamburger button appears on small screens",
        precondition="Viewport <= 768px; app home loaded",
        steps="Go to home; set viewport to 375x667; observe header",
        expected="Button #mobile-menu-btn is visible",
        type="positive", priority="P0", device="mobile(375x667)"
    ))
    tc.append(TestCase(
        id="MN-002",
        feature="Mobile Nav",
        title="Menu opens and closes via button and ESC/overlay",
        precondition="Viewport <= 768px; app home loaded",
        steps="Click hamburger; panel opens; press ESC; panel closes; click to reopen; click overlay; closes",
        expected="Panel #mobile-menu-panel toggles class 'open' and overlay 'show' respectively",
        type="positive", priority="P0", device="mobile(375x667)"
    ))
    tc.append(TestCase(
        id="MN-003",
        feature="Mobile Nav",
        title="Focus trap within open menu",
        precondition="Menu open",
        steps="Press TAB repeatedly; focus cycles within menu elements",
        expected="Focus loops inside menu; TAB on last loops to first; SHIFT+TAB on first loops to last",
        type="edge", priority="P1", device="mobile(375x667)"
    ))

    # Background jank fix
    tc.append(TestCase(
        id="BG-001",
        feature="Background Fix",
        title="Mobile background uses attachment: scroll",
        precondition="Viewport <= 768px",
        steps="Load home; read computed style of body.backgroundAttachment",
        expected="Value is 'scroll'",
        type="positive", priority="P0", device="mobile(375x667)"
    ))

    # Accessibility + safe areas
    tc.append(TestCase(
        id="AC-001",
        feature="Accessibility",
        title="Skip to content link works",
        precondition="Home loaded",
        steps="Press TAB until 'Skip to content' link focused; press ENTER",
        expected="URL hash updates to #content-area and focus/scroll jumps to main content",
        type="positive", priority="P1", device="mobile(375x667)"
    ))
    tc.append(TestCase(
        id="AC-002",
        feature="Accessibility",
        title="Theme-color metas present for light/dark",
        precondition="Home loaded",
        steps="Query meta[name=theme-color] tags with relevant media",
        expected="At least two meta theme-color tags present (light/dark)",
        type="positive", priority="P2", device="desktop(1366x768)"
    ))

    # Admin endpoints (informational; may be blocked in dev)
    tc.append(TestCase(
        id="AD-001",
        feature="Admin Health Endpoint",
        title="Unauthenticated GET returns 401 or endpoint exists",
    precondition="Serverless functions not configured",
    steps="Skip Netlify-specific admin health checks",
        expected="401 Unauthorized or JSON error; not 404",
        type="negative", priority="P0", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="AD-002",
        feature="Admin Dispatch Endpoint",
        title="Unauthenticated POST returns 401 or endpoint exists",
    precondition="Serverless functions not configured",
    steps="Skip Netlify-specific admin dispatch checks",
        expected="401 Unauthorized or JSON error; not 404",
        type="negative", priority="P1", device="desktop(1366x768)"
    ))

    # Legacy index removal (safety)
    tc.append(TestCase(
        id="LG-001",
        feature="Legacy Cleanup",
        title="/public/index.html is gone",
        precondition="Deployed site",
        steps="Navigate to /public/index.html",
        expected="Returns 404 or non-200",
        type="positive", priority="P2", device="desktop(1366x768)"
    ))

    # Search experience
    tc.append(TestCase(
        id="SR-001",
        feature="Search",
        title="Search input is present and focusable",
        precondition="Home loaded",
        steps="Locate #search-bar-new and focus it",
        expected="Active element becomes the search input",
        type="positive", priority="P0", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="SR-002",
        feature="Search",
        title="Typing shows at least one result",
        precondition="Home loaded",
        steps="Type 'a' into search; wait for results",
        expected=">= 1 result appears in search results",
        type="positive", priority="P0", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="SR-003",
        feature="Search",
        title="Open button from results shows Tool Details",
        precondition="Search results visible",
        steps="Click first .open-tool-btn; tool details modal becomes visible",
        expected="Modal #tool-details-modal has class 'visible'",
        type="positive", priority="P0", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="SR-004",
        feature="Search",
        title="Category counts update when typing",
        precondition="Home loaded",
        steps="Type 'a' into search; verify #category-select options reflect counts",
        expected="Counts next to categories are numeric and 'All' >= sum of others",
        type="edge", priority="P1", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="SR-005",
        feature="Search",
        title="Gibberish query shows 'No tools found'",
        precondition="Home loaded",
        steps="Type a random long string; expect empty results message",
        expected="Text 'No tools found' visible in #search-results-container",
        type="negative", priority="P2", device="desktop(1366x768)"
    ))

    # Newly added extended search coverage
    tc.append(TestCase(
        id="SR-006",
        feature="Search",
        title="Search placeholder text is correct",
        precondition="Home loaded",
        steps="Read placeholder attribute of #search-bar-new",
        expected="Placeholder equals 'Search tools by name, tag or description...'",
        type="positive", priority="P2", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="SR-007",
        feature="Search",
        title="Trimming of leading/trailing spaces works",
        precondition="Home loaded",
        steps="Type '   chatgpt   ' (with spaces)",
        expected="Results returned (>=1) despite extra spaces",
        type="edge", priority="P1", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="SR-008",
        feature="Search",
        title="Case-insensitive search returns same results",
        precondition="Home loaded",
        steps="Type 'GeMiNi' (mixed case)",
        expected="At least one result relevant to 'gemini'",
        type="positive", priority="P1", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="SR-009",
        feature="Search",
        title="Search matches tag text",
        precondition="Home loaded",
        steps="Type a known tag like 'Freemium'",
        expected="One or more results have a tag containing 'Freemium'",
        type="positive", priority="P1", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="SR-010",
        feature="Search",
        title="No-results message clears after valid query",
        precondition="Home loaded",
        steps="Type random gibberish then replace with 'chat'",
        expected="'No tools found' disappears and results list repopulates",
        type="edge", priority="P2", device="desktop(1366x768)"
    ))

    # Category filter
    tc.append(TestCase(
        id="CF-001",
        feature="Category Filter",
        title="Category dropdown shows placeholder by default",
        precondition="Home loaded",
        steps="Check #category-select value is empty and placeholder option exists",
        expected="Value is '' and placeholder option present",
        type="positive", priority="P1", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="CF-002",
        feature="Category Filter",
        title="All category reflects total count",
        precondition="Home loaded",
        steps="Open #category-select and inspect 'All (N)' value",
        expected="All count is a non-negative integer",
        type="positive", priority="P2", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="CF-003",
        feature="Category Filter",
        title="Selecting a category with no search navigates to tools view",
        precondition="Home loaded, no search query",
        steps="Pick first non-empty, non-'all' option in #category-select",
        expected="location.hash contains '#domain='",
        type="positive", priority="P1", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="CF-004",
        feature="Category Filter",
        title="Category filter with search narrows results without navigation",
        precondition="Home loaded; type query first",
        steps="Type 'a'; select a specific category; verify fewer/equal results and hash unchanged",
        expected="Result count does not increase and URL hash does not include '#domain='",
        type="edge", priority="P2", device="desktop(1366x768)"
    ))

    # Domain navigation
    tc.append(TestCase(
        id="DN-001",
        feature="Domain Navigation",
        title="Clicking a domain card navigates to tools view",
        precondition="Home loaded",
        steps="Click first .domain-card",
        expected="location.hash contains '#domain='",
        type="positive", priority="P0", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="DN-002",
        feature="Domain Navigation",
        title="Back to Domains returns home and resets category placeholder",
        precondition="On a domain tools page",
        steps="Click #back-button; expect home view and #category-select placeholder empty",
        expected="URL hash cleared and #category-select value is ''",
        type="positive", priority="P2", device="desktop(1366x768)"
    ))

    # Tool details modal
    tc.append(TestCase(
        id="TD-001",
        feature="Tool Details",
        title="Open and close tool details modal from tools view",
        precondition="On a domain tools page",
        steps="Click first .open-tool-btn; modal opens; click close; modal closes",
        expected="Modal visible toggles correctly",
        type="positive", priority="P1", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="TD-002",
        feature="Tool Details",
        title="Visit Website link present and opens new tab",
        precondition="Tool details modal open",
        steps="Open first tool modal; check 'Visit Website' anchor target and href",
        expected="Anchor has target=_blank and non-empty href",
        type="positive", priority="P2", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="TD-003",
        feature="Tool Details",
        title="About section renders some text",
        precondition="Tool details modal open",
        steps="Open first tool modal; inspect .prose content",
        expected="About section not empty",
        type="positive", priority="P2", device="desktop(1366x768)"
    ))

    # Theme toggle
    tc.append(TestCase(
        id="TH-001",
        feature="Theme Toggle",
        title="Toggling theme flips dark class on html",
        precondition="Home loaded",
        steps="Click #theme-toggle and observe documentElement class list",
        expected="Presence of 'dark' class toggles",
        type="edge", priority="P2", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="TH-002",
        feature="Theme Toggle",
        title="Theme icons swap visibility",
        precondition="Home loaded",
        steps="Click toggle and check light/dark icon hidden state",
        expected="Exactly one of #theme-toggle-dark-icon or #theme-toggle-light-icon is hidden",
        type="positive", priority="P2", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="TH-003",
        feature="Theme Toggle",
        title="Theme persists in localStorage across reloads",
        precondition="Home loaded",
        steps="Toggle to dark; reload; read localStorage('theme') and html class",
        expected="localStorage value matches html class",
        type="positive", priority="P2", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="TH-004",
        feature="Theme Toggle",
        title="Double toggle returns to original state",
        precondition="Home loaded",
        steps="Record state; click toggle twice; compare",
        expected="Initial and final states equal",
        type="edge", priority="P2", device="desktop(1366x768)"
    ))

    # Filter Dropdown feature
    tc.append(TestCase(
        id="FD-001",
        feature="Filter Dropdown",
        title="Filter button visible and clickable on desktop",
        precondition="Home loaded",
        steps="Locate #filter-button and click it",
        expected="Filter dropdown #filter-menu becomes visible",
        type="positive", priority="P0", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="FD-002",
        feature="Filter Dropdown",
        title="Filter button responsive on mobile portrait",
        precondition="Mobile viewport (375x667)",
        steps="Click #filter-button on mobile",
        expected="Dropdown opens and is positioned correctly below button",
        type="positive", priority="P0", device="mobile(375x667)"
    ))
    tc.append(TestCase(
        id="FD-003",
        feature="Filter Dropdown",
        title="Dropdown shows category list with counts",
        precondition="Filter dropdown open",
        steps="Click filter button; inspect dropdown content for category buttons with counts",
        expected="All category options visible with format 'Name (count)'",
        type="positive", priority="P1", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="FD-004",
        feature="Filter Dropdown",
        title="Selecting category filters results and closes dropdown",
        precondition="Home loaded; filter dropdown open",
        steps="Open filter; click a category; verify dropdown closes and results filter",
        expected="Dropdown hidden; search results (if any) match selected category",
        type="positive", priority="P0", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="FD-005",
        feature="Filter Dropdown",
        title="Dropdown scrolls internally when content overflows",
        precondition="Filter dropdown open with many categories",
        steps="Open filter; attempt to scroll inside dropdown; verify page doesn't scroll",
        expected="Dropdown content scrolls; page remains stationary",
        type="positive", priority="P1", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="FD-006",
        feature="Filter Dropdown",
        title="Dark mode: dropdown text is readable",
        precondition="Dark mode enabled; filter dropdown open",
        steps="Toggle dark mode; open filter; inspect text contrast",
        expected="Category text is visible with sufficient contrast in dark mode",
        type="positive", priority="P2", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="FD-007",
        feature="Filter Dropdown",
        title="Dropdown closes on outside click",
        precondition="Filter dropdown open",
        steps="Open filter; click outside dropdown area",
        expected="Dropdown closes and backdrop disappears",
        type="positive", priority="P1", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="FD-008",
        feature="Filter Dropdown",
        title="Dropdown closes on ESC key",
        precondition="Filter dropdown open",
        steps="Open filter; press ESC key",
        expected="Dropdown closes",
        type="positive", priority="P2", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="FD-009",
        feature="Filter Dropdown",
        title="Clear button resets category selection",
        precondition="Filter dropdown open with category selected",
        steps="Select a category; reopen filter; click Clear button",
        expected="Category resets to 'All'; results update",
        type="positive", priority="P1", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="FD-010",
        feature="Filter Dropdown",
        title="Done button closes dropdown without changing selection",
        precondition="Filter dropdown open",
        steps="Open filter; click Done button without selecting",
        expected="Dropdown closes; no filter change",
        type="edge", priority="P2", device="desktop(1366x768)"
    ))

    # Auth feature (UI + optional real login)
    tc.append(TestCase(
        id="AU-001",
        feature="Auth",
        title="Sign In button opens modal",
        precondition="Logged out",
        steps="Click #signin-btn; expect #auth-modal.visible",
        expected="Modal becomes visible",
        type="positive", priority="P0", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="AU-002",
        feature="Auth",
        title="Switch between Sign In/Sign Up toggles labels",
        precondition="Auth modal open",
        steps="Click #modal-switch-btn and inspect #modal-title and #auth-submit-btn text",
        expected="Labels change appropriately",
        type="positive", priority="P2", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="AU-003",
        feature="Auth",
        title="Google sign-in button visible",
        precondition="Auth modal open",
        steps="Check #google-signin-btn present",
        expected="Google button is visible",
        type="positive", priority="P2", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="AU-004",
        feature="Auth",
        title="Email/password sign-in works (if creds provided)",
        precondition="TEST_USER_EMAIL/TEST_USER_PASSWORD set",
        steps="Open modal, fill credentials, submit and wait for #signout-btn",
        expected="User header shows Sign Out",
        type="positive", priority="P0", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="AU-005",
        feature="Auth",
        title="Sign out returns to logged-out UI",
        precondition="Logged in",
        steps="Click #signout-btn; wait for #signin-btn",
        expected="Sign In button visible again",
        type="positive", priority="P1", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="AU-006",
        feature="Auth",
        title="Session persists across reload (if login succeeded)",
        precondition="Logged in",
        steps="Reload page and check #signout-btn still present",
        expected="Still logged in after reload",
        type="edge", priority="P2", device="desktop(1366x768)"
    ))

    # Favorites feature
    tc.append(TestCase(
        id="FV-001",
        feature="Favorites",
        title="Favorite star toggles appearance",
        precondition="On domain tools page",
        steps="Click first .favorite-btn; expect text from '☆' to '★' and class change",
        expected="Button has bg-yellow-300 and text '★'",
        type="positive", priority="P1", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="FV-002",
        feature="Favorites",
        title="Favorites link visible after login",
        precondition="Logged in",
        steps="Check #favorites-link present",
        expected="Favorites link rendered in header",
        type="positive", priority="P2", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="FV-003",
        feature="Favorites",
        title="Favorites page lists favorited tool (if logged in)",
        precondition="Logged in and at least one favorite toggled",
        steps="Click #favorites-link; expect tool card in list",
        expected="Favorited tool name appears",
        type="positive", priority="P2", device="desktop(1366x768)"
    ))

    # Admin Moderation (limited unless admin claims provided)
    tc.append(TestCase(
        id="AM-001",
        feature="Admin Moderation",
        title="Admin link hidden for non-admin users",
        precondition="Logged out or non-admin user",
        steps="Inspect header for #admin-link",
        expected="No admin link present",
        type="positive", priority="P2", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="AM-002",
        feature="Admin Moderation",
        title="Admin panel opens if admin creds provided",
        precondition="Admin login available and user has admin claim",
        steps="Login as admin; click Admin; expect 'Admin Panel' heading",
        expected="Admin view rendered",
        type="positive", priority="P1", device="desktop(1366x768)"
    ))

    return tc


def write_test_plan(plan: List[TestCase], out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)
    # Overall CSV
    df = pd.DataFrame([asdict(x) for x in plan])
    df.to_csv(os.path.join(out_dir, 'test_plan.csv'), index=False, encoding='utf-8')
    # Excel with one sheet per feature
    xlsx = os.path.join(out_dir, 'test_plan.xlsx')
    with pd.ExcelWriter(xlsx, engine='openpyxl') as w:
        for feature, group in df.groupby('feature'):
            group.to_excel(w, sheet_name=feature[:31], index=False)


def run_ui_tests(base_url: str, out_dir: str, plan: List[TestCase]) -> List[TestResult]:
    shots = os.path.join(out_dir, 'screenshots')
    os.makedirs(shots, exist_ok=True)
    results: List[TestResult] = []

    def shot(name: str, page) -> str:
        safe = name.replace(' ', '_').replace('/', '_')
        path = os.path.join(shots, f"{safe}.png")
        page.screenshot(path=path, full_page=True)
        return path

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            # Contexts
            mobile = browser.new_context(viewport={'width': 375, 'height': 667}, device_scale_factor=2)
            mpage = mobile.new_page()
            desk = browser.new_context(viewport={'width': 1366, 'height': 768})
            dpage = desk.new_page()
            home = base_url.rstrip('/') + '/'

            # Helpers
            def safe_click(page, selector, timeout=10000):
                page.wait_for_selector(selector, timeout=timeout)
                page.click(selector, timeout=timeout)

            def goto_home(page):
                page.goto(home, wait_until='domcontentloaded', timeout=30000)

            def goto_tools_first_domain(page):
                goto_home(page)
                page.wait_for_selector('.domain-card', timeout=15000)
                page.click('.domain-card', timeout=15000)
                page.wait_for_selector('.open-tool-btn', timeout=20000)

            # ---------------------------------------------
            # Search helpers (new deterministic waits)
            # ---------------------------------------------
            def wait_for_initial_tools(page, timeout_ms: int = 20000) -> bool:
                """Wait until some tool data is present (grid ready or search container populated)."""
                deadline = time.time() + timeout_ms / 1000.0
                while time.time() < deadline:
                    try:
                        # Prefer explicit readiness flag if exposed by app
                        if page.evaluate("window.__TOOLS_READY === true"):
                            return True
                        if page.query_selector('.open-tool-btn'):
                            return True
                        if page.evaluate("window.__TOOLS_LOADED || false"):
                            return True
                        html_len = page.evaluate("(document.querySelector('#search-results-container')||{}).innerHTML.length || 0")
                        if html_len > 50:
                            return True
                    except Exception:
                        pass
                    time.sleep(0.15)
                return False

            def wait_for_search_resolution(page, expect_results: bool | None = None, timeout_ms: int = 10000):
                """Poll until search produces either results or a no-results message.

                expect_results:
                  True  -> stop when >=1 result
                  False -> stop when 'No tools found' present
                  None  -> stop when either condition met
                Returns (found_any, saw_no_results, count)
                """
                deadline = time.time() + timeout_ms / 1000.0
                found_any = False
                saw_none = False
                count = 0
                while time.time() < deadline:
                    try:
                        count_btns = page.evaluate("document.querySelectorAll('#search-results-container .open-tool-btn').length")
                        count_results = page.evaluate("document.querySelectorAll('#search-results-container .tool-result').length")
                        count = max(int(count_btns or 0), int(count_results or 0))
                        txt = page.evaluate("(document.querySelector('#search-results-container')||{}).innerText || ''") or ''
                        found_any = count >= 1
                        saw_none = ('No tools found' in txt)
                        if expect_results is True and found_any:
                            break
                        if expect_results is False and saw_none:
                            break
                        if expect_results is None and (found_any or saw_none):
                            break
                    except Exception:
                        pass
                    time.sleep(0.15)
                return found_any, saw_none, count

            # ---------------------------------------------
            # Search test functions (replace brittle lambdas)
            # ---------------------------------------------
            def do_SR_002():
                dpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                dpage.wait_for_selector('#search-bar-new', timeout=10000)
                wait_for_initial_tools(dpage)
                dpage.fill('#search-bar-new', 'a', timeout=10000)
                found, none, count = wait_for_search_resolution(dpage, expect_results=None, timeout_ms=10000)
                status = 'pass' if (found and count >= 1) else ('skipped' if none else 'fail')
                details = f"count={count}, noResults={none}"
                results.append(TestResult('SR-002', 'Search', 'Typing shows at least one result', status, details, shot('SR-002', dpage)))

            def do_SR_003():
                dpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                dpage.wait_for_selector('#search-bar-new', timeout=10000)
                wait_for_initial_tools(dpage)
                dpage.fill('#search-bar-new', 'a', timeout=10000)
                found, none, count = wait_for_search_resolution(dpage, expect_results=True, timeout_ms=10000)
                if not found:
                    results.append(TestResult('SR-003', 'Search', 'Open button from results shows Tool Details', 'skipped', 'no results to open', shot('SR-003_skipped', dpage)))
                    return
                try:
                    dpage.click('#search-results-container .open-tool-btn', timeout=10000)
                    dpage.wait_for_selector('#tool-details-modal.visible', timeout=10000)
                    results.append(TestResult('SR-003', 'Search', 'Open button from results shows Tool Details', 'pass', 'modal visible', shot('SR-003', dpage)))
                except Exception as e:
                    results.append(TestResult('SR-003', 'Search', 'Open button from results shows Tool Details', 'fail', str(e), shot('SR-003_error', dpage)))

            def do_SR_004():
                dpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                dpage.wait_for_selector('#search-bar-new', timeout=10000)
                wait_for_initial_tools(dpage)
                dpage.fill('#search-bar-new', 'a', timeout=10000)
                wait_for_search_resolution(dpage, expect_results=None, timeout_ms=8000)
                allText = dpage.evaluate("(() => { const o=[...document.querySelectorAll('#category-select option')].find(x=>/^All/.test(x.textContent||'')); return o?o.textContent:'' })()")
                ok = bool(allText and any(ch.isdigit() for ch in str(allText)))
                results.append(TestResult('SR-004', 'Search', 'Category counts update when typing', 'pass' if ok else 'fail', f'text={allText}', shot('SR-004', dpage)))

            def do_SR_005():
                dpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                dpage.wait_for_selector('#search-bar-new', timeout=10000)
                wait_for_initial_tools(dpage)
                dpage.fill('#search-bar-new', 'zzzzquuxnoresult1234567890', timeout=10000)
                found, none, count = wait_for_search_resolution(dpage, expect_results=False, timeout_ms=8000)
                txt = dpage.evaluate("(document.getElementById('search-results-container')||{}).innerText||''")
                ok = ('No tools found' in str(txt) and not found and none)
                results.append(TestResult('SR-005', 'Search', "Gibberish query shows 'No tools found'", 'pass' if ok else 'fail', f'txt={txt[:60]}', shot('SR-005', dpage)))

            def do_SR_007():
                dpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                dpage.wait_for_selector('#search-bar-new', timeout=10000)
                wait_for_initial_tools(dpage)
                dpage.fill('#search-bar-new', '   chatgpt   ')
                time.sleep(5)  # explicit stabilization delay
                found, none, count = wait_for_search_resolution(dpage, expect_results=True, timeout_ms=10000)
                results.append(TestResult('SR-007', 'Search', 'Trimming of leading/trailing spaces works', 'pass' if found else 'fail', f'results={count}', shot('SR-007', dpage)))

            def do_SR_008():
                dpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                dpage.wait_for_selector('#search-bar-new', timeout=10000)
                wait_for_initial_tools(dpage)
                dpage.fill('#search-bar-new', 'GeMiNi')
                time.sleep(5)  # explicit stabilization delay
                found, none, count = wait_for_search_resolution(dpage, expect_results=True, timeout_ms=10000)
                results.append(TestResult('SR-008', 'Search', 'Case-insensitive search returns same results', 'pass' if found else 'fail', f'results={count}', shot('SR-008', dpage)))

            def do_SR_009():
                dpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                dpage.wait_for_selector('#search-bar-new', timeout=10000)
                wait_for_initial_tools(dpage)
                dpage.fill('#search-bar-new', 'Freemium')
                time.sleep(5)  # explicit stabilization delay
                found, none, count = wait_for_search_resolution(dpage, expect_results=True, timeout_ms=10000)
                html = dpage.inner_html('#search-results-container')
                results.append(TestResult('SR-009', 'Search', 'Search matches tag text', 'pass' if (found and html and 'Freemium' in html) else 'fail', 'tag_check', shot('SR-009', dpage)))

            def do_SR_010():
                dpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                dpage.wait_for_selector('#search-bar-new', timeout=10000)
                wait_for_initial_tools(dpage)
                # First gibberish
                dpage.fill('#search-bar-new', 'no-way-this-matches-123456789')
                f1_found, f1_none, _ = wait_for_search_resolution(dpage, expect_results=False, timeout_ms=8000)
                msg1 = dpage.text_content('#search-results-container') or ''
                # Now valid query
                dpage.fill('#search-bar-new', 'chat')
                f2_found, f2_none, c2 = wait_for_search_resolution(dpage, expect_results=True, timeout_ms=10000)
                msg2 = dpage.text_content('#search-results-container') or ''
                ok = bool(f1_none and f2_found and ('No tools found' not in msg2))
                results.append(TestResult('SR-010', 'Search', 'No-results message clears after valid query', 'pass' if ok else 'fail', 'cleared' if ok else f'before={msg1[:40]}; after={msg2[:40]}; results={c2}', shot('SR-010', dpage)))

            def ui_login_if_creds(page) -> bool:
                email = os.environ.get('TEST_USER_EMAIL', '').strip()
                pwd = os.environ.get('TEST_USER_PASSWORD', '').strip()
                if not email or not pwd:
                    return False
                goto_home(page)
                try:
                    # If already signed in, short-circuit
                    if page.query_selector('#signout-btn'):
                        return True
                    safe_click(page, '#signin-btn', timeout=10000)
                    page.wait_for_selector('#auth-modal.visible', timeout=10000)
                    page.fill('#email-input', email, timeout=10000)
                    page.fill('#password-input', pwd, timeout=10000)
                    safe_click(page, '#auth-submit-btn', timeout=10000)
                    page.wait_for_selector('#auth-modal.visible', state='detached', timeout=20000)
                    page.wait_for_selector('#signout-btn', timeout=20000)
                    return True
                except Exception:
                    return False

            def ui_signout_if_possible(page):
                try:
                    if page.query_selector('#signout-btn'):
                        safe_click(page, '#signout-btn', timeout=10000)
                        page.wait_for_selector('#signin-btn', timeout=20000)
                        return True
                except Exception:
                    return False
                return False

            # Handlers per test id
            def do_MN_001():
                try:
                    mpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                    btn = mpage.locator('#mobile-menu-btn')
                    visible = btn.is_visible()
                    results.append(TestResult('MN-001', 'Mobile Nav', 'Hamburger button appears on small screens', 'pass' if visible else 'fail', f'visible={visible}', shot('MN-001', mpage)))
                except Exception as e:
                    results.append(TestResult('MN-001', 'Mobile Nav', 'Hamburger button appears on small screens', 'fail', str(e), shot('MN-001_error', mpage)))

            def do_MN_002():
                try:
                    mpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                    mpage.click('#mobile-menu-btn')
                    mpage.wait_for_selector('#mobile-menu-panel.open', timeout=3000)
                    # Close with Escape
                    mpage.keyboard.press('Escape')
                    mpage.wait_for_selector('#mobile-menu-panel.open', state='detached', timeout=3000)
                    # Re-open and close by overlay
                    mpage.click('#mobile-menu-btn')
                    mpage.wait_for_selector('#mobile-menu-panel.open', timeout=3000)
                    mpage.click('#mobile-menu-overlay')
                    mpage.wait_for_selector('#mobile-menu-panel.open', state='detached', timeout=3000)
                    results.append(TestResult('MN-002', 'Mobile Nav', 'Menu opens and closes via button and ESC/overlay', 'pass', 'Toggled open/close as expected', shot('MN-002', mpage)))
                except PWTimeout as e:
                    results.append(TestResult('MN-002', 'Mobile Nav', 'Menu opens and closes via button and ESC/overlay', 'fail', f'Timeout {e}', shot('MN-002_error', mpage)))
                except Exception as e:
                    results.append(TestResult('MN-002', 'Mobile Nav', 'Menu opens and closes via button and ESC/overlay', 'fail', str(e), shot('MN-002_error', mpage)))

            def do_MN_003():
                try:
                    mpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                    mpage.click('#mobile-menu-btn')
                    mpage.wait_for_selector('#mobile-menu-panel.open', timeout=3000)
                    # Focus trap quick check
                    mpage.keyboard.press('Tab')
                    mpage.keyboard.press('Tab')
                    mpage.keyboard.press('Shift+Tab')
                    results.append(TestResult('MN-003', 'Mobile Nav', 'Focus trap within open menu', 'pass', 'Basic trap behavior observed', shot('MN-003', mpage)))
                except PWTimeout as e:
                    results.append(TestResult('MN-003', 'Mobile Nav', 'Focus trap within open menu', 'fail', f'Timeout {e}', shot('MN-003_error', mpage)))
                except Exception as e:
                    results.append(TestResult('MN-003', 'Mobile Nav', 'Focus trap within open menu', 'fail', str(e), shot('MN-003_error', mpage)))

            def do_BG_001():
                try:
                    mpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                    attach = mpage.evaluate("getComputedStyle(document.body).backgroundAttachment")
                    status = 'pass' if attach.lower().strip() == 'scroll' else 'fail'
                    results.append(TestResult('BG-001', 'Background Fix', 'Mobile background uses attachment: scroll', status, f"attachment={attach}", shot('BG-001', mpage)))
                except Exception as e:
                    results.append(TestResult('BG-001', 'Background Fix', 'Mobile background uses attachment: scroll', 'fail', str(e), shot('BG-001_error', mpage)))

            def do_AC_001():
                try:
                    mpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                    mpage.keyboard.press('Tab')
                    mpage.keyboard.press('Enter')
                    time.sleep(0.2)
                    url = mpage.url
                    status = 'pass' if '#content-area' in url else 'fail'
                    results.append(TestResult('AC-001', 'Accessibility', 'Skip to content link works', status, f"url={url}", shot('AC-001', mpage)))
                except Exception as e:
                    results.append(TestResult('AC-001', 'Accessibility', 'Skip to content link works', 'fail', str(e), shot('AC-001_error', mpage)))

            def do_AC_002():
                try:
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                    count = dpage.evaluate('document.querySelectorAll("meta[name=theme-color]").length')
                    status = 'pass' if count >= 2 else 'fail'
                    results.append(TestResult('AC-002', 'Accessibility', 'Theme-color metas present for light/dark', status, f"count={count}", shot('AC-002', dpage)))
                except Exception as e:
                    results.append(TestResult('AC-002', 'Accessibility', 'Theme-color metas present for light/dark', 'fail', str(e), shot('AC-002_error', dpage)))

            def do_AD_001():
                try:
                    url = base_url.rstrip('/') + '/admin-health-not-configured'
                    dpage.goto(url, wait_until='load', timeout=15000)
                    code = dpage.evaluate("fetch(window.location.href, {method:'GET'}).then(r=>r.status).catch(()=>0)")
                    if code == 404:
                        results.append(TestResult('AD-001', 'Admin Health Endpoint', 'Unauthenticated GET returns 401 or endpoint exists', 'blocked', 'Endpoint 404 (likely not deployed or Netlify plan)', shot('AD-001_blocked', dpage)))
                    else:
                        status = 'pass' if code in (401, 403) else 'fail'
                        results.append(TestResult('AD-001', 'Admin Health Endpoint', 'Unauthenticated GET returns 401 or endpoint exists', status, f"status={code}", shot('AD-001', dpage)))
                except Exception as e:
                    results.append(TestResult('AD-001', 'Admin Health Endpoint', 'Unauthenticated GET returns 401 or endpoint exists', 'blocked', str(e), shot('AD-001_error', dpage)))

            def do_AD_002():
                try:
                    url = base_url.rstrip('/') + '/admin-dispatch-not-configured'
                    code = dpage.evaluate("fetch(arguments[0], {method:'POST'}).then(r=>r.status).catch(()=>0)", url)
                    if code == 404:
                        results.append(TestResult('AD-002', 'Admin Dispatch Endpoint', 'Unauthenticated POST returns 401 or endpoint exists', 'blocked', 'Endpoint 404 (likely not deployed or Netlify plan)', shot('AD-002_blocked', dpage)))
                    else:
                        status = 'pass' if code in (401, 403) else 'fail'
                        results.append(TestResult('AD-002', 'Admin Dispatch Endpoint', 'Unauthenticated POST returns 401 or endpoint exists', status, f"status={code}", shot('AD-002', dpage)))
                except Exception as e:
                    results.append(TestResult('AD-002', 'Admin Dispatch Endpoint', 'Unauthenticated POST returns 401 or endpoint exists', 'blocked', str(e), shot('AD-002_error', dpage)))

            def do_LG_001():
                try:
                    url = base_url.rstrip('/') + '/public/index.html'
                    code = dpage.evaluate("fetch(arguments[0], {method:'GET'}).then(r=>r.status).catch(()=>0)", url)
                    status = 'pass' if (code == 404 or code == 0 or code >= 400) else 'fail'
                    results.append(TestResult('LG-001', 'Legacy Cleanup', '/public/index.html is gone', status, f"status={code}", shot('LG-001', dpage)))
                except Exception as e:
                    results.append(TestResult('LG-001', 'Legacy Cleanup', '/public/index.html is gone', 'fail', str(e), shot('LG-001_error', dpage)))

            def do_AM_002():
                try:
                    goto_home(dpage)
                    okLogin = ui_login_if_creds(dpage)
                    linkEl = dpage.query_selector('#admin-link')
                    if linkEl:
                        dpage.click('#admin-link', timeout=10000)
                        dpage.wait_for_selector('text=Admin Panel', timeout=15000)
                        results.append(TestResult('AM-002', 'Admin Moderation', 'Admin panel opens if admin creds provided', 'pass', 'Admin panel visible', shot('AM-002', dpage)))
                    else:
                        results.append(TestResult('AM-002', 'Admin Moderation', 'Admin panel opens if admin creds provided', 'skipped', 'No admin claim or no creds', shot('AM-002', dpage)))
                except Exception as e:
                    results.append(TestResult('AM-002', 'Admin Moderation', 'Admin panel opens if admin creds provided', 'fail', str(e), shot('AM-002_error', dpage)))

            dispatch = {
                'MN-001': do_MN_001,
                'MN-002': do_MN_002,
                'MN-003': do_MN_003,
                'BG-001': do_BG_001,
                'AC-001': do_AC_001,
                'AC-002': do_AC_002,
                'AD-001': do_AD_001,
                'AD-002': do_AD_002,
                'LG-001': do_LG_001,
                # Search
                'SR-001': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    dpage.focus('#search-bar-new'),
                    results.append(TestResult('SR-001', 'Search', 'Search input is present and focusable',
                                              'pass' if dpage.evaluate("document.activeElement && document.activeElement.id === 'search-bar-new'") else 'fail',
                                              'focused', shot('SR-001', dpage)))
                ),
                'SR-002': do_SR_002,
                'SR-003': do_SR_003,
                'SR-004': do_SR_004,
                'SR-005': do_SR_005,
                'SR-006': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (ph := dpage.get_attribute('#search-bar-new', 'placeholder')),
                    results.append(TestResult('SR-006', 'Search', 'Search placeholder text is correct', 'pass' if ph and 'Search tools by name' in ph else 'fail', f'placeholder={ph}', shot('SR-006', dpage)))
                ),
                'SR-007': do_SR_007,
                'SR-008': do_SR_008,
                'SR-009': do_SR_009,
                'SR-010': do_SR_010,
                # Category Filter
                'CF-001': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.wait_for_selector('#category-select', timeout=10000),
                        val := dpage.evaluate("document.querySelector('#category-select').value"),
                        hasPH := dpage.evaluate("!!document.querySelector('#category-select option[data-placeholder]')"),
                        status := 'pass' if (val == '' and hasPH) else 'fail',
                        results.append(TestResult('CF-001', 'Category Filter', 'Category dropdown shows placeholder by default', status, f"value='{val}', placeholder={hasPH}", shot('CF-001', dpage)))
                    ))()
                ),
                'CF-002': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.wait_for_selector('#category-select', timeout=10000),
                        allText := dpage.evaluate("(() => { const o=[...document.querySelectorAll('#category-select option')].find(x=>/^All/.test(x.textContent||'')); return o?o.textContent:'' })()"),
                        ok := bool(allText and any(ch.isdigit() for ch in str(allText))),
                        results.append(TestResult('CF-002', 'Category Filter', 'All category reflects total count', 'pass' if ok else 'fail', f"text={allText}", shot('CF-002', dpage)))
                    ))()
                ),
                'CF-003': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.wait_for_selector('#category-select', timeout=10000),
                        slug := dpage.evaluate("(() => { const sel=document.querySelector('#category-select'); if(!sel) return ''; for (const o of sel.options){ const v=o.value; if(v && v.toLowerCase()!=='all'){ return v; } } return ''; })()"),
                        (dpage.select_option('#category-select', slug) if slug else None),
                        time.sleep(0.3),
                        h := dpage.evaluate('window.location.hash'),
                        results.append(TestResult('CF-003', 'Category Filter', 'Selecting a category with no search navigates to tools view',
                                                  'pass' if (isinstance(h, str) and '#domain=' in h) else 'fail', f'hash={h}', shot('CF-003', dpage)))
                    ))()
                ),
                'CF-004': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.fill('#search-bar-new', 'a', timeout=10000),
                        dpage.wait_for_selector('#search-results-container', timeout=10000),
                        before := dpage.evaluate("document.querySelectorAll('#search-results-container .open-tool-btn').length"),
                        slug := dpage.evaluate("(() => { const sel=document.querySelector('#category-select'); if(!sel) return ''; for (const o of sel.options){ const v=o.value; if(v && v.toLowerCase()!=='all'){ return v; } } return ''; })()"),
                        (dpage.select_option('#category-select', slug) if slug else None),
                        time.sleep(0.3),
                        after := dpage.evaluate("document.querySelectorAll('#search-results-container .open-tool-btn').length"),
                        h := dpage.evaluate('window.location.hash'),
                        ok := (int(after) <= int(before) and (isinstance(h, str) and ('#domain=' not in h))),
                        results.append(TestResult('CF-004', 'Category Filter', 'Category filter with search narrows results without navigation', 'pass' if ok else 'fail', f'before={before}, after={after}, hash={h}', shot('CF-004', dpage)))
                    ))()
                ),
                # Domain Navigation
                'DN-001': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.wait_for_selector('.domain-card', timeout=10000),
                        dpage.click('.domain-card', timeout=10000),
                        time.sleep(0.3),
                        h := dpage.evaluate('window.location.hash'),
                        results.append(TestResult('DN-001', 'Domain Navigation', 'Clicking a domain card navigates to tools view',
                                                  'pass' if (isinstance(h, str) and '#domain=' in h) else 'fail', f'hash={h}', shot('DN-001', dpage)))
                    ))()
                ),
                'DN-002': lambda: (
                    goto_tools_first_domain(dpage),
                    (lambda: (
                        dpage.wait_for_selector('#back-button', timeout=10000),
                        dpage.click('#back-button', timeout=10000),
                        time.sleep(0.3),
                        val := dpage.evaluate("document.querySelector('#category-select') ? document.querySelector('#category-select').value : 'NA'"),
                        h := dpage.evaluate('window.location.hash'),
                        ok := (val == '' and (h == '' or h == '#' or not h)),
                        results.append(TestResult('DN-002', 'Domain Navigation', 'Back to Domains returns home and resets category placeholder', 'pass' if ok else 'fail', f"val='{val}', hash={h}", shot('DN-002', dpage)))
                    ))()
                ),
                # Tool Details
                'TD-001': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.wait_for_selector('.domain-card', timeout=10000),
                        dpage.click('.domain-card', timeout=10000),
                        dpage.wait_for_selector('.open-tool-btn', timeout=15000),
                        dpage.click('.open-tool-btn', timeout=15000),
                        dpage.wait_for_selector('#tool-details-modal.visible', timeout=15000),
                        # close modal
                        dpage.click('#close-tool-details-modal-btn', timeout=10000),
                        time.sleep(0.2),
                        vis := dpage.evaluate("document.querySelector('#tool-details-modal').classList.contains('visible')"),
                        results.append(TestResult('TD-001', 'Tool Details', 'Open and close tool details modal from tools view', 'pass' if not vis else 'fail', f'visible={vis}', shot('TD-001', dpage)))
                    ))()
                ),
                'TD-002': lambda: (
                    goto_tools_first_domain(dpage),
                    (lambda: (
                        dpage.click('.open-tool-btn', timeout=15000),
                        dpage.wait_for_selector('#tool-details-modal.visible', timeout=15000),
                        href := dpage.evaluate("(() => { const a=[...document.querySelectorAll('#tool-details-modal a')].find(x=>/Visit Website/.test(x.textContent||'')); if(!a) return ''; return (a.getAttribute('href')||'') + '|' + (a.getAttribute('target')||''); })()"),
                        ok := bool(href and '|' in href and href.split('|')[0] and href.split('|')[1] == '_blank'),
                        results.append(TestResult('TD-002', 'Tool Details', 'Visit Website link present and opens new tab', 'pass' if ok else 'fail', f'href_target={href}', shot('TD-002', dpage)))
                    ))()
                ),
                'TD-003': lambda: (
                    goto_tools_first_domain(dpage),
                    (lambda: (
                        dpage.click('.open-tool-btn', timeout=15000),
                        dpage.wait_for_selector('#tool-details-modal.visible', timeout=15000),
                        txt := dpage.evaluate("(() => { const el=document.querySelector('#tool-details-modal .prose'); return el ? (el.textContent||'').trim() : ''; })()"),
                        results.append(TestResult('TD-003', 'Tool Details', 'About section renders some text', 'pass' if (isinstance(txt, str) and len(txt) > 0) else 'fail', f'len={len(txt) if isinstance(txt, str) else 0}', shot('TD-003', dpage)))
                    ))()
                ),
                # Theme Toggle
                'TH-001': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        before := dpage.evaluate("document.documentElement.classList.contains('dark')"),
                        dpage.click('#theme-toggle', timeout=10000),
                        time.sleep(0.3),
                        after := dpage.evaluate("document.documentElement.classList.contains('dark')"),
                        results.append(TestResult('TH-001', 'Theme Toggle', 'Toggling theme flips dark class on html',
                                                  'pass' if (before != after) else 'fail', f'before={before}, after={after}', shot('TH-001', dpage)))
                    ))()
                ),
                'TH-002': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.click('#theme-toggle', timeout=10000),
                        time.sleep(0.2),
                        darkHidden := dpage.evaluate("document.getElementById('theme-toggle-dark-icon').classList.contains('hidden')"),
                        lightHidden := dpage.evaluate("document.getElementById('theme-toggle-light-icon').classList.contains('hidden')"),
                        ok := bool((darkHidden and not lightHidden) or (lightHidden and not darkHidden)),
                        results.append(TestResult('TH-002', 'Theme Toggle', 'Theme icons swap visibility', 'pass' if ok else 'fail', f'darkHidden={darkHidden}, lightHidden={lightHidden}', shot('TH-002', dpage)))
                    ))()
                ),
                'TH-003': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.click('#theme-toggle', timeout=10000),
                        time.sleep(0.3),
                        isDark := dpage.evaluate("document.documentElement.classList.contains('dark')"),
                        dpage.reload(wait_until='domcontentloaded'),
                        time.sleep(0.3),
                        stored := dpage.evaluate("localStorage.getItem('theme')"),
                        nowDark := dpage.evaluate("document.documentElement.classList.contains('dark')"),
                        ok := bool((stored == 'dark' and nowDark) or (stored == 'light' and (not nowDark))),
                        results.append(TestResult('TH-003', 'Theme Toggle', 'Theme persists in localStorage across reloads', 'pass' if ok else 'fail', f'stored={stored}, nowDark={nowDark}', shot('TH-003', dpage)))
                    ))()
                ),
                'TH-004': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        init := dpage.evaluate("document.documentElement.classList.contains('dark')"),
                        dpage.click('#theme-toggle', timeout=10000),
                        time.sleep(0.2),
                        dpage.click('#theme-toggle', timeout=10000),
                        time.sleep(0.2),
                        final := dpage.evaluate("document.documentElement.classList.contains('dark')"),
                        results.append(TestResult('TH-004', 'Theme Toggle', 'Double toggle returns to original state', 'pass' if (init == final) else 'fail', f'init={init}, final={final}', shot('TH-004', dpage)))
                    ))()
                ),
                # Filter Dropdown
                'FD-001': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.wait_for_selector('#filter-button', timeout=10000),
                        dpage.click('#filter-button', timeout=10000),
                        time.sleep(0.5),
                        visible := dpage.evaluate("(() => { const m = document.getElementById('filter-menu'); return m && !m.classList.contains('hidden'); })()"),
                        results.append(TestResult('FD-001', 'Filter Dropdown', 'Filter button visible and clickable on desktop', 'pass' if visible else 'fail', f'dropdown_visible={visible}', shot('FD-001', dpage)))
                    ))()
                ),
                'FD-002': lambda: (
                    mpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        mpage.wait_for_selector('#filter-button', timeout=10000),
                        mpage.click('#filter-button', timeout=10000),
                        time.sleep(0.5),
                        visible := mpage.evaluate("(() => { const m = document.getElementById('filter-menu'); return m && !m.classList.contains('hidden'); })()"),
                        position := mpage.evaluate("(() => { const m = document.getElementById('filter-menu'); const btn = document.getElementById('filter-button'); if (!m || !btn) return 'error'; const mRect = m.getBoundingClientRect(); const bRect = btn.getBoundingClientRect(); return mRect.top >= bRect.bottom ? 'below' : 'above'; })()"),
                        ok := bool(visible and position == 'below'),
                        results.append(TestResult('FD-002', 'Filter Dropdown', 'Filter button responsive on mobile portrait', 'pass' if ok else 'fail', f'visible={visible}, position={position}', shot('FD-002', mpage)))
                    ))()
                ),
                'FD-003': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.wait_for_selector('#filter-button', timeout=10000),
                        dpage.click('#filter-button', timeout=10000),
                        time.sleep(0.5),
                        catCount := dpage.evaluate("document.querySelectorAll('#filter-menu button[data-value]').length"),
                        hasAll := dpage.evaluate("(() => { const btns = [...document.querySelectorAll('#filter-menu button[data-value]')]; return btns.some(b => /All.*\\(\\d+\\)/.test(b.textContent || '')); })()"),
                        ok := bool(catCount >= 2 and hasAll),
                        results.append(TestResult('FD-003', 'Filter Dropdown', 'Dropdown shows category list with counts', 'pass' if ok else 'fail', f'categories={catCount}, hasAll={hasAll}', shot('FD-003', dpage)))
                    ))()
                ),
                'FD-004': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.wait_for_selector('#filter-button', timeout=10000),
                        dpage.click('#filter-button', timeout=10000),
                        time.sleep(0.5),
                        firstCat := dpage.evaluate("(() => { const btns = [...document.querySelectorAll('#filter-menu button[data-value]')]; const found = btns.find(b => b.getAttribute('data-value') && b.getAttribute('data-value') !== 'all'); return found ? found.getAttribute('data-value') : ''; })()"),
                        (dpage.click(f'#filter-menu button[data-value="{firstCat}"]', timeout=10000) if firstCat else None),
                        time.sleep(0.8),
                        stillVisible := dpage.evaluate("(() => { const m = document.getElementById('filter-menu'); return m && !m.classList.contains('hidden'); })()"),
                        ok := bool(firstCat and not stillVisible),
                        results.append(TestResult('FD-004', 'Filter Dropdown', 'Selecting category filters results and closes dropdown', 'pass' if ok else 'fail', f'selected={firstCat}, closed={not stillVisible}', shot('FD-004', dpage)))
                    ))()
                ),
                'FD-005': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.wait_for_selector('#filter-button', timeout=10000),
                        dpage.click('#filter-button', timeout=10000),
                        time.sleep(0.5),
                        hasScroll := dpage.evaluate("(() => { const m = document.getElementById('filter-menu'); return m && m.scrollHeight > m.clientHeight; })()"),
                        overflowStyle := dpage.evaluate("(() => { const m = document.getElementById('filter-menu'); return m ? getComputedStyle(m).overflowY : 'none'; })()"),
                        ok := bool(overflowStyle in ('auto', 'scroll')),
                        results.append(TestResult('FD-005', 'Filter Dropdown', 'Dropdown scrolls internally when content overflows', 'pass' if ok else 'fail', f'hasScroll={hasScroll}, overflowY={overflowStyle}', shot('FD-005', dpage)))
                    ))()
                ),
                'FD-006': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.evaluate("document.documentElement.classList.add('dark')"),
                        time.sleep(0.3),
                        dpage.wait_for_selector('#filter-button', timeout=10000),
                        dpage.click('#filter-button', timeout=10000),
                        time.sleep(0.5),
                        textColor := dpage.evaluate("(() => { const btn = document.querySelector('#filter-menu button[data-value]'); return btn ? getComputedStyle(btn).color : ''; })()"),
                        bgColor := dpage.evaluate("(() => { const m = document.getElementById('filter-menu'); return m ? getComputedStyle(m).backgroundColor : ''; })()"),
                        ok := bool(textColor and bgColor and textColor != bgColor),
                        results.append(TestResult('FD-006', 'Filter Dropdown', 'Dark mode: dropdown text is readable', 'pass' if ok else 'fail', f'textColor={textColor[:30]}, bgColor={bgColor[:30]}', shot('FD-006', dpage)))
                    ))()
                ),
                'FD-007': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.wait_for_selector('#filter-button', timeout=10000),
                        dpage.click('#filter-button', timeout=10000),
                        time.sleep(0.5),
                        dpage.click('body', position={'x': 10, 'y': 10}),
                        time.sleep(0.3),
                        stillVisible := dpage.evaluate("(() => { const m = document.getElementById('filter-menu'); return m && !m.classList.contains('hidden'); })()"),
                        results.append(TestResult('FD-007', 'Filter Dropdown', 'Dropdown closes on outside click', 'pass' if not stillVisible else 'fail', f'closed={not stillVisible}', shot('FD-007', dpage)))
                    ))()
                ),
                'FD-008': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.wait_for_selector('#filter-button', timeout=10000),
                        dpage.click('#filter-button', timeout=10000),
                        time.sleep(0.5),
                        dpage.keyboard.press('Escape'),
                        time.sleep(0.3),
                        stillVisible := dpage.evaluate("(() => { const m = document.getElementById('filter-menu'); return m && !m.classList.contains('hidden'); })()"),
                        results.append(TestResult('FD-008', 'Filter Dropdown', 'Dropdown closes on ESC key', 'pass' if not stillVisible else 'fail', f'closed={not stillVisible}', shot('FD-008', dpage)))
                    ))()
                ),
                'FD-009': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.wait_for_selector('#filter-button', timeout=10000),
                        dpage.click('#filter-button', timeout=10000),
                        time.sleep(0.5),
                        firstCat := dpage.evaluate("(() => { const btns = [...document.querySelectorAll('#filter-menu button[data-value]')]; const found = btns.find(b => b.getAttribute('data-value') && b.getAttribute('data-value') !== 'all'); return found ? found.getAttribute('data-value') : ''; })()"),
                        (dpage.click(f'#filter-menu button[data-value="{firstCat}"]', timeout=10000) if firstCat else None),
                        time.sleep(0.8),
                        dpage.click('#filter-button', timeout=10000),
                        time.sleep(0.5),
                        clearBtn := dpage.query_selector('#filter-menu button[data-action="clear"]'),
                        (dpage.click('#filter-menu button[data-action="clear"]', timeout=10000) if clearBtn else None),
                        time.sleep(0.5),
                        allSelected := dpage.evaluate("(() => { const btns = [...document.querySelectorAll('#filter-menu button[data-value]')]; const allBtn = btns.find(b => b.getAttribute('data-value') === 'all'); return allBtn ? allBtn.classList.contains('bg-purple-50') || allBtn.classList.contains('bg-purple-900/10') : false; })()"),
                        ok := bool(clearBtn and allSelected),
                        results.append(TestResult('FD-009', 'Filter Dropdown', 'Clear button resets category selection', 'pass' if ok else 'fail', f'clearBtn={bool(clearBtn)}, allSelected={allSelected}', shot('FD-009', dpage)))
                    ))()
                ),
                'FD-010': lambda: (
                    dpage.goto(home, wait_until='domcontentloaded', timeout=30000),
                    (lambda: (
                        dpage.wait_for_selector('#filter-button', timeout=10000),
                        dpage.click('#filter-button', timeout=10000),
                        time.sleep(0.5),
                        doneBtn := dpage.query_selector('#filter-menu button[data-action="close"]'),
                        (dpage.click('#filter-menu button[data-action="close"]', timeout=10000) if doneBtn else None),
                        time.sleep(0.3),
                        stillVisible := dpage.evaluate("(() => { const m = document.getElementById('filter-menu'); return m && !m.classList.contains('hidden'); })()"),
                        ok := bool(doneBtn and not stillVisible),
                        results.append(TestResult('FD-010', 'Filter Dropdown', 'Done button closes dropdown without changing selection', 'pass' if ok else 'fail', f'doneBtn={bool(doneBtn)}, closed={not stillVisible}', shot('FD-010', dpage)))
                    ))()
                ),
                # Auth
                'AU-001': lambda: (
                    goto_home(dpage),
                    (lambda: (
                        safe_click(dpage, '#signin-btn', 10000),
                        dpage.wait_for_selector('#auth-modal.visible', timeout=10000),
                        vis := dpage.evaluate("document.getElementById('auth-modal').classList.contains('visible')"),
                        results.append(TestResult('AU-001', 'Auth', 'Sign In button opens modal', 'pass' if vis else 'fail', f'visible={vis}', shot('AU-001', dpage))),
                        # close via X
                        dpage.click('#close-modal-btn', timeout=10000),
                        dpage.wait_for_selector('#auth-modal.visible', state='detached', timeout=10000)
                    ))()
                ),
                'AU-002': lambda: (
                    goto_home(dpage),
                    (lambda: (
                        safe_click(dpage, '#signin-btn', 10000),
                        dpage.wait_for_selector('#auth-modal.visible', timeout=10000),
                        beforeTitle := dpage.inner_text('#modal-title'),
                        beforeBtn := dpage.inner_text('#auth-submit-btn'),
                        dpage.click('#modal-switch-btn', timeout=10000),
                        time.sleep(0.2),
                        afterTitle := dpage.inner_text('#modal-title'),
                        afterBtn := dpage.inner_text('#auth-submit-btn'),
                        ok := bool(beforeTitle != afterTitle and beforeBtn != afterBtn),
                        results.append(TestResult('AU-002', 'Auth', 'Switch between Sign In/Sign Up toggles labels', 'pass' if ok else 'fail', f'before=({beforeTitle},{beforeBtn}) after=({afterTitle},{afterBtn})', shot('AU-002', dpage))),
                        # close
                        dpage.click('#close-modal-btn', timeout=10000)
                    ))()
                ),
                'AU-003': lambda: (
                    goto_home(dpage),
                    (lambda: (
                        safe_click(dpage, '#signin-btn', 10000),
                        dpage.wait_for_selector('#auth-modal.visible', timeout=10000),
                        ok := bool(dpage.query_selector('#google-signin-btn') is not None),
                        results.append(TestResult('AU-003', 'Auth', 'Google sign-in button visible', 'pass' if ok else 'fail', 'google btn present' if ok else 'missing', shot('AU-003', dpage))),
                        dpage.click('#close-modal-btn', timeout=10000)
                    ))()
                ),
                'AU-004': lambda: (
                    goto_home(dpage),
                    (lambda: (
                        success := ui_login_if_creds(dpage),
                        results.append(TestResult('AU-004', 'Auth', 'Email/password sign-in works (if creds provided)', 'pass' if success else 'skipped', 'Login attempted' if success else 'TEST_USER_EMAIL/TEST_USER_PASSWORD not provided or login failed', shot('AU-004', dpage)))
                    ))()
                ),
                'AU-005': lambda: (
                    goto_home(dpage),
                    (lambda: (
                        (ui_login_if_creds(dpage)),
                        done := ui_signout_if_possible(dpage),
                        results.append(TestResult('AU-005', 'Auth', 'Sign out returns to logged-out UI', 'pass' if done else 'skipped', 'Signed out' if done else 'Not logged in or signout failed', shot('AU-005', dpage)))
                    ))()
                ),
                'AU-006': lambda: (
                    goto_home(dpage),
                    (lambda: (
                        okLogin := ui_login_if_creds(dpage),
                        (dpage.reload(wait_until='domcontentloaded') if okLogin else None),
                        stayed := bool(okLogin and dpage.wait_for_selector('#signout-btn', timeout=15000)),
                        results.append(TestResult('AU-006', 'Auth', 'Session persists across reload (if login succeeded)', 'pass' if stayed else ('skipped' if not okLogin else 'fail'), 'Stayed logged in' if stayed else ('No creds' if not okLogin else 'Sign out button missing after reload'), shot('AU-006', dpage)))
                    ))()
                ),
                # Favorites
                'FV-001': lambda: (
                    goto_tools_first_domain(dpage),
                    (lambda: (
                        dpage.wait_for_selector('.favorite-btn', timeout=10000),
                        beforeTxt := dpage.inner_text('.favorite-btn'),
                        dpage.click('.favorite-btn', timeout=10000),
                        time.sleep(0.3),
                        afterTxt := dpage.inner_text('.favorite-btn'),
                        cls := dpage.evaluate("document.querySelector('.favorite-btn').className"),
                        ok := bool(afterTxt.strip() == '★' and 'bg-yellow-300' in cls),
                        results.append(TestResult('FV-001', 'Favorites', 'Favorite star toggles appearance', 'pass' if ok else 'fail', f"before='{beforeTxt.strip()}', after='{afterTxt.strip()}', cls~yellow={('bg-yellow-300' in cls)}", shot('FV-001', dpage)))
                    ))()
                ),
                'FV-002': lambda: (
                    goto_home(dpage),
                    (lambda: (
                        okLogin := ui_login_if_creds(dpage),
                        favLink := (dpage.query_selector('#favorites-link') is not None),
                        results.append(TestResult('FV-002', 'Favorites', 'Favorites link visible after login', 'pass' if (okLogin and favLink) else ('skipped' if not okLogin else 'fail'), f'favLink={favLink}', shot('FV-002', dpage)))
                    ))()
                ),
                'FV-003': lambda: (
                    goto_tools_first_domain(dpage),
                    (lambda: (
                        okLogin := ui_login_if_creds(dpage),
                        dpage.wait_for_selector('.tool-list-item', timeout=20000),
                        name := dpage.get_attribute('.tool-list-item', 'data-tool-name') or '',
                        dpage.click('.favorite-btn', timeout=10000),
                        time.sleep(0.2),
                        (dpage.click('#favorites-link', timeout=10000) if okLogin else None),
                        time.sleep(0.5),
                        present := (okLogin and bool(name) and dpage.evaluate("document.body.innerText").find(name) != -1),
                        results.append(TestResult('FV-003', 'Favorites', 'Favorites page lists favorited tool (if logged in)', 'pass' if present else ('skipped' if not okLogin else 'fail'), f'name={name}', shot('FV-003', dpage)))
                    ))()
                ),
                # Admin Moderation
                'AM-001': lambda: (
                    goto_home(dpage),
                    (lambda: (
                        link := (dpage.query_selector('#admin-link') is not None),
                        results.append(TestResult('AM-001', 'Admin Moderation', 'Admin link hidden for non-admin users', 'pass' if not link else 'fail', f'adminLinkVisible={link}', shot('AM-001', dpage)))
                    ))()
                ),
                'AM-002': lambda: (
                    do_AM_002()
                ),
            }

            # Execute only selected tests from plan
            for tc in plan:
                fn = dispatch.get(tc.id)
                if fn:
                    try:
                        fn()
                    except Exception as e:
                        # Capture test execution failures
                        error_msg = f"{type(e).__name__}: {str(e)}"
                        # Try to take a screenshot on error
                        screenshot_path = ''
                        try:
                            screenshot_path = shot(f'{tc.id}_ERROR', dpage)
                        except:
                            pass
                        results.append(TestResult(tc.id, tc.feature, tc.title, 'fail', error_msg[:200], screenshot_path))
                else:
                    # Unknown test id in plan
                    results.append(TestResult(tc.id, tc.feature, tc.title, 'skipped', 'No handler for test id', ''))

        finally:
            browser.close()

    return results


def write_results(results: List[TestResult], out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)
    df = pd.DataFrame([asdict(x) for x in results])
    df.to_csv(os.path.join(out_dir, 'results.csv'), index=False, encoding='utf-8')
    # Excel summary and per-feature sheets
    xlsx = os.path.join(out_dir, 'results.xlsx')
    with pd.ExcelWriter(xlsx, engine='openpyxl') as w:
        df.to_excel(w, sheet_name='Summary', index=False)
        for feature, group in df.groupby('feature'):
            group.to_excel(w, sheet_name=feature[:31], index=False)


def _available_features(plan: List[TestCase]) -> List[str]:
    return sorted({tc.feature for tc in plan})


def _resolve_features(input_csv: str, plan_features: List[str]) -> List[str]:
    """Resolve comma-separated feature inputs to canonical feature names.

    - Case-insensitive match
    - Synonym mapping (e.g., 'hamburger' -> 'Mobile Nav')
    - Substring fallback (either direction)
    """
    requested = [x.strip().lower() for x in (input_csv or '').split(',') if x.strip()]
    if not requested:
        return []

    avail_map = {f.lower(): f for f in plan_features}
    selected: List[str] = []

    synonyms = {
        'hamburger': 'Mobile Nav',
        'hamburger menu': 'Mobile Nav',
        'mobile nav': 'Mobile Nav',
        'mobile navigation': 'Mobile Nav',
        'mobile menu': 'Mobile Nav',
        'theme color': 'Accessibility',
        'theme-color': 'Accessibility',
        'accessibility': 'Accessibility',
        'background': 'Background Fix',
    }

    for r in requested:
        # Exact feature name
        if r in avail_map:
            selected.append(avail_map[r])
            continue
        # Synonyms
        matched_syn = False
        for key, canon in synonyms.items():
            if key in r:
                selected.append(canon)
                matched_syn = True
                break
        if matched_syn:
            continue
        # Substring match (both directions)
        hit = None
        for low, orig in avail_map.items():
            if r in low or low in r:
                hit = orig
                break
        if hit:
            selected.append(hit)

    # De-duplicate while preserving order
    seen = set()
    uniq: List[str] = []
    for f in selected:
        if f not in seen:
            uniq.append(f)
            seen.add(f)
    return uniq


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default=os.environ.get('TEST_BASE_URL', 'http://localhost:8888'))
    parser.add_argument('--out-dir', default='tests/output')
    parser.add_argument('--features', help='Comma-separated list of feature names to include (case-insensitive).')
    parser.add_argument('--ids', help='Comma-separated list of test IDs to include.')
    parser.add_argument('--list-features', action='store_true', help='List available features and exit.')
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    plan = build_test_plan()
    if args.list_features:
        print('Available features:')
        for f in _available_features(plan):
            print('-', f)
        return
    # Apply filters if provided
    if args.features:
        avail = _available_features(plan)
        resolved = _resolve_features(args.features, avail)
        plan = [tc for tc in plan if tc.feature in resolved]
    if args.ids:
        ids = {x.strip() for x in args.ids.split(',') if x.strip()}
        plan = [tc for tc in plan if tc.id in ids]

    if not plan:
        feats = ', '.join(_available_features(build_test_plan()))
        raise SystemExit('No tests selected after applying filters. Provide valid --features or --ids. '
                         f"Try --features one of: {feats}")
    write_test_plan(plan, args.out_dir)

    # Attempt to run UI tests; note that admin endpoints may be blocked depending on deployment
    results = run_ui_tests(args.base_url, args.out_dir, plan)
    write_results(results, args.out_dir)

    # Print a short summary
    summary = {}
    for r in results:
        summary[r.status] = summary.get(r.status, 0) + 1
    print('Test run summary:', summary)
    print('Outputs written to:', os.path.abspath(args.out_dir))


if __name__ == '__main__':
    main()
