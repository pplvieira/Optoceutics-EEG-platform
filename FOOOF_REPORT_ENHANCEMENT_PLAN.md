# FOOOF Analysis & Report Enhancement Plan

## Overview
Enhance the Browser Python tab's report generation feature to:
1. Allow selection of multiple analysis plots (not just last PSD)
2. Enable custom ordering of selected plots
3. Add resutil styling toggle for plots
4. Insert all selected plots sequentially in the DOCX report

---

## Current Implementation Analysis

### Report Generation Flow
**File**: `app/services/pdfExporter.ts`
- Uses `python-docx` library to edit template
- Loads `Customer Report Template.docx` from `/public`
- Replaces placeholders (Date, Session Number)
- **Currently**: Only inserts the LAST PSD plot (`psdPlotBase64`)
- Inserts plot after "During 40 Hz Visual Stimulation with EVY Light" section
- Returns DOCX file for download

### Current Data Structure
```typescript
interface PatientReportData {
  // ... patient info ...
  psdPlotBase64?: string;  // ← SINGLE plot only
}
```

### Current Selection Logic
**File**: `app/components/PyodideEDFProcessor.tsx:2683`
```typescript
// Find the LAST (most recent) PSD analysis result
const psdResults = analysisResults.filter(r => r.analysis_type === 'psd');
const psdResult = psdResults.length > 0 ? psdResults[psdResults.length - 1] : null;
```

---

## Phase 1: Plot Selection UI

### 1.1 Add State for Plot Selection
**Location**: `PyodideEDFProcessor.tsx` (around line 100)

```typescript
// New state for report configuration
const [selectedPlotsForReport, setSelectedPlotsForReport] = useState<string[]>([]);
const [plotSelectionOrder, setPlotSelectionOrder] = useState<string[]>([]);
```

### 1.2 Create Plot Selection Interface
**Location**: Below analysis tools, before report generation button

```typescript
{/* Plot Selection for Report */}
<div className="bg-white rounded-lg shadow-lg p-6 mb-6">
  <h3 className="text-lg font-bold mb-4">📊 Select Plots for Report</h3>

  <div className="space-y-2">
    {analysisResults.map((result, index) => {
      const plotId = `${result.analysis_type}_${index}`;
      const isSelected = selectedPlotsForReport.includes(plotId);

      return (
        <div key={plotId} className="flex items-center justify-between p-3 bg-gray-50 rounded">
          <div className="flex items-center">
            <input
              type="checkbox"
              id={plotId}
              checked={isSelected}
              onChange={(e) => handlePlotSelection(plotId, e.target.checked)}
              className="mr-3 h-4 w-4"
            />
            <label htmlFor={plotId} className="font-medium">
              {result.analysis_type.toUpperCase()} -
              {result.time_frame ?
                ` (${result.time_frame.start.toFixed(1)}s - ${result.time_frame.end.toFixed(1)}s)` :
                ' Full Duration'}
            </label>
          </div>

          {isSelected && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                Order: {plotSelectionOrder.indexOf(plotId) + 1}
              </span>
              <button onClick={() => movePlotUp(plotId)}>↑</button>
              <button onClick={() => movePlotDown(plotId)}>↓</button>
            </div>
          )}
        </div>
      );
    })}
  </div>

  {selectedPlotsForReport.length === 0 && (
    <p className="text-sm text-gray-500 mt-2">
      No plots selected. The report will include the most recent PSD plot by default.
    </p>
  )}
</div>
```

### 1.3 Add Selection Handlers
```typescript
const handlePlotSelection = (plotId: string, selected: boolean) => {
  if (selected) {
    setSelectedPlotsForReport(prev => [...prev, plotId]);
    setPlotSelectionOrder(prev => [...prev, plotId]);
  } else {
    setSelectedPlotsForReport(prev => prev.filter(id => id !== plotId));
    setPlotSelectionOrder(prev => prev.filter(id => id !== plotId));
  }
};

const movePlotUp = (plotId: string) => {
  setPlotSelectionOrder(prev => {
    const index = prev.indexOf(plotId);
    if (index <= 0) return prev;
    const newOrder = [...prev];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    return newOrder;
  });
};

const movePlotDown = (plotId: string) => {
  setPlotSelectionOrder(prev => {
    const index = prev.indexOf(plotId);
    if (index < 0 || index >= prev.length - 1) return prev;
    const newOrder = [...prev];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    return newOrder;
  });
};
```

---

## Phase 2: Resutil Styling Toggle

### 2.1 Add Styling State
```typescript
const [useResutilStyle, setUseResutilStyle] = useState(false);
```

### 2.2 Add Toggle UI
**Location**: Top of analysis tools section

