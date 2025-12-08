# API Reference

## FastAPI Backend API

The local backend provides a RESTful API for EDF file processing and analysis.

**Base URL:** `http://localhost:8000`

---

## Endpoints

### 1. Root

**GET** `/`

Health check endpoint.

**Response:**
```json
{
  "message": "EDF Processing API",
  "status": "running"
}
```

---

### 2. Upload EDF File

**POST** `/upload`

Uploads an EDF/BDF file and extracts metadata.

**Request:**
- **Content-Type:** `multipart/form-data`
- **Body:**
  - `file`: File (EDF, BDF, or FIF format)

**Response:** `EDFMetadata`
```json
{
  "id": "uuid-string",
  "filename": "example.edf",
  "name": "example.edf",
  "file_size_mb": 12.5,
  "uploaded_at": "2024-12-01T10:30:00",
  "duration_seconds": 3600.0,
  "sampling_frequency": 256.0,
  "num_channels": 32,
  "channel_names": ["Fp1", "Fp2", "F3", "F4", ...],
  "is_processed": true,
  "processing_message": "Successfully processed 32 channels"
}
```

**Error Responses:**
- `400`: Invalid file format
- `500`: Processing error

**Example:**
```javascript
const formData = new FormData();
formData.append('file', edfFile);

const response = await axios.post('http://localhost:8000/upload', formData);
const metadata = response.data;
```

---

### 3. Get Channels

**GET** `/channels/{file_id}`

Retrieves channel information for an uploaded file.

**Path Parameters:**
- `file_id`: string (UUID) - File ID from upload response

**Response:**
```json
{
  "channel_names": ["Fp1", "Fp2", "F3", "F4", ...],
  "num_channels": 32,
  "sampling_frequency": 256.0
}
```

**Error Responses:**
- `404`: File not found
- `500`: Error reading file

