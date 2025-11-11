# Resutil Installation Test Results

## Test Date
November 11, 2024

## Wheel File Information
- **Location**: `public/pyodide-packages/resutil-0.4.0-py3-none-any.whl`
- **Size**: 1.9 MB
- **Version**: 0.4.0
- **Type**: Pure Python wheel (py3-none-any)

## Module Structure Verification

### ✓ Main Module
```
resutil/
├── __init__.py
├── _version.py (v0.4.0)
├── plotlib.py          # Contains set_oc_style() and set_oc_font()
├── siglib.py           # Signal processing utilities
├── bids.py             # BIDS format support
├── md_to_html.py       # Markdown conversion
├── fonts/              # Embedded font files
└── templates/          # Style files
```

### ✓ Plotlib Module (`resutil/plotlib.py`)
**Functions verified:**
- `set_oc_style(style: Path|str = None)` - Applies OC matplotlib style
- `set_oc_font(font: Path|str = None)` - Applies Montserrat font family

### ✓ Font Files (Montserrat family)
**Location**: `resutil/fonts/Montserrat/`
- Montserrat-Regular.ttf
- Montserrat-Bold.ttf
- Montserrat-Italic.ttf
- Montserrat-Light.ttf
- Montserrat-Medium.ttf
- Montserrat-SemiBold.ttf
- Montserrat-ExtraBold.ttf
- Montserrat-Black.ttf
- Variable font files
- All italic variants
- Total: 21 font files

### ✓ Style File
**Location**: `resutil/templates/_oc_style.mplstyle`
- Size: 25 KB
- Custom matplotlib rcParams configuration
- Optoceutics branding colors and styling

## Dependencies

### Required (will be installed)
- `matplotlib` - Already in Pyodide
- `markdown` - Pure Python, installs via micropip

### Optional (not needed for basic functionality)
- numpy - Already in Pyodide
- Other dependencies only needed for advanced features

## Installation Method

```javascript
// Install markdown dependency
await micropip.install(['markdown']);

// Install resutil from local wheel
await micropip.install('/pyodide-packages/resutil-0.4.0-py3-none-any.whl');

// Verify import
import resutil
from resutil import plotlib
```

## Usage in Code

```python
from resutil import plotlib

# Apply OC styling
plotlib.set_oc_style()  # Loads _oc_style.mplstyle
plotlib.set_oc_font()   # Loads Montserrat fonts

# Now create plots with matplotlib
import matplotlib.pyplot as plt
fig, ax = plt.subplots()
ax.plot([1, 2, 3], [1, 4, 9])
# Plot will use Optoceutics styling
```

## Code Updates Made

### 1. PyodideEDFProcessor.tsx
```typescript
// Install markdown + resutil
await micropip.install(['markdown']);
await micropip.install('/pyodide-packages/resutil-0.4.0-py3-none-any.whl');
```

### 2. fooof_analysis.py
```python
# Changed from:
import resutil
resutil.set_oc_style()

# To:
from resutil import plotlib
plotlib.set_oc_style()
```

### 3. PSD Analysis (PyodideEDFProcessor.tsx)
```python
# Same change in Python code block
from resutil import plotlib
plotlib.set_oc_style()
plotlib.set_oc_font()
```

## Expected Console Output

When Pyodide initializes:
```
Installing resutil (Optoceutics styling library)...
Markdown library installed
Resutil library installed from local wheel
✓ Resutil (v0.4.0) loaded successfully with plotlib module
```

When styling is applied:
```
Applied Optoceutics custom styling (resutil.plotlib)
```

## Verification Steps for User

1. Load the application in browser
2. Open browser console (F12)
3. Look for resutil installation messages
4. Load an EDF file
5. Check "Use Optoceutics Custom Styling" toggle
6. Run PSD or FOOOF analysis
7. Verify plot has:
   - Montserrat font
   - OC color scheme
   - Custom styling applied

## Troubleshooting

### If resutil fails to import:
- Check browser console for micropip errors
- Verify `/pyodide-packages/resutil-0.4.0-py3-none-any.whl` is accessible
- Check Network tab to see if wheel file loads (Status 200)

### If fonts don't apply:
- This is expected in Pyodide (browser limitations with font loading)
- Styling (colors, line widths, etc.) will still apply
- Font fallback will use browser defaults

### If styling doesn't apply:
- Check console for "Applied Optoceutics custom styling" message
- Verify toggle is checked before running analysis
- Check for Python exceptions in console

## Build Status

✅ **npm run build** - Succeeds with no errors
✅ **Module structure** - Verified correct
✅ **Dependencies** - Compatible with Pyodide
✅ **Import paths** - Updated correctly

## Summary

The resutil library (v0.4.0) is properly packaged and ready for use in Pyodide. All necessary files (fonts, styles, modules) are embedded in the wheel. Installation via micropip with local wheel should work without dependency issues.