```typescript
<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
  <div className="flex items-center justify-between">
    <div>
      <h4 className="font-semibold text-blue-900 mb-1">🎨 Plot Styling</h4>
      <p className="text-sm text-blue-700">
        Choose between default Matplotlib styling or custom Optoceutics styling
      </p>
    </div>
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-gray-700">
        {useResutilStyle ? 'Optoceutics Style' : 'Default Matplotlib'}
      </span>
      <button
        onClick={() => setUseResutilStyle(!useResutilStyle)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          useResutilStyle ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            useResutilStyle ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  </div>
</div>
```

### 2.3 Update Python Analysis Functions

#### Install resutil in Pyodide Setup
**Location**: `PyodideEDFProcessor.tsx` initialization (around line 220)

```typescript
// Install resutil library for custom styling
try {
  setLoadingMessage('Installing resutil for plot styling...');
  const micropip = pyodide.pyimport("micropip");
  await micropip.install(['resutil']);
  setLoadingMessage('resutil installed successfully');
  console.log('resutil installed');
} catch (error) {
  console.warn('resutil installation failed:', error);
  setLoadingMessage('resutil not available - using default styling');
}
```

#### Add Styling Setup Code
**Location**: Python environment setup (after imports)

```python
# Try to import resutil for custom styling
RESUTIL_AVAILABLE = False
try:
    from resutil import plotlib
    from resutil.plotlib import set_oc_font, set_oc_style, _plot_figure
    RESUTIL_AVAILABLE = True
    print("resutil library available for custom plot styling")
except ImportError:
    print("resutil library not available - using default matplotlib styling")
```

#### Create Styling Wrapper Function
```python
def apply_plot_styling(use_resutil=False):
    """
    Apply plot styling based on user preference

    Parameters:
    -----------
    use_resutil : bool
        If True, apply Optoceutics custom styling using resutil
        If False, use default matplotlib styling
    """
    if use_resutil and RESUTIL_AVAILABLE:
        try:
            set_oc_style()
            set_oc_font()
            print("Applied Optoceutics (resutil) styling to plots")
        except Exception as e:
            print(f"Failed to apply resutil styling: {e}")
            print("Falling back to default matplotlib styling")
    else:
        # Use default matplotlib styling
        plt.style.use('default')
        print("Using default matplotlib styling")
```

#### Update Analysis Functions
Modify each analysis function (PSD, FOOOF, SNR, etc.) to call styling before plotting:

```python
def analyze_psd(edf_reader, parameters):
    # ... existing parameter extraction ...

    # Apply styling
    use_resutil = parameters.get('use_resutil_style', False)
    apply_plot_styling(use_resutil)

    # Create figure
    fig, ax = plt.subplots(figsize=(10, 6))

    # ... rest of analysis ...
```

Same for `analyze_fooof`, `analyze_snr`, etc.

### 2.4 Pass Styling Parameter
Update `runTraditionalAnalysis` to include styling preference:

```typescript
const runTraditionalAnalysis = async (analysisType: string) => {
  // ... existing code ...

  let parameters;
  if (analysisType === 'psd') {
    parameters = {
      ...analysisParams.psd,
      ...advancedPSDSettings,
      use_resutil_style: useResutilStyle  // ← Add this
    };
  } else if (analysisType === 'fooof') {
    parameters = {
      ...fooofParams,
      use_resutil_style: useResutilStyle  // ← Add this
    };
  }
  // ... etc for other analysis types
```

---

## Phase 3: Enhanced Report Data Structure

### 3.1 Update Interface
**File**: `app/services/pdfExporter.ts`

```typescript
export interface PatientReportData {
  // ... existing fields ...

  // Enhanced multi-plot support
  plots: Array<{
    type: string;           // 'psd', 'fooof', 'snr', etc.
    plotBase64: string;     // Base64 encoded PNG
    timeFrame?: {
      start: number;
      end: number;
    };
    parameters: Record<string, any>;
    caption: string;        // Auto-generated caption
  }>;

  // Deprecated (kept for backward compatibility)
  psdPlotBase64?: string;
}
```

