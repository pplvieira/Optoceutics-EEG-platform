# SSVEP Analysis Tool - Testing Guide

## Test Files Available

### 1. Test EDF File
- **Location**: `public/test_ssvep_recording.edf`
- **Duration**: 3 minutes (180 seconds)
- **Channels**: 8 (Fp1, Fp2, F3, F4, C3, C4, P3, P4)
- **Sampling Rate**: 256 Hz
- **SSVEP Frequencies**: Embedded at specific time periods

### 2. Test CSV Annotations
- **Location**: `public/test_ssvep_annotations.csv`
- **Format**: 
  ```csv
  experiment,start_time,duration,label
  Exp1,10.0,5.0,15Hz_stim
  Exp1,20.0,5.0,15Hz_stim
  Exp1,30.0,5.0,15Hz_stim
  Exp2,45.0,5.0,20Hz_stim
  Exp2,55.0,5.0,20Hz_stim
  Exp2,65.0,5.0,20Hz_stim
  Exp3,80.0,5.0,25Hz_stim
  Exp3,90.0,5.0,25Hz_stim
  Exp3,100.0,5.0,25Hz_stim
  Exp4,115.0,5.0,30Hz_stim
  Exp4,125.0,5.0,30Hz_stim
  Exp4,135.0,5.0,30Hz_stim
  ```

## Testing Steps

### Step 1: Access the Tool
1. Navigate to: `http://localhost:3002`
2. Click on the "SSVEP Tool" tab in the top navigation

### Step 2: Upload Test Files
1. **Upload EDF File**:
   - Drag and drop `test_ssvep_recording.edf` from the `public` folder
   - OR click "Browse Files" and select the file
   
2. **Upload CSV File**:
   - Drag and drop `test_ssvep_annotations.csv` from the `public` folder
   - OR click "Browse Files" and select the file

3. **Process Files**:
   - Click the "Process Files" button
   - Wait for Pyodide to load the Python libraries (first time only)

### Step 3: Synchronization
1. Review the session overview showing:
   - EDF Data: 180.0 seconds, 8 channels, 256 Hz
   - Annotations: 4 experiments, 12 total periods
   
2. **Choose synchronization**:
   - Click "Manual Sync" to specify an offset (try 0.0 for test files)
   - OR click "Skip Sync" to use annotations as-is

### Step 4: Manual Adjustments
1. Review the stimulation periods for each experiment
2. Fine-tune timing if needed (test files should work as-is)
3. Click "Proceed to Analysis"

### Step 5: Run Analysis
1. Click "Start Analysis" 
2. Wait for the analysis to complete:
   - Extracting stimulation periods
   - Computing PSD (Welch method)
   - Calculating SNR at target frequencies (15, 20, 25, 30 Hz)
   - Creating visualizations

### Step 6: Review Results
1. Check the summary cards showing:
   - Number of experiments analyzed
   - Total stimulation periods
   - Number of channels processed
   
2. Review detailed results for each experiment:
   - SNR values at different frequencies
   - Number of periods analyzed
   
3. View the SSVEP visualization plots:
   - Power Spectral Density plots
   - SNR at target frequencies
   
## Expected Results

### For Test Data
The synthetic test data should show:
- **Higher SNR** at the target frequencies during their respective experiments
- **15 Hz**: Strong response in Exp1
- **20 Hz**: Strong response in Exp2  
- **25 Hz**: Strong response in Exp3
- **30 Hz**: Strong response in Exp4
- **Posterior channels (P3, P4)** should show stronger SSVEP responses

### Troubleshooting

#### If you get "undefined is not valid JSON" error:
1. Check the browser console for detailed error messages
2. Ensure the Python file loaded correctly
3. Try refreshing the page and reloading Pyodide

#### If CSV parsing fails:
1. Verify the CSV format matches exactly:
   ```csv
   experiment,start_time,duration,label
   ```
2. Check for extra spaces or special characters
3. Ensure all numeric values are valid

#### If EDF loading fails:
1. The test EDF uses a simplified format
2. Real EDF files would use pyedflib (not available in browser)
3. The tool currently simulates EDF data for demonstration

## Customizing Test Data

### Create Your Own CSV
```csv
experiment,start_time,duration,label
MyExp1,5.0,3.0,custom_stim
MyExp1,15.0,3.0,custom_stim
MyExp2,25.0,4.0,different_stim
```

### Modify Sync Offset
- Try different sync offsets (e.g., 2.5 seconds) to see how it affects the analysis
- This simulates the real-world scenario where CSV timestamps don't align with EDF start time

## Real-World Usage Notes

1. **Real EDF Files**: In production, replace the `simulate_edf_data()` function with actual pyedflib loading
2. **Large Files**: The browser-based approach works well for files up to ~100MB
3. **Multiple Sessions**: The tool can handle multiple experiments per session
4. **Export Features**: Results can be exported as CSV/PDF (export buttons are ready for implementation)

## Performance Expectations

- **Pyodide Loading**: 10-30 seconds (first time only)
- **File Processing**: 1-5 seconds for test files
- **Analysis**: 5-15 seconds depending on data size
- **Visualization**: 2-5 seconds for plot generation