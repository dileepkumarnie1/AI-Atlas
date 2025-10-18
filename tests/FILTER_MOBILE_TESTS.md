# Filter Dropdown Mobile Test Cases - Quick Reference

## Mobile Test Coverage Matrix

| Test ID | Priority | Focus Area | What It Tests | Viewport |
|---------|----------|------------|---------------|----------|
| **FD-002** | P0 | Basic Mobile | Button responsive, dropdown positions below button | 375×667 Portrait |
| **FD-M01** | P0 | Tap Delay | Opens within 500ms, no 300ms tap delay | 375×667 Portrait |
| **FD-M02** | P0 | Z-index | Button z-index prevents tap blocking | 375×667 Portrait |
| **FD-M03** | P1 | Positioning | Dropdown top edge below button bottom | 375×667 Portrait |
| **FD-M04** | P1 | Width | Dropdown width ≤ 90vw, no horizontal overflow | 375×667 Portrait |
| **FD-M05** | P0 | Scroll | Internal scroll works, page stays stationary | 375×667 Portrait |
| **FD-M06** | P0 | Touch Events | Category tap registers, no double-tap needed | 375×667 Portrait |
| **FD-M07** | P1 | Backdrop | Backdrop tap closes dropdown | 375×667 Portrait |
| **FD-M08** | P2 | Landscape | Works in landscape orientation | 667×375 Landscape |
| **FD-M09** | P1 | Height | Max-height ≤ 60vh, doesn't exceed screen | 375×667 Portrait |
| **FD-M10** | P2 | Multi-touch | Rapid taps don't cause flickering | 375×667 Portrait |
| **FD-M11** | P1 | Pointer Events | Taps don't leak to underlying content | 375×667 Portrait |
| **FD-M12** | P2 | State | Filter persists after orientation change | 375×667→667×375 |

## Android Chrome Issues Mapped to Tests

### Issue: Filter button not responding to taps (Android Chrome Portrait)
**Root Causes:**
- Low z-index (filter button/container below other elements)
- Backdrop pointer-events blocking taps
- 300ms tap delay interference
- Touch events not properly handled

**Validation Tests:**
- ✅ **FD-M01** - Verifies < 500ms response time (no tap delay)
- ✅ **FD-M02** - Checks z-index values (button=101, container=100)
- ✅ **FD-M06** - Tests touchstart/tap event handling
- ✅ **FD-M07** - Validates backdrop pointer-events behavior

### Issue: Dropdown positioning problems
**Root Causes:**
- Fixed positioning without proper viewport calculation
- Mobile viewport constraints not respected
- Landscape mode not considered

**Validation Tests:**
- ✅ **FD-M03** - Verifies dropdown below button
- ✅ **FD-M04** - Checks width constraints (≤90vw)
- ✅ **FD-M08** - Tests landscape orientation
- ✅ **FD-M09** - Validates height constraints (≤60vh)

### Issue: Page scrolls when trying to scroll dropdown
**Root Causes:**
- Missing overscroll-behavior: contain
- Insufficient overflow-y settings
- Touch scroll not isolated to dropdown

**Validation Tests:**
- ✅ **FD-M05** - Checks overscroll-behavior and scrollability

### Issue: Multi-tap or ghost clicks
**Root Causes:**
- No debouncing on rapid taps
- Touch/click event duplication
- State management issues

**Validation Tests:**
- ✅ **FD-M10** - Tests rapid tap handling

### Issue: Taps on dropdown activate underlying content
**Root Causes:**
- Pointer-events not properly managed
- Z-index hierarchy incomplete
- Backdrop missing or not covering content

**Validation Tests:**
- ✅ **FD-M11** - Validates pointer-events isolation

## CSS Properties Validated by Tests