**Example:**
```javascript
const response = await axios.get(`http://localhost:8000/channels/${fileId}`);
const channels = response.data;
```

---

### 4. Analyze EDF File

**POST** `/analyze`

Performs analysis on an uploaded EDF file.

**Request Body:**
```json
{
  "file_id": "uuid-string",
  "analysis_type": "psd",
  "parameters": {
    "fmin": 0.5,
    "fmax": 50,
    "channels": [0, 1, 2]
  }
}
```

**Analysis Types:**

#### `plot_raw`
Plot raw EEG signal.

**Parameters:**
```json
{
  "duration": 10,
  "start_time": 0,
  "channels": [0, 1, 2, 3]
}
```

**Response:**
```json
{
  "plot": "base64-encoded-png",
  "duration": 10,
  "start_time": 0,
  "channels_plotted": ["Fp1", "Fp2", "F3", "F4"],
  "analysis_type": "plot_raw"
}
```

#### `psd`
Power Spectral Density analysis.

**Parameters:**
```json
{
  "fmin": 0.5,
  "fmax": 50,
  "channels": [0]
}
```

**Response:**
```json
{
  "plot": "base64-encoded-png",
  "data": {
    "Fp1": {
      "frequencies": [0.5, 0.6, ...],
      "psd_values": [0.001, 0.002, ...]
    }
  },
  "parameters": {
    "fmin": 0.5,
    "fmax": 50,
    "channels": [0]
  },
  "analysis_type": "psd"
}
```

#### `snr`
Signal-to-Noise Ratio analysis.

**Parameters:**
```json
{
  "fmin": 1,
  "fmax": 40,
  "channels": [0]
}
```

**Response:**
```json
{
  "plot": "base64-encoded-png",
  "data": {
    "Fp1": {
      "frequencies": [1.0, 1.1, ...],
      "snr_values": [15.2, 14.8, ...]
    }
  },
  "parameters": {
    "fmin": 1,
    "fmax": 40,
    "channels": [0]
  },
  "analysis_type": "snr"
}
```

#### `theta_beta_ratio`
Theta/Beta ratio calculation.

**Parameters:**
```json
{
  "theta_min": 4,
  "theta_max": 7,
  "beta_min": 13,
  "beta_max": 30,
  "method": "welch"
}
```

**Response:**
```json
{
  "data": {
    "ratio": 2.5,
    "theta_power": 0.15,
    "beta_power": 0.06
  },
  "analysis_type": "theta_beta_ratio"
}
```

#### `time_frequency`
Time-frequency analysis (spectrogram).

**Parameters:**
```json
{
  "freq_min": 1,
  "freq_max": 50,
  "freq_points": 100,
  "time_points": 200,
  "duration": 10,
  "start_time": 0
}
```

**Response:**
```json
{
  "plot": "base64-encoded-png",
  "analysis_type": "time_frequency"
}
```

**Error Responses:**
- `404`: File not found
- `400`: Invalid analysis type or parameters
- `500`: Analysis error

**Example:**
```javascript
const response = await axios.post('http://localhost:8000/analyze', {
  file_id: fileId,
  analysis_type: 'psd',
  parameters: {
    fmin: 0.5,
    fmax: 50,
    channels: [0]
  }
});
const result = response.data;
```

---

### 5. SSVEP Analysis

**POST** `/analyze-ssvep`

Comprehensive SSVEP analysis including detection, PCA, and SNR.

**Request Body:**
```json
{
  "file_id": "uuid-string",
  "target_frequency": 40.0,
  "frequency_bands": [8, 12, 30, 100],
  "channels": ["O1", "O2", "Oz"],
  "pca_components": 5
}
```

**Parameters:**
- `file_id`: string (required) - File ID from upload
- `target_frequency`: number (default: 40.0) - Target SSVEP frequency in Hz
- `frequency_bands`: number[] (default: [8, 12, 30, 100]) - Frequency band boundaries
- `channels`: string[] | null (optional) - Specific channels to analyze. If null, auto-detects occipital channels
- `pca_components`: number | null (optional) - Number of PCA components for artifact removal

**Response:**
```json
{
  "target_frequency": 40.0,
  "channels_analyzed": ["O1", "O2", "Oz"],
  "sample_rate": 256.0,
  "analysis_timestamp": "2024-12-01T10:35:00",
  "ssvep_detection": {
    "O1": {
      "peak_power": 0.025,
      "snr_db": 8.5,
      "target_frequency": 40.0,
      "detection_confidence": "high"
    },
    "O2": {
      "peak_power": 0.020,
      "snr_db": 7.2,
      "target_frequency": 40.0,
      "detection_confidence": "high"
    },
    "Oz": {
      "peak_power": 0.018,
      "snr_db": 6.8,
      "target_frequency": 40.0,
      "detection_confidence": "medium"
    }
  },
  "pca_analysis": {
    "n_components": 5,
    "explained_variance_ratio": [0.45, 0.25, 0.15, 0.10, 0.05],
    "cumulative_variance": [0.45, 0.70, 0.85, 0.95, 1.0],
    "component_loadings": [[...], [...], ...],
    "channel_names": ["O1", "O2", "Oz"]
  },
  "frequency_analysis": {
    "O1": {
      "absolute_power": {
        "Delta": 0.15,
        "Theta": 0.20,
        "Alpha": 0.30,
        "Beta": 0.25,
        "Gamma": 0.10
      },
      "relative_power": {
        "Delta": 0.15,
        "Theta": 0.20,
        "Alpha": 0.30,
        "Beta": 0.25,
        "Gamma": 0.10
      }
    }
  },
  "snr_analysis": {
    "O1": {
      "signal_power": 0.025,
      "noise_power": 0.003,
      "snr_linear": 8.33,
      "snr_db": 8.5
    }
  },
  "visualization": "base64-encoded-png"
}
```

**Detection Confidence Levels:**
- `high`: SNR > 6 dB
- `medium`: SNR 3-6 dB
- `low`: SNR < 3 dB

**Error Responses:**
- `404`: File not found
- `400`: Invalid parameters
- `500`: Analysis error

**Example:**
```javascript
const response = await axios.post('http://localhost:8000/analyze-ssvep', {
  file_id: fileId,
  target_frequency: 40.0,
  frequency_bands: [8, 12, 30, 100],
  channels: null,  // Auto-detect occipital channels
  pca_components: 5
});
const ssvepResult = response.data;
```

---

### 6. Delete File

**DELETE** `/files/{file_id}`

Deletes an uploaded file and cleans up temporary storage.

**Path Parameters:**
- `file_id`: string (UUID) - File ID to delete

**Response:**
```json
{
  "message": "File deleted successfully"
}
```

**Error Responses:**
- `404`: File not found

**Example:**
```javascript
await axios.delete(`http://localhost:8000/files/${fileId}`);
```

---

### 7. List Files

**GET** `/files`

Lists all uploaded files in the current session.

**Response:**
```json
{
  "files": [
    {
      "file_id": "uuid-string-1",
      "path": "/tmp/temp_edf_123.edf",
      "size_mb": 12.5
    },
    {
      "file_id": "uuid-string-2",
      "path": "/tmp/temp_edf_456.edf",
      "size_mb": 8.3
    }
  ],
  "count": 2
}
```

**Example:**
```javascript
const response = await axios.get('http://localhost:8000/files');
const files = response.data.files;
```

---

## Error Handling

All endpoints may return error responses with the following format:

```json
{
  "detail": "Error message describing what went wrong"
}
```

**HTTP Status Codes:**
- `200`: Success
- `400`: Bad Request (invalid parameters)
- `404`: Not Found (file doesn't exist)
- `500`: Internal Server Error

---

## CORS Configuration

The API is configured to accept requests from:
- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `http://localhost:3001`
- `http://127.0.0.1:3001`

For production, update CORS settings in `python-backend/main.py`.

---

## Rate Limiting

Currently, there is no rate limiting implemented. For production use, consider adding rate limiting middleware.

---

## Timeout Settings

**Upload:** 120 seconds (2 minutes)  
**Analysis:** 300 seconds (5 minutes)  
**SSVEP Analysis:** 600 seconds (10 minutes)

These timeouts can be adjusted in the FastAPI configuration or client-side Axios settings.

---

## Session Management

Files are stored in temporary filesystem locations and are associated with the server session. Files are automatically cleaned up when:
- Explicitly deleted via DELETE endpoint
- Server restarts
- Session expires (implementation-dependent)

**Note:** The current implementation uses in-memory storage. Files are lost on server restart.

---

## Data Formats

### Supported File Formats
- **EDF** (European Data Format)
- **BDF** (BioSemi Data Format)
- **FIF** (MNE-Python format)

### Response Formats
- **JSON** for all API responses
- **Base64 PNG** for plot images
- **Multipart/form-data** for file uploads

---

## Authentication

Currently, there is no authentication implemented. The API is designed for local use only. For production deployment, implement authentication middleware.

---

**Last Updated:** December 2024

