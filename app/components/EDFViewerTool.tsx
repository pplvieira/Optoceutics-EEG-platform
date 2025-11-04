'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';

// Pyodide types
interface PyodideModule {
  loadPackage: (packages: string[]) => Promise<void>;
  pyimport: (name: string) => PyodideMicropip;
  runPythonAsync: (code: string) => Promise<string>;
}

interface PyodideMicropip {
  install: (packages: string | string[]) => Promise<void>;
}

interface EDFMetadata {
  filename: string;
  duration: number;
  samplingRate: number;
  numChannels: number;
  channelNames: string[];
  recordingDate?: string;
  patientId?: string;
}

interface Annotation {
  time: number;
  duration: number;
  label: string;
  type: 'stimulus' | 'event' | 'marker';
}

interface SignalData {
  time: number[];
  channels: { [channelName: string]: number[] };
}

interface TimeSelection {
  start: number;
  end: number;
}

export default function EDFViewerTool() {
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<EDFMetadata | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [signalData, setSignalData] = useState<SignalData | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [timeSelection, setTimeSelection] = useState<TimeSelection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [viewportStart, setViewportStart] = useState(0);
  const [viewportDuration, setViewportDuration] = useState(30); // Show 30 seconds by default

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pyodideWorkerRef = useRef<PyodideModule | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineCanvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize Pyodide
  useEffect(() => {
    initializePyodide();
  }, []);

  const initializePyodide = async () => {
    setLoading(true);
    try {
      // Load Pyodide script if not already loaded
      if (!(window as Window & { loadPyodide?: unknown }).loadPyodide) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
        document.head.appendChild(script);

        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
        });
      }

      const loadPyodide = (window as Window & { loadPyodide: (config: { indexURL: string }) => Promise<PyodideModule> }).loadPyodide;
      const pyodide = await loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
      });

      // Install required packages
      await pyodide.loadPackage(['numpy', 'micropip']);
      const micropip = pyodide.pyimport('micropip');
      await micropip.install('reportlab');

      pyodideWorkerRef.current = pyodide;
      setPyodideReady(true);
      setError(null);
    } catch (err) {
      console.error('Failed to initialize Pyodide:', err);
      setError('Failed to initialize Python environment. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    const edfFile = droppedFiles.find(f =>
      f.name.toLowerCase().endsWith('.edf') || f.name.toLowerCase().endsWith('.bdf')
    );

    if (edfFile) {
      handleFileSelect(edfFile);
    } else {
      setError('Please drop a valid EDF or BDF file');
    }
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setLoading(true);
    setTimeSelection(null);

    try {
      // Parse EDF file
      const arrayBuffer = await selectedFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Parse metadata
      const parsedMetadata = parseEDFMetadata(uint8Array);
      setMetadata(parsedMetadata);

      // Auto-select first 4 channels or all if less than 4
      const channelsToSelect = parsedMetadata.channelNames.slice(0, Math.min(4, parsedMetadata.numChannels));
      setSelectedChannels(channelsToSelect);

      // Parse annotations from EDF
      const parsedAnnotations = parseEDFAnnotations(uint8Array, parsedMetadata);
      setAnnotations(parsedAnnotations);

      // Load signal data for initial viewport
      const signals = await loadSignalData(uint8Array, parsedMetadata, channelsToSelect, 0, viewportDuration);
      setSignalData(signals);

      setError(null);
    } catch (err) {
      console.error('Error processing EDF file:', err);
      setError('Failed to process EDF file. Please ensure it is a valid EDF/BDF file.');
    } finally {
      setLoading(false);
    }
  };

  const parseEDFMetadata = (data: Uint8Array): EDFMetadata => {
    const decoder = new TextDecoder('ascii');

    // Parse main header (256 bytes)
    // const version = decoder.decode(data.slice(0, 8)).trim();
    const patientId = decoder.decode(data.slice(8, 88)).trim();
    // const recordingId = decoder.decode(data.slice(88, 168)).trim();
    const startDate = decoder.decode(data.slice(168, 176)).trim();
    const startTime = decoder.decode(data.slice(176, 184)).trim();
    // const headerBytes = parseInt(decoder.decode(data.slice(184, 192)).trim());
    const numDataRecords = parseInt(decoder.decode(data.slice(236, 244)).trim());
    const recordDuration = parseFloat(decoder.decode(data.slice(244, 252)).trim());
    const numChannels = parseInt(decoder.decode(data.slice(252, 256)).trim());

    // Parse channel labels
    const channelLabelsStart = 256;
    const channelNames: string[] = [];
    for (let i = 0; i < numChannels; i++) {
      const label = decoder.decode(data.slice(channelLabelsStart + i * 16, channelLabelsStart + (i + 1) * 16)).trim();
      channelNames.push(label);
    }

    // Parse sampling rate (from number of samples per record)
    const samplesStart = 256 + numChannels * 216;
    const samplesPerRecord = parseInt(decoder.decode(data.slice(samplesStart, samplesStart + 8)).trim());
    const samplingRate = samplesPerRecord / recordDuration;

    const duration = numDataRecords * recordDuration;
    const filename = 'uploaded_file.edf';

    return {
      filename,
      duration,
      samplingRate,
      numChannels,
      channelNames,
      recordingDate: `${startDate} ${startTime}`,
      patientId,
    };
  };

  const parseEDFAnnotations = (data: Uint8Array, metadata: EDFMetadata): Annotation[] => {
    // EDF+ files have an annotations channel
    // For simplicity, we'll create some sample annotations
    // In a real implementation, you would parse the actual annotation channel
    const annotations: Annotation[] = [];

    // Look for "EDF Annotations" channel
    const annotationChannelIndex = metadata.channelNames.findIndex(
      name => name.toLowerCase().includes('annotation') || name.toLowerCase().includes('event')
    );

    if (annotationChannelIndex >= 0) {
      // Parse actual annotations from the annotation channel
      // This is a simplified version - real parsing would be more complex
      console.log('Found annotation channel at index:', annotationChannelIndex);
    }

    return annotations;
  };

  const loadSignalData = async (
    data: Uint8Array,
    metadata: EDFMetadata,
    channels: string[],
    startTime: number,
    duration: number
  ): Promise<SignalData> => {
    // This is a simplified signal loader
    // In production, you'd want to use pyedflib or similar
    const decoder = new TextDecoder('ascii');

    // const numDataRecords = parseInt(decoder.decode(data.slice(236, 244)).trim());
    // const recordDuration = parseFloat(decoder.decode(data.slice(244, 252)).trim());

    // Calculate which records to load
    // const startRecord = Math.floor(startTime / recordDuration);
    // const endRecord = Math.min(Math.ceil((startTime + duration) / recordDuration), numDataRecords);

    // For now, generate sample data
    // In production, parse actual signal data from the file
    const samplesPerSecond = metadata.samplingRate;
    const numSamples = Math.floor(duration * samplesPerSecond);

    const time: number[] = [];
    const channelData: { [channelName: string]: number[] } = {};

    for (let i = 0; i < numSamples; i++) {
      time.push(startTime + (i / samplesPerSecond));
    }

    channels.forEach(channelName => {
      channelData[channelName] = new Array(numSamples).fill(0).map(() =>
        Math.sin(2 * Math.PI * 10 * time[0]) * 50 + (Math.random() - 0.5) * 10
      );
    });

    return { time, channels: channelData };
  };

  // Draw signal visualization
  useEffect(() => {
    if (!canvasRef.current || !signalData || !metadata) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const channelHeight = height / selectedChannels.length;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i <= selectedChannels.length; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * channelHeight);
      ctx.lineTo(width, i * channelHeight);
      ctx.stroke();
    }

    // Draw time selection if exists
    if (timeSelection) {
      const startX = ((timeSelection.start - viewportStart) / viewportDuration) * width;
      const endX = ((timeSelection.end - viewportStart) / viewportDuration) * width;

      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.fillRect(startX, 0, endX - startX, height);

      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(startX, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(endX, 0);
      ctx.lineTo(endX, height);
      ctx.stroke();
    }

    // Draw signals
    selectedChannels.forEach((channelName, channelIdx) => {
      const channelSignal = signalData.channels[channelName];
      if (!channelSignal) return;

      const yOffset = channelIdx * channelHeight + channelHeight / 2;
      const yScale = channelHeight / 200; // Scale factor for signal amplitude

      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 1;
      ctx.beginPath();

      channelSignal.forEach((value, i) => {
        const x = (i / channelSignal.length) * width;
        const y = yOffset - value * yScale;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Draw channel label
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText(channelName, 10, yOffset - channelHeight / 2 + 15);
    });
  }, [signalData, selectedChannels, timeSelection, viewportStart, viewportDuration]);

  // Draw timeline with annotations
  useEffect(() => {
    if (!timelineCanvasRef.current || !metadata) return;

    const canvas = timelineCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw timeline
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Draw time markers
    const numMarkers = 10;
    ctx.fillStyle = '#aaa';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';

    for (let i = 0; i <= numMarkers; i++) {
      const x = (i / numMarkers) * width;
      const time = viewportStart + (i / numMarkers) * viewportDuration;

      ctx.beginPath();
      ctx.moveTo(x, height / 2 - 5);
      ctx.lineTo(x, height / 2 + 5);
      ctx.stroke();

      ctx.fillText(time.toFixed(1) + 's', x, height / 2 + 20);
    }

    // Draw annotations
    annotations.forEach(annotation => {
      if (annotation.time < viewportStart || annotation.time > viewportStart + viewportDuration) return;

      const x = ((annotation.time - viewportStart) / viewportDuration) * width;

      ctx.fillStyle = annotation.type === 'stimulus' ? '#ff6b6b' : '#4ecdc4';
      ctx.beginPath();
      ctx.arc(x, height / 2, 5, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(annotation.label, x, height / 2 - 10);
    });

    // Draw viewport indicator for full timeline
    if (metadata.duration > viewportDuration) {
      const viewportIndicatorHeight = 10;
      const viewportY = height - viewportIndicatorHeight - 5;

      ctx.fillStyle = '#333';
      ctx.fillRect(0, viewportY, width, viewportIndicatorHeight);

      const viewportWidth = (viewportDuration / metadata.duration) * width;
      const viewportX = (viewportStart / metadata.duration) * width;

      ctx.fillStyle = '#666';
      ctx.fillRect(viewportX, viewportY, viewportWidth, viewportIndicatorHeight);
    }
  }, [annotations, metadata, viewportStart, viewportDuration]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!metadata || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTime = viewportStart + (x / canvas.width) * viewportDuration;

    if (!timeSelection) {
      // Set start time
      setTimeSelection({ start: clickTime, end: clickTime });
    } else if (timeSelection.start === timeSelection.end) {
      // Set end time
      if (clickTime > timeSelection.start) {
        setTimeSelection({ ...timeSelection, end: clickTime });
      } else {
        setTimeSelection({ start: clickTime, end: timeSelection.start });
      }
    } else {
      // Reset selection
      setTimeSelection({ start: clickTime, end: clickTime });
    }
  };

  const handleChannelToggle = (channelName: string) => {
    setSelectedChannels(prev => {
      if (prev.includes(channelName)) {
        return prev.filter(c => c !== channelName);
      } else {
        return [...prev, channelName];
      }
    });
  };

  const handleZoomIn = () => {
    setViewportDuration(prev => Math.max(5, prev / 2));
  };

  const handleZoomOut = () => {
    if (!metadata) return;
    setViewportDuration(prev => Math.min(metadata.duration, prev * 2));
  };

  const handlePanLeft = () => {
    setViewportStart(prev => Math.max(0, prev - viewportDuration / 4));
  };

  const handlePanRight = () => {
    if (!metadata) return;
    setViewportStart(prev => Math.min(metadata.duration - viewportDuration, prev + viewportDuration / 4));
  };

  const generatePDFReport = async () => {
    if (!pyodideReady || !metadata || !file) {
      setError('Cannot generate PDF: Python environment not ready or no file loaded');
      return;
    }

    setGeneratingPDF(true);
    setError(null);

    try {
      const pyodide = pyodideWorkerRef.current;

      // Create Python code for PDF generation
      const pythonCode = `
import io
import base64
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from datetime import datetime

def generate_edf_report(metadata, time_selection, annotations):
    """Generate a comprehensive EDF analysis report"""

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch)
    story = []
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1a56db'),
        spaceAfter=30,
        alignment=TA_CENTER
    )

    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=16,
        textColor=colors.HexColor('#1a56db'),
        spaceAfter=12,
        spaceBefore=12
    )

    # Title
    title = Paragraph("EEG Analysis Report", title_style)
    story.append(title)
    story.append(Spacer(1, 0.3*inch))

    # Metadata Table
    story.append(Paragraph("Recording Information", heading_style))

    metadata_data = [
        ['Parameter', 'Value'],
        ['Filename', metadata['filename']],
        ['Duration', f"{metadata['duration']:.2f} seconds"],
        ['Sampling Rate', f"{metadata['samplingRate']:.2f} Hz"],
        ['Number of Channels', str(metadata['numChannels'])],
        ['Recording Date', metadata.get('recordingDate', 'N/A')],
        ['Patient ID', metadata.get('patientId', 'N/A')],
        ['Report Generated', datetime.now().strftime('%Y-%m-%d %H:%M:%S')]
    ]

    metadata_table = Table(metadata_data, colWidths=[2.5*inch, 3.5*inch])
    metadata_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a56db')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
    ]))

    story.append(metadata_table)
    story.append(Spacer(1, 0.3*inch))

    # Selected Time Range
    if time_selection:
        story.append(Paragraph("Selected Stimulation Data", heading_style))

        duration = time_selection['end'] - time_selection['start']
        time_data = [
            ['Parameter', 'Value'],
            ['Start Time', f"{time_selection['start']:.3f} seconds"],
            ['End Time', f"{time_selection['end']:.3f} seconds"],
            ['Duration', f"{duration:.3f} seconds"],
            ['Percentage of Recording', f"{(duration / metadata['duration']) * 100:.2f}%"]
        ]

        time_table = Table(time_data, colWidths=[2.5*inch, 3.5*inch])
        time_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#10b981')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.lightgreen),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ]))

        story.append(time_table)
        story.append(Spacer(1, 0.3*inch))

    # Annotations
    if annotations and len(annotations) > 0:
        story.append(Paragraph("Annotations", heading_style))

        ann_data = [['Time (s)', 'Duration (s)', 'Label', 'Type']]
        for ann in annotations:
            ann_data.append([
                f"{ann['time']:.3f}",
                f"{ann['duration']:.3f}",
                ann['label'],
                ann['type'].capitalize()
            ])

        ann_table = Table(ann_data, colWidths=[1.5*inch, 1.5*inch, 2*inch, 1.5*inch])
        ann_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f59e0b')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.lightyellow),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ]))

        story.append(ann_table)
        story.append(Spacer(1, 0.3*inch))

    # Channel Information
    story.append(PageBreak())
    story.append(Paragraph("Channel Information", heading_style))

    # Split channels into rows of 4
    channels = metadata['channelNames']
    channel_rows = [channels[i:i+4] for i in range(0, len(channels), 4)]

    channel_data = [['Channel #', 'Name', 'Channel #', 'Name', 'Channel #', 'Name', 'Channel #', 'Name']]

    for row_idx, row in enumerate(channel_rows):
        row_data = []
        for i in range(4):
            if i < len(row):
                ch_idx = row_idx * 4 + i
                row_data.extend([str(ch_idx + 1), row[i]])
            else:
                row_data.extend(['', ''])
        channel_data.append(row_data)

    channel_table = Table(channel_data, colWidths=[0.5*inch, 1.25*inch] * 4)
    channel_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#8b5cf6')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.lavender),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
    ]))

    story.append(channel_table)
    story.append(Spacer(1, 0.5*inch))

    # Summary
    story.append(Paragraph("Analysis Summary", heading_style))

    summary_text = f"""
    This report contains the EEG data analysis for the recording "{metadata['filename']}".
    The recording has a duration of {metadata['duration']:.2f} seconds with {metadata['numChannels']} channels
    sampled at {metadata['samplingRate']:.2f} Hz.
    """

    if time_selection:
        duration = time_selection['end'] - time_selection['start']
        summary_text += f"""<br/><br/>
        A specific time range has been selected for detailed analysis, spanning from
        {time_selection['start']:.3f}s to {time_selection['end']:.3f}s (duration: {duration:.3f}s).
        This represents {(duration / metadata['duration']) * 100:.2f}% of the total recording.
        """

    if annotations and len(annotations) > 0:
        summary_text += f"""<br/><br/>
        The recording contains {len(annotations)} annotations marking various events and stimuli
        throughout the recording period.
        """

    summary_para = Paragraph(summary_text, styles['Normal'])
    story.append(summary_para)

    # Build PDF
    doc.build(story)

    # Get PDF bytes
    pdf_bytes = buffer.getvalue()
    buffer.close()

    return pdf_bytes

# Execute
metadata_dict = ${JSON.stringify(metadata)}
time_selection_dict = ${timeSelection ? JSON.stringify(timeSelection) : 'None'}
annotations_list = ${JSON.stringify(annotations)}

pdf_bytes = generate_edf_report(metadata_dict, time_selection_dict, annotations_list)
pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
pdf_base64
`;

      const result = await pyodide.runPythonAsync(pythonCode);

      // Convert base64 to blob and download
      const byteCharacters = atob(result);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `eeg_report_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setError(null);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError('Failed to generate PDF report. Please try again.');
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setMetadata(null);
    setAnnotations([]);
    setSignalData(null);
    setSelectedChannels([]);
    setTimeSelection(null);
    setError(null);
    setViewportStart(0);
    setViewportDuration(30);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 text-blue-400">EDF Viewer & Report Generator</h1>
          <p className="text-gray-400">
            Drag and drop EDF files, visualize annotations, select stimulation data, and generate PDF reports
          </p>
        </div>

        {/* Status Messages */}
        {!pyodideReady && (
          <div className="mb-4 p-4 bg-yellow-900 border border-yellow-700 rounded-lg flex items-center">
            <span className="mr-2 text-2xl">⚠️</span>
            <span>Initializing Python environment...</span>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-900 border border-red-700 rounded-lg flex items-center">
            <span className="mr-2 text-2xl">❌</span>
            <span>{error}</span>
          </div>
        )}

        {/* File Upload Area */}
        {!file && (
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-900/20'
                : 'border-gray-600 hover:border-gray-500'
            }`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="mx-auto mb-4 text-6xl text-gray-400">📁</div>
            <p className="text-xl mb-2">Drag and drop your EDF file here</p>
            <p className="text-gray-400 mb-4">or</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
              disabled={loading || !pyodideReady}
            >
              Browse Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".edf,.bdf"
              onChange={handleFileInputChange}
              className="hidden"
            />
            <p className="text-sm text-gray-500 mt-4">Supported formats: EDF, BDF</p>
          </div>
        )}

        {/* Main Content */}
        {file && metadata && (
          <div className="space-y-6">
            {/* Metadata Card */}
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold mb-2 flex items-center">
                    <span className="mr-2 text-2xl">📄</span>
                    {metadata.filename}
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Duration:</span>
                      <span className="ml-2 font-medium">{metadata.duration.toFixed(2)}s</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Sampling Rate:</span>
                      <span className="ml-2 font-medium">{metadata.samplingRate.toFixed(2)} Hz</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Channels:</span>
                      <span className="ml-2 font-medium">{metadata.numChannels}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Recording Date:</span>
                      <span className="ml-2 font-medium">{metadata.recordingDate || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg flex items-center transition-colors"
                >
                  <span className="mr-2">🗑️</span>
                  Reset
                </button>
              </div>
            </div>

            {/* Channel Selection */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-xl font-bold mb-4">Select Channels to Display</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {metadata.channelNames.map((channelName) => (
                  <button
                    key={channelName}
                    onClick={() => handleChannelToggle(channelName)}
                    className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                      selectedChannels.includes(channelName)
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    {channelName}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeline with Annotations */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-xl font-bold mb-4">Timeline & Annotations</h3>
              <canvas
                ref={timelineCanvasRef}
                width={1000}
                height={100}
                className="w-full border border-gray-700 rounded"
              />
              <div className="mt-4 flex justify-between items-center">
                <div className="flex space-x-2">
                  <button
                    onClick={handlePanLeft}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded"
                    disabled={viewportStart === 0}
                  >
                    ← Pan Left
                  </button>
                  <button
                    onClick={handlePanRight}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded"
                    disabled={!metadata || viewportStart + viewportDuration >= metadata.duration}
                  >
                    Pan Right →
                  </button>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={handleZoomIn}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded flex items-center"
                  >
                    <span className="mr-1">🔍+</span>
                    Zoom In
                  </button>
                  <button
                    onClick={handleZoomOut}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded flex items-center"
                  >
                    <span className="mr-1">🔍−</span>
                    Zoom Out
                  </button>
                </div>
              </div>
            </div>

            {/* Signal Visualization */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-xl font-bold mb-4">
                Signal Visualization
                {timeSelection && timeSelection.start !== timeSelection.end && (
                  <span className="ml-4 text-sm font-normal text-blue-400">
                    Selected: {timeSelection.start.toFixed(3)}s - {timeSelection.end.toFixed(3)}s
                    ({(timeSelection.end - timeSelection.start).toFixed(3)}s)
                  </span>
                )}
              </h3>
              <p className="text-sm text-gray-400 mb-4">
                Click once to set start time, click again to set end time. Third click resets selection.
              </p>
              <canvas
                ref={canvasRef}
                width={1000}
                height={600}
                className="w-full border border-gray-700 rounded cursor-crosshair"
                onClick={handleCanvasClick}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-center space-x-4">
              <button
                onClick={generatePDFReport}
                disabled={generatingPDF || !pyodideReady}
                className="px-8 py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg font-medium text-lg flex items-center transition-colors"
              >
                <span className="mr-2 text-2xl">📥</span>
                {generatingPDF ? 'Generating PDF...' : 'Generate PDF Report'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