| CSS Property | Test ID | Expected Value | Why It Matters |
|--------------|---------|----------------|----------------|
| `z-index` (button) | FD-M02 | 101 | Ensures button above other controls |
| `z-index` (container) | FD-M02 | 100 | Prevents interference from lower layers |
| `z-index` (menu) | — | 1000 | Menu appears above all page content |
| `max-width` | FD-M04 | ≤90vw | Fits mobile viewport |
| `max-height` | FD-M09 | ≤60vh | Prevents off-screen content |
| `overscroll-behavior` | FD-M05 | contain | Prevents page scroll leak |
| `overflow-y` | FD-M05 | auto | Enables internal scrolling |
| `pointer-events` (backdrop) | FD-M07, FD-M11 | auto (when open) | Allows backdrop tap-to-close |
| `position` | FD-M03 | Positions below button | Proper dropdown placement |

## JavaScript Event Handling Validated

| Event Type | Test ID | What's Validated |
|------------|---------|------------------|
| `touchstart` | FD-M01, FD-M06 | Fast tap response, no delay |
| `pointerdown` | FD-M06 | Alternative touch handling |
| `touchend` | FD-M06 | Complete touch cycle |
| `click` | FD-M02, FD-M07 | Fallback for compatibility |
| Debouncing | FD-M10 | Prevents multiple opens |
| Event propagation | FD-M11 | Stops at dropdown layer |

## Running Test Suites by Issue Type

### Test Android Chrome Tap Issues
```bash
TEST_BASE_URL="https://dileepkumarnie1.github.io/AI-Atlas" \
python tests/run_ui_tests.py --ids "FD-M01,FD-M02,FD-M06,FD-M07"
```

### Test Mobile Layout/Viewport
```bash
python tests/run_ui_tests.py --ids "FD-M03,FD-M04,FD-M08,FD-M09"
```

### Test Touch Interactions
```bash
python tests/run_ui_tests.py --ids "FD-M05,FD-M06,FD-M07,FD-M11"
```

### Test Edge Cases
```bash
python tests/run_ui_tests.py --ids "FD-M10,FD-M12"
```

### Critical P0 Mobile Tests Only
```bash
python tests/run_ui_tests.py --ids "FD-002,FD-M01,FD-M02,FD-M05,FD-M06"
```

### Full Mobile Regression (13 tests)
```bash
python tests/run_ui_tests.py --ids "FD-002,FD-M01,FD-M02,FD-M03,FD-M04,FD-M05,FD-M06,FD-M07,FD-M08,FD-M09,FD-M10,FD-M11,FD-M12"
```

## Expected Test Results

### All Tests Should Pass When:
- ✅ `index.html` deployed with filter button implementation
- ✅ Z-index hierarchy: container=100, button=101, menu=1000
- ✅ Touch event handlers: touchstart, pointerdown, touchend
- ✅ CSS: overscroll-behavior: contain on dropdown
- ✅ CSS: max-width ≤ 90vw, max-height ≤ 60vh
- ✅ Backdrop pointer-events toggles with menu state
- ✅ 300ms debounce on button tap

### Common Failure Scenarios:
- ❌ **FD-M01 fails** → Tap delay still present (check debouncing)
- ❌ **FD-M02 fails** → Z-index too low (should be 100/101)
- ❌ **FD-M05 fails** → Missing overscroll-behavior: contain
- ❌ **FD-M06 fails** → Touch events not registered (add touchstart)
- ❌ **FD-M07 fails** → Backdrop pointer-events always none
- ❌ **FD-M11 fails** → Dropdown pointer-events = none (should be auto)

## Test Artifacts

Each test generates:
- **Screenshot**: `tests/output/screenshots/FD-M0X.png`
- **Result**: Pass/Fail status in `tests/output/results.xlsx`
- **Details**: Metric values (z-index, timing, dimensions) in results

## CI/CD Integration

The GitHub Actions workflow at `.github/workflows/feature-tests-only.yml` includes "Filter Dropdown" option which runs all 22 tests (10 desktop + 12 mobile).

**Workflow URL:**  
https://github.com/dileepkumarnie1/AI-Atlas/actions/workflows/feature-tests-only.yml

**To trigger:**
1. Go to Actions tab
2. Select "Feature/Functionality testing"
3. Click "Run workflow"
4. Choose "Filter Dropdown" from dropdown
5. Leave base_url empty (auto-derives Pages URL)
6. Click green "Run workflow" button

**Results available in:**
- Artifacts → `ui-test-artifacts-Filter Dropdown`
- Contains: results.xlsx, results.csv, screenshots/