### 3.2 Update prepareReportData Function
```typescript
const prepareReportData = (): PatientReportData | null => {
  if (!metadata || !currentFile) {
    return null;
  }

  // Prepare plots array based on user selection
  const plots = plotSelectionOrder.map(plotId => {
    const [analysisType, indexStr] = plotId.split('_');
    const index = parseInt(indexStr);
    const result = analysisResults[index];

    if (!result || !result.plot_base64) {
      return null;
    }

    // Generate caption
    let caption = `${analysisType.toUpperCase()} Analysis`;
    if (result.time_frame) {
      caption += ` (${result.time_frame.start.toFixed(1)}s - ${result.time_frame.end.toFixed(1)}s)`;
    }
    if (result.parameters) {
      if (result.parameters.method) {
        caption += ` - ${result.parameters.method.charAt(0).toUpperCase() + result.parameters.method.slice(1)} Method`;
      }
      if (result.parameters.freq_range) {
        caption += ` - ${result.parameters.freq_range[0]}-${result.parameters.freq_range[1]} Hz`;
      }
    }

    return {
      type: analysisType,
      plotBase64: result.plot_base64,
      timeFrame: result.time_frame,
      parameters: result.parameters || {},
      caption
    };
  }).filter(Boolean);

  // If no plots selected, use the last PSD plot (backward compatibility)
  if (plots.length === 0) {
    const psdResults = analysisResults.filter(r => r.analysis_type === 'psd');
    const psdResult = psdResults.length > 0 ? psdResults[psdResults.length - 1] : null;

    if (psdResult && psdResult.plot_base64) {
      plots.push({
        type: 'psd',
        plotBase64: psdResult.plot_base64,
        timeFrame: psdResult.time_frame,
        parameters: psdResult.parameters || {},
        caption: 'PSD Analysis - Most Recent'
      });
    }
  }

  return {
    // ... existing patient/file data ...
    plots,
    psdPlotBase64: plots[0]?.plotBase64 // For backward compatibility
  };
};
```

---

## Phase 4: Update DOCX Generation

### 4.1 Modify Python Code
**File**: `app/services/pdfExporter.ts` - Update `generatePatientReportDOCX`

Pass plots array to Python:
```typescript
pyodide.globals.set('plots_data', JSON.stringify(reportData.plots));
```

Update Python generation function:
```python
def generate_patient_report_docx():
    try:
        # ... existing template loading ...

        # Parse plots data
        import json
        plots = json.loads(plots_data) if plots_data else []

        print(f"Inserting {len(plots)} plot(s)...")

        # Find insertion point
        insertion_index = None
        for i, paragraph in enumerate(doc.paragraphs):
            if 'During 40 Hz Visual Stimulation with EVY Light' in paragraph.text:
                insertion_index = i
                break

        if insertion_index is not None:
            # Insert each plot sequentially
            for plot_idx, plot in enumerate(plots):
                # Decode plot image
                img_data = base64.b64decode(plot['plotBase64'])
                img_buffer = io.BytesIO(img_data)

                # Get the insertion point
                if plot_idx == 0:
                    p = doc.paragraphs[insertion_index]._element
                else:
                    # Insert after the previous plot
                    p = doc.paragraphs[insertion_index + (plot_idx * 2)]._element

                # Add paragraph for image
                new_p = OxmlElement('w:p')
                p.addnext(new_p)

                # Center align and add image
                new_para = doc.paragraphs[insertion_index + (plot_idx * 2) + 1]
                new_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = new_para.add_run()
                run.add_picture(img_buffer, width=Inches(6))

                # Add caption below image
                caption_p = OxmlElement('w:p')
                new_p.addnext(caption_p)
                caption_para = doc.paragraphs[insertion_index + (plot_idx * 2) + 2]
                caption_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                caption_run = caption_para.add_run(plot['caption'])
                caption_run.font.size = Pt(10)
                caption_run.font.italic = True
                caption_run.font.color.rgb = RGBColor(100, 100, 100)

                # Add spacing
                caption_para.paragraph_format.space_after = Pt(12)

                print(f"Inserted plot {plot_idx + 1}: {plot['type']}")

        # ... rest of generation code ...
```

---

## Phase 5: Testing & Validation

### 5.1 Test Cases

1. **Single Plot (Default)**
   - Select no plots
   - Verify last PSD plot is included
   - Verify backward compatibility

2. **Multiple Plots Same Type**
   - Select 3 PSD analyses
   - Verify all appear in order
   - Verify correct captions

3. **Mixed Plot Types**
   - Select: PSD, FOOOF, SNR, Theta-Beta
   - Verify ordering
   - Verify captions reflect analysis type

4. **Custom Ordering**
   - Select 4 plots
   - Reorder using up/down buttons
   - Verify DOCX reflects new order

5. **Resutil Styling**
   - Toggle ON resutil styling
   - Run PSD analysis
   - Verify plot uses custom fonts/colors
   - Toggle OFF
   - Run another PSD analysis
   - Verify default matplotlib style

6. **Time Frame Variations**
   - Run analyses on different time frames
   - Select multiple
   - Verify captions show correct time ranges

### 5.2 Edge Cases

- No analysis results yet → Show warning
- Deselect all plots → Revert to default (last PSD)
- Very long analysis names → Truncate caption
- Plot image decode failure → Show placeholder
- Resutil not available → Graceful fallback

---

## Phase 6: UI/UX Enhancements

### 6.1 Visual Improvements

