# Filter Dropdown Test Suite

## Overview
Added 10 comprehensive test cases (FD-001 to FD-010) for the Filter Dropdown feature in `run_ui_tests.py`.

## Test Coverage

### Desktop Tests
- **FD-001**: Filter button visible and clickable on desktop
- **FD-003**: Dropdown shows category list with counts
- **FD-004**: Selecting category filters results and closes dropdown
- **FD-005**: Dropdown scrolls internally when content overflows
- **FD-006**: Dark mode text readability
- **FD-007**: Dropdown closes on outside click
- **FD-008**: Dropdown closes on ESC key
- **FD-009**: Clear button resets category selection
- **FD-010**: Done button closes dropdown without changing selection

### Mobile Tests
- **FD-002**: Filter button responsive on mobile portrait (375x667)

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

# Run mobile-specific test
python tests/run_ui_tests.py --ids "FD-002"
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
- **P0** (Critical): FD-001, FD-002, FD-004
- **P1** (High): FD-003, FD-005, FD-007, FD-009
- **P2** (Medium): FD-006, FD-008, FD-010

## Test Scenarios Covered

### 1. Basic Functionality (FD-001, FD-002)
- Desktop and mobile button visibility
- Click responsiveness
- Dropdown positioning below button

### 2. Content Display (FD-003)
- Category list with counts format: "Name (count)"
- All categories option present

### 3. Interaction Flow (FD-004, FD-009, FD-010)
- Category selection closes dropdown
- Clear button resets to "All"
- Done button closes without changes

### 4. User Experience (FD-005, FD-006, FD-007, FD-008)
- Internal scrolling without page scroll
- Dark mode text contrast
- Outside click to close
- ESC key to close

## Known Issues to Watch For
- **Android Chrome Portrait**: Higher z-index required (100/101)
- **Mobile Touch Events**: Uses touchstart/pointerdown/touchend for reliability
- **Backdrop Interference**: pointer-events controlled to avoid blocking taps

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
