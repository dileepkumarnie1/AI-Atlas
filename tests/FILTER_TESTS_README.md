# Filter Dropdown Test Suite

## Overview
Comprehensive test suite with **22 test cases** (FD-001 to FD-010, FD-M01 to FD-M12) covering desktop and mobile functionality for the Filter Dropdown feature.

## Test Coverage

### Desktop Tests (10 tests)
- **FD-001**: Filter button visible and clickable on desktop
- **FD-003**: Dropdown shows category list with counts
- **FD-004**: Selecting category filters results and closes dropdown
- **FD-005**: Dropdown scrolls internally when content overflows
- **FD-006**: Dark mode text readability
- **FD-007**: Dropdown closes on outside click
- **FD-008**: Dropdown closes on ESC key
- **FD-009**: Clear button resets category selection
- **FD-010**: Done button closes dropdown without changing selection

### Mobile Tests (12 tests)
- **FD-002**: Filter button responsive on mobile portrait (375x667)
- **FD-M01**: Filter button tap registers immediately (no 300ms delay)
- **FD-M02**: Filter button z-index prevents tap blocking
- **FD-M03**: Dropdown positions below button on small screens
- **FD-M04**: Dropdown width fits viewport (no horizontal overflow)
- **FD-M05**: Touch scroll works inside dropdown (no page scroll)
- **FD-M06**: Category button tap registers (touch event handling)
- **FD-M07**: Backdrop tap closes dropdown
- **FD-M08**: Filter button and dropdown remain accessible in landscape
- **FD-M09**: Dropdown max-height respects viewport (no cut-off)
- **FD-M10**: Multi-touch doesn't cause multiple opens
- **FD-M11**: Pointer events don't leak through dropdown
- **FD-M12**: Filter persists after device orientation change

## Running the Tests

### Prerequisites
```bash
cd /workspaces/AI-Atlas
pip install -r tests/requirements.txt
python -m playwright install
```

### Run All Filter Tests
```bash
# Against deployed site
export TEST_BASE_URL="https://www.aitoolverse.ai"
python tests/run_ui_tests.py --features "Filter Dropdown"

# Against local dev server
export TEST_BASE_URL="http://localhost:8000"
python tests/run_ui_tests.py --features "Filter Dropdown"
```

### Run Specific Filter Test Cases
```bash
# Run only FD-001 and FD-002
python tests/run_ui_tests.py --ids "FD-001,FD-002"

# Run all mobile-specific tests (FD-002 + FD-M01 to FD-M12)
python tests/run_ui_tests.py --ids "FD-002,FD-M01,FD-M02,FD-M03,FD-M04,FD-M05,FD-M06,FD-M07,FD-M08,FD-M09,FD-M10,FD-M11,FD-M12"

# Run critical mobile tests only (P0 priority)
python tests/run_ui_tests.py --ids "FD-M01,FD-M02,FD-M05,FD-M06"

# Run Android Chrome tap responsiveness tests
python tests/run_ui_tests.py --ids "FD-M01,FD-M02,FD-M06,FD-M07"

# Run mobile viewport/layout tests
python tests/run_ui_tests.py --ids "FD-M03,FD-M04,FD-M08,FD-M09"
```

### List All Available Features
```bash
python tests/run_ui_tests.py --list-features
```

## Test Outputs
Results are saved to:
- `tests/output/test_plan.xlsx` - Full test plan with all cases
- `tests/output/test_plan.csv` - CSV version of test plan
- `tests/output/results.xlsx` - Test execution results
- `tests/output/results.csv` - CSV version of results
- `tests/output/screenshots/` - Screenshots for each test

## Priority Levels
- **P0** (Critical): FD-001, FD-002, FD-004, FD-M01, FD-M02, FD-M05, FD-M06
- **P1** (High): FD-003, FD-005, FD-007, FD-009, FD-M03, FD-M04, FD-M07, FD-M09, FD-M11
- **P2** (Medium): FD-006, FD-008, FD-010, FD-M08, FD-M10, FD-M12

## Test Scenarios Covered

### 1. Basic Functionality (FD-001, FD-002)
- Desktop and mobile button visibility
- Click responsiveness
- Dropdown positioning below button

### 2. Mobile Responsiveness & Touch (FD-M01 to FD-M12)
- **Tap Responsiveness**: Immediate tap registration without 300ms delay (FD-M01)
- **Z-index Hierarchy**: Prevents backdrop/overlay tap blocking (FD-M02)
- **Positioning**: Dropdown below button on portrait (FD-M03), landscape support (FD-M08)
- **Viewport Constraints**: Width fits screen (FD-M04), max-height <= 60vh (FD-M09)
- **Touch Scrolling**: Internal scroll with overscroll containment (FD-M05)
- **Touch Events**: Category button tap handling, backdrop tap-to-close (FD-M06, FD-M07)
- **Edge Cases**: Multi-touch debouncing (FD-M10), pointer-events isolation (FD-M11)
- **State Persistence**: Filter survives orientation changes (FD-M12)

### 3. Content Display (FD-003)
- Category list with counts format: "Name (count)"
- All categories option present

### 4. Interaction Flow (FD-004, FD-009, FD-010)
- Category selection closes dropdown
- Clear button resets to "All"
- Done button closes without changes

### 5. User Experience (FD-005, FD-006, FD-007, FD-008)
- Internal scrolling without page scroll
- Dark mode text contrast
- Outside click to close
- ESC key to close

## Known Issues to Watch For
- **Android Chrome Portrait**: Higher z-index required (100/101) - validated by FD-M02
- **Mobile Touch Events**: Uses touchstart/pointerdown/touchend for reliability - validated by FD-M01, FD-M06
- **Backdrop Interference**: pointer-events controlled to avoid blocking taps - validated by FD-M07, FD-M11
- **300ms Tap Delay**: Debouncing and preventDefault() used to eliminate ghost clicks - validated by FD-M01
- **Touch Scroll Leaking**: overscroll-behavior: contain prevents page scroll - validated by FD-M05
- **Viewport Overflow**: max-width: 90vw and max-height: 60vh constraints - validated by FD-M04, FD-M09

## Integration with CI/CD
```bash
# Example GitHub Actions workflow
- name: Run Filter Dropdown Tests
  run: |
    export TEST_BASE_URL="${{ secrets.STAGING_URL }}"
    python tests/run_ui_tests.py --features "Filter Dropdown"
    
- name: Upload Test Results
  uses: actions/upload-artifact@v3
  with:
    name: filter-test-results
    path: tests/output/
```

## Troubleshooting

### Filter button not responding in mobile tests
- Check z-index values (should be 100/101)
- Verify no overlapping elements (top carousel, etc.)
- Check pointer-events on backdrop

### Dropdown not scrolling
- Verify overflow-y: auto
- Check max-height constraint
- Ensure overscroll-behavior: contain

### Dark mode text not visible
- Verify color: var(--text-primary) inheritance
- Check background opacity (0.97)

## Debug Mode
Enable on-device debugging:
```bash
# Add ?debugFilter=1 to URL or in browser console:
localStorage.debugFilter = '1'
# Reload page to see debug overlay with event logs
```