**Plot Preview Thumbnails**
```typescript
<div className="w-16 h-16 bg-gray-200 rounded overflow-hidden">
  {result.plot_base64 && (
    <img
      src={`data:image/png;base64,${result.plot_base64}`}
      alt="Plot thumbnail"
      className="w-full h-full object-cover"
    />
  )}
</div>
```

**Drag & Drop Reordering**
- Use `react-beautiful-dnd` or native HTML5 drag-drop
- Visual feedback during drag
- Smooth animations

**Plot Counter Badge**
```typescript
<div className="flex items-center gap-2">
  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">
    {selectedPlotsForReport.length}
  </span>
  <span>plots selected</span>
</div>
```

### 6.2 User Guidance

**Info Tooltips**
- Explain what each analysis type means
- Show example captions
- Explain ordering

**Quick Actions**
- "Select All PSD Analyses"
- "Select All FOOOF Analyses"
- "Clear Selection"
- "Reset Order"

---

## Implementation Priority

### High Priority (P0)
1. ✅ Multi-plot selection UI
2. ✅ Plot ordering (up/down buttons)
3. ✅ Updated report data structure
4. ✅ Multi-plot DOCX insertion

### Medium Priority (P1)
5. ✅ Resutil styling toggle
6. ✅ Apply styling to all analysis types
7. ⬜ Plot preview thumbnails
8. ⬜ Drag & drop reordering

### Low Priority (P2)
9. ⬜ Advanced caption customization
10. ⬜ Plot templates/presets
11. ⬜ Report template selection

---

## Files to Modify

### Core Implementation
1. `app/components/PyodideEDFProcessor.tsx`
   - Add plot selection state
   - Add resutil toggle state
   - Add selection UI
   - Update `prepareReportData()`
   - Update analysis functions with styling

2. `app/services/pdfExporter.ts`
   - Update `PatientReportData` interface
   - Update `generatePatientReportDOCX()` Python code
   - Handle multiple plots insertion

3. `public/fooof_analysis.py`
   - Add resutil imports
   - Add styling application
   - Maintain backward compatibility

### New Files (Optional)
4. `app/services/plotStyling.ts`
   - Centralize styling logic
   - Manage resutil availability

5. `app/components/PlotSelector.tsx`
   - Extract plot selection to component
   - Reusable for future features

---

## Resutil Integration Notes

### Expected Behavior
```python
from resutil import plotlib
from resutil.plotlib import set_oc_font, set_oc_style

# Set Optoceutics custom style
set_oc_style()   # Applies custom colors, line weights, backgrounds
set_oc_font()    # Applies custom font (likely company branding)

# Continue with normal matplotlib plotting
fig, ax = plt.subplots()
ax.plot(x, y)
# ... plot will use custom styling
```

### Fallback Strategy
If resutil functions are not documented, create wrapper functions:

```python
def set_oc_style():
    """Custom Optoceutics style for matplotlib"""
    # Set custom colors
    plt.rcParams['axes.prop_cycle'] = plt.cycler(color=[
        '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'  # Custom palette
    ])
    plt.rcParams['axes.facecolor'] = '#f8f9fa'
    plt.rcParams['figure.facecolor'] = 'white'
    plt.rcParams['grid.alpha'] = 0.3
    plt.rcParams['lines.linewidth'] = 2

def set_oc_font():
    """Custom Optoceutics font for matplotlib"""
    plt.rcParams['font.family'] = 'sans-serif'
    plt.rcParams['font.sans-serif'] = ['Arial', 'Helvetica', 'DejaVu Sans']
    plt.rcParams['font.size'] = 11
```

---

## Success Criteria

✅ User can select multiple analysis plots for report
✅ User can reorder selected plots
✅ Report DOCX includes all selected plots in order
✅ Each plot has descriptive caption
✅ User can toggle between matplotlib and resutil styling
✅ Styling applies to all analysis types
✅ Backward compatible (default behavior unchanged)
✅ No breaking changes to existing functionality

---

## Estimated Implementation Time

- **Phase 1 (Plot Selection)**: 4-6 hours
- **Phase 2 (Resutil Toggle)**: 3-4 hours
- **Phase 3 (Data Structure)**: 2-3 hours
- **Phase 4 (DOCX Generation)**: 3-4 hours
- **Phase 5 (Testing)**: 2-3 hours
- **Phase 6 (Polish)**: 2-3 hours

**Total**: ~16-23 hours

---

## Next Steps

1. ✅ Review and approve this plan
2. ⬜ Verify resutil availability and documentation
3. ⬜ Implement Phase 1 (Plot Selection UI)
4. ⬜ Implement Phase 2 (Resutil Toggle)
5. ⬜ Test with sample data
6. ⬜ Implement remaining phases
7. ⬜ Final integration testing
8. ⬜ User acceptance testing
