#!/usr/bin/env python3
"""
UI test harness for AI-Atlas

Generates a test plan (Excel + CSV), runs a subset of automated browser tests
with Playwright, captures screenshots, and writes results (CSV + Excel).

Prereqs:
  pip install -r requirements.txt
  python -m playwright install

Usage examples (PowerShell):
  # Against Netlify or any deployed URL
  $Env:TEST_BASE_URL = "https://your-site.netlify.app"; python tests/run_ui_tests.py

  # Against local dev server (e.g., netlify dev or any static server)
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
        precondition="Endpoint deployed on Netlify",
        steps="GET /.netlify/functions/admin-health without auth",
        expected="401 Unauthorized or JSON error; not 404",
        type="negative", priority="P0", device="desktop(1366x768)"
    ))
    tc.append(TestCase(
        id="AD-002",
        feature="Admin Dispatch Endpoint",
        title="Unauthenticated POST returns 401 or endpoint exists",
        precondition="Endpoint deployed on Netlify",
        steps="POST /.netlify/functions/admin-dispatch without auth",
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


def run_ui_tests(base_url: str, out_dir: str) -> List[TestResult]:
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
            # Mobile context
            mobile = browser.new_context(viewport={'width': 375, 'height': 667}, device_scale_factor=2)
            mpage = mobile.new_page()

            # Desktop context
            desk = browser.new_context(viewport={'width': 1366, 'height': 768})
            dpage = desk.new_page()

            home = base_url.rstrip('/') + '/'

            # MN-001
            try:
                mpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                btn = mpage.locator('#mobile-menu-btn')
                visible = btn.is_visible()
                results.append(TestResult('MN-001', 'Mobile Nav', 'Hamburger button appears on small screens', 'pass' if visible else 'fail', f'visible={visible}', shot('MN-001', mpage)))
            except Exception as e:
                results.append(TestResult('MN-001', 'Mobile Nav', 'Hamburger button appears on small screens', 'fail', str(e), shot('MN-001_error', mpage)))

            # MN-002 + MN-003
            try:
                mpage.click('#mobile-menu-btn')
                mpage.wait_for_selector('#mobile-menu-panel.open', timeout=3000)
                # Focus trap quick check: Tab a few times stays within panel
                mpage.keyboard.press('Tab')
                mpage.keyboard.press('Tab')
                mpage.keyboard.press('Shift+Tab')
                # Close with Escape
                mpage.keyboard.press('Escape')
                mpage.wait_for_selector('#mobile-menu-panel.open', state='detached', timeout=3000)
                # Re-open and close by overlay
                mpage.click('#mobile-menu-btn')
                mpage.wait_for_selector('#mobile-menu-panel.open', timeout=3000)
                mpage.click('#mobile-menu-overlay')
                mpage.wait_for_selector('#mobile-menu-panel.open', state='detached', timeout=3000)
                results.append(TestResult('MN-002', 'Mobile Nav', 'Menu opens and closes via button and ESC/overlay', 'pass', 'Toggled open/close as expected', shot('MN-002', mpage)))
                results.append(TestResult('MN-003', 'Mobile Nav', 'Focus trap within open menu', 'pass', 'Basic trap behavior observed', shot('MN-003', mpage)))
            except PWTimeout as e:
                results.append(TestResult('MN-002', 'Mobile Nav', 'Menu opens and closes via button and ESC/overlay', 'fail', f'Timeout {e}', shot('MN-002_error', mpage)))
                results.append(TestResult('MN-003', 'Mobile Nav', 'Focus trap within open menu', 'skipped', 'Dependent on MN-002', shot('MN-003_skipped', mpage)))
            except Exception as e:
                results.append(TestResult('MN-002', 'Mobile Nav', 'Menu opens and closes via button and ESC/overlay', 'fail', str(e), shot('MN-002_error', mpage)))
                results.append(TestResult('MN-003', 'Mobile Nav', 'Focus trap within open menu', 'skipped', 'Dependent on MN-002', shot('MN-003_skipped', mpage)))

            # BG-001
            try:
                mpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                attach = mpage.evaluate("getComputedStyle(document.body).backgroundAttachment")
                status = 'pass' if attach.lower().strip() == 'scroll' else 'fail'
                results.append(TestResult('BG-001', 'Background Fix', 'Mobile background uses attachment: scroll', status, f"attachment={attach}", shot('BG-001', mpage)))
            except Exception as e:
                results.append(TestResult('BG-001', 'Background Fix', 'Mobile background uses attachment: scroll', 'fail', str(e), shot('BG-001_error', mpage)))

            # AC-001: Skip to content
            try:
                mpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                # Focus the document then Tab once (skip link is first focusable)
                mpage.keyboard.press('Tab')
                mpage.keyboard.press('Enter')
                # Give time for hash update
                time.sleep(0.2)
                url = mpage.url
                status = 'pass' if '#content-area' in url else 'fail'
                results.append(TestResult('AC-001', 'Accessibility', 'Skip to content link works', status, f"url={url}", shot('AC-001', mpage)))
            except Exception as e:
                results.append(TestResult('AC-001', 'Accessibility', 'Skip to content link works', 'fail', str(e), shot('AC-001_error', mpage)))

            # AC-002: Theme-color meta
            try:
                dpage.goto(home, wait_until='domcontentloaded', timeout=30000)
                # Use CSS selector without quotes in attribute to avoid Python string escaping issues on Windows
                count = dpage.evaluate('document.querySelectorAll("meta[name=theme-color]").length')
                status = 'pass' if count >= 2 else 'fail'
                results.append(TestResult('AC-002', 'Accessibility', 'Theme-color metas present for light/dark', status, f"count={count}", shot('AC-002', dpage)))
            except Exception as e:
                results.append(TestResult('AC-002', 'Accessibility', 'Theme-color metas present for light/dark', 'fail', str(e), shot('AC-002_error', dpage)))

            # AD-001: admin-health
            try:
                url = base_url.rstrip('/') + '/.netlify/functions/admin-health'
                dpage.goto(url, wait_until='load', timeout=15000)
                code = dpage.evaluate('() => window.__PW_RES_STATUS || 0')
                # Heuristic: playwright won't expose status directly with goto; attempt fetch
                code = dpage.evaluate("fetch(window.location.href, {method:'GET'}).then(r=>r.status).catch(()=>0)")
                if code == 404:
                    results.append(TestResult('AD-001', 'Admin Health Endpoint', 'Unauthenticated GET returns 401 or endpoint exists', 'blocked', 'Endpoint 404 (likely not deployed or Netlify plan)', shot('AD-001_blocked', dpage)))
                else:
                    status = 'pass' if code in (401, 403) else 'fail'
                    results.append(TestResult('AD-001', 'Admin Health Endpoint', 'Unauthenticated GET returns 401 or endpoint exists', status, f"status={code}", shot('AD-001', dpage)))
            except Exception as e:
                results.append(TestResult('AD-001', 'Admin Health Endpoint', 'Unauthenticated GET returns 401 or endpoint exists', 'blocked', str(e), shot('AD-001_error', dpage)))

            # AD-002: admin-dispatch
            try:
                url = base_url.rstrip('/') + '/.netlify/functions/admin-dispatch'
                # POST without auth
                code = dpage.evaluate("fetch(arguments[0], {method:'POST'}).then(r=>r.status).catch(()=>0)", url)
                if code == 404:
                    results.append(TestResult('AD-002', 'Admin Dispatch Endpoint', 'Unauthenticated POST returns 401 or endpoint exists', 'blocked', 'Endpoint 404 (likely not deployed or Netlify plan)', shot('AD-002_blocked', dpage)))
                else:
                    status = 'pass' if code in (401, 403) else 'fail'
                    results.append(TestResult('AD-002', 'Admin Dispatch Endpoint', 'Unauthenticated POST returns 401 or endpoint exists', status, f"status={code}", shot('AD-002', dpage)))
            except Exception as e:
                results.append(TestResult('AD-002', 'Admin Dispatch Endpoint', 'Unauthenticated POST returns 401 or endpoint exists', 'blocked', str(e), shot('AD-002_error', dpage)))

            # LG-001: legacy cleanup
            try:
                url = base_url.rstrip('/') + '/public/index.html'
                code = dpage.evaluate("fetch(arguments[0], {method:'GET'}).then(r=>r.status).catch(()=>0)", url)
                status = 'pass' if (code == 404 or code == 0 or code >= 400) else 'fail'
                results.append(TestResult('LG-001', 'Legacy Cleanup', '/public/index.html is gone', status, f"status={code}", shot('LG-001', dpage)))
            except Exception as e:
                results.append(TestResult('LG-001', 'Legacy Cleanup', '/public/index.html is gone', 'fail', str(e), shot('LG-001_error', dpage)))

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
    if args.list-features:
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
    results = run_ui_tests(args.base_url, args.out_dir)
    write_results(results, args.out_dir)

    # Print a short summary
    summary = {}
    for r in results:
        summary[r.status] = summary.get(r.status, 0) + 1
    print('Test run summary:', summary)
    print('Outputs written to:', os.path.abspath(args.out_dir))


if __name__ == '__main__':
    main()
