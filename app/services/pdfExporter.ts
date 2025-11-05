/**
 * PDF Exporter Service
 *
 * This service handles generation of patient reports by:
 * 1. Reading the Customer Report Template (docx or pdf)
 * 2. Inserting PSD plots into the appropriate sections
 * 3. Filling in patient information and analysis parameters
 * 4. Generating the final PDF for download
 */

export interface PatientReportData {
  // Patient Information
  patientName?: string;
  patientId?: string;
  dateOfBirth?: string;
  examDate?: string;

  // File Information
  fileName: string;
  recordingDate?: string;
  duration: number;
  samplingRate: number;
  numChannels: number;
  channelNames: string[];

  // Analysis Parameters
  selectedChannels: string[];
  timeFrame?: {
    start: number;
    end: number;
    start_real_time?: string;
    end_real_time?: string;
  };

  // PSD Analysis Results
  psdMethod: 'welch' | 'periodogram';
  frequencyRange: {
    min: number;
    max: number;
  };
  psdPlotBase64?: string; // Base64 encoded PNG image of the PSD plot

  // Additional metadata
  annotations?: Array<{
    time: number;
    type: string;
    description: string;
  }>;
}

/**
 * Generate a patient report PDF using Pyodide (browser-based Python)
 *
 * This function:
 * 1. Loads the Customer Report Template
 * 2. Uses reportlab to fill in the template
 * 3. Inserts the PSD plot in the "During 40 Hz Visual Stimulation with EVY Light" section
 * 4. Returns the PDF as a base64 string for download
 */
export async function generatePatientReportPDF(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pyodide: any,
  reportData: PatientReportData
): Promise<string> {

  // Check if template file exists
  // NOTE: Template files should be placed in /public/templates/
  // - Customer Report Template.docx OR
  // - Customer Report Template.pdf

  const pythonCode = `
import io
import base64
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from datetime import datetime

def generate_patient_report_pdf(report_data):
    """
    Generate a patient report PDF based on the Customer Report Template

    Args:
        report_data: Dictionary containing all patient and analysis information

    Returns:
        Base64 encoded PDF bytes
    """

    buffer = io.BytesIO()

    # Create PDF document (A4 size)
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=0.75*inch,
        bottomMargin=0.75*inch,
        leftMargin=0.75*inch,
        rightMargin=0.75*inch
    )

    # Container for PDF elements
    story = []

    # Get stylesheet
    styles = getSampleStyleSheet()

    # Custom styles matching the template
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1a56db'),
        spaceAfter=20,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )

    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1a56db'),
        spaceAfter=10,
        spaceBefore=15,
        fontName='Helvetica-Bold'
    )

    subheading_style = ParagraphStyle(
        'CustomSubHeading',
        parent=styles['Heading3'],
        fontSize=12,
        textColor=colors.HexColor('#333333'),
        spaceAfter=8,
        spaceBefore=10,
        fontName='Helvetica-Bold'
    )

    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#333333'),
        alignment=TA_JUSTIFY
    )

    # ===== TITLE =====
    title = Paragraph("EEG Analysis Report", title_style)
    story.append(title)
    story.append(Spacer(1, 0.3*inch))

    # ===== PATIENT INFORMATION =====
    story.append(Paragraph("Patient Information", heading_style))

    patient_data = [
        ['Field', 'Value'],
        ['Patient Name', report_data.get('patientName', 'N/A')],
        ['Patient ID', report_data.get('patientId', 'N/A')],
        ['Date of Birth', report_data.get('dateOfBirth', 'N/A')],
        ['Exam Date', report_data.get('examDate', datetime.now().strftime('%Y-%m-%d'))],
    ]

    patient_table = Table(patient_data, colWidths=[2*inch, 4*inch])
    patient_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a56db')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
    ]))

    story.append(patient_table)
    story.append(Spacer(1, 0.3*inch))

    # ===== RECORDING INFORMATION =====
    story.append(Paragraph("Recording Information", heading_style))

    recording_data = [
        ['Parameter', 'Value'],
        ['Filename', report_data.get('fileName', 'N/A')],
        ['Recording Date', report_data.get('recordingDate', 'N/A')],
        ['Duration', f"{report_data.get('duration', 0):.2f} seconds"],
        ['Sampling Rate', f"{report_data.get('samplingRate', 0):.2f} Hz"],
        ['Number of Channels', str(report_data.get('numChannels', 0))],
        ['Selected Channels', ', '.join(report_data.get('selectedChannels', []))],
    ]

    recording_table = Table(recording_data, colWidths=[2*inch, 4*inch])
    recording_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#10b981')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.lightgreen),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
    ]))

    story.append(recording_table)
    story.append(Spacer(1, 0.3*inch))

    # ===== ANALYSIS TIME FRAME =====
    if report_data.get('timeFrame'):
        story.append(Paragraph("Analysis Time Frame", heading_style))

        time_frame = report_data['timeFrame']
        time_data = [
            ['Parameter', 'Value'],
            ['Start Time', f"{time_frame.get('start', 0):.3f} seconds"],
            ['End Time', f"{time_frame.get('end', 0):.3f} seconds"],
            ['Duration', f"{time_frame.get('end', 0) - time_frame.get('start', 0):.3f} seconds"],
        ]

        if time_frame.get('start_real_time'):
            time_data.append(['Real-World Start', time_frame['start_real_time']])
        if time_frame.get('end_real_time'):
            time_data.append(['Real-World End', time_frame['end_real_time']])

        time_table = Table(time_data, colWidths=[2*inch, 4*inch])
        time_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f59e0b')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('BACKGROUND', (0, 1), (-1, -1), colors.lightyellow),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
        ]))

        story.append(time_table)
        story.append(Spacer(1, 0.3*inch))

    # ===== PSD ANALYSIS SECTION =====
    # This is where the plot goes for "During 40 Hz Visual Stimulation with EVY Light"
    story.append(PageBreak())
    story.append(Paragraph("Power Spectral Density Analysis", heading_style))
    story.append(Paragraph("During 40 Hz Visual Stimulation with EVY Light", subheading_style))

    # Analysis parameters
    psd_method = report_data.get('psdMethod', 'welch').capitalize()
    freq_range = report_data.get('frequencyRange', {})

    analysis_info = Paragraph(
        f"PSD computed using {psd_method} method. "
        f"Frequency range: {freq_range.get('min', 0)}-{freq_range.get('max', 100)} Hz. "
        f"Analysis performed on channels: {', '.join(report_data.get('selectedChannels', []))}.",
        normal_style
    )
    story.append(analysis_info)
    story.append(Spacer(1, 0.2*inch))

    # Insert PSD plot if available
    if report_data.get('psdPlotBase64'):
        try:
            # Decode base64 image
            img_data = base64.b64decode(report_data['psdPlotBase64'])
            img_buffer = io.BytesIO(img_data)

            # Add image to PDF (full page width)
            psd_image = RLImage(img_buffer, width=6.5*inch, height=4*inch)
            story.append(psd_image)
            story.append(Spacer(1, 0.2*inch))

        except Exception as e:
            error_para = Paragraph(
                f"Error loading PSD plot: {str(e)}",
                normal_style
            )
            story.append(error_para)
    else:
        no_plot_para = Paragraph(
            "No PSD plot available. Please generate PSD analysis first.",
            normal_style
        )
        story.append(no_plot_para)

    # ===== SUMMARY =====
    story.append(Spacer(1, 0.3*inch))
    story.append(Paragraph("Analysis Summary", heading_style))

    summary_text = f"""
    This report contains EEG analysis results for the recording "{report_data.get('fileName', 'N/A')}".
    The analysis was performed using Power Spectral Density ({psd_method} method) to assess
    brain activity patterns during 40 Hz visual stimulation.
    """

    if report_data.get('timeFrame'):
        tf = report_data['timeFrame']
        duration = tf.get('end', 0) - tf.get('start', 0)
        summary_text += f"""<br/><br/>
        The analysis focused on a {duration:.2f}-second time window from {tf.get('start', 0):.2f}s
        to {tf.get('end', 0):.2f}s of the recording.
        """

    if report_data.get('annotations'):
        summary_text += f"""<br/><br/>
        The recording contains {len(report_data['annotations'])} annotations marking
        significant events during the session.
        """

    summary_para = Paragraph(summary_text, normal_style)
    story.append(summary_para)

    # ===== FOOTER =====
    story.append(Spacer(1, 0.5*inch))
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.grey,
        alignment=TA_CENTER
    )
    footer_text = f"Report generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Optoceutics EEG Platform"
    footer_para = Paragraph(footer_text, footer_style)
    story.append(footer_para)

    # Build PDF
    doc.build(story)

    # Get PDF bytes and encode to base64
    pdf_bytes = buffer.getvalue()
    buffer.close()

    pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')

    return pdf_base64

# Execute
import json
report_data_dict = json.loads('${JSON.stringify(reportData)}')
pdf_base64_result = generate_patient_report_pdf(report_data_dict)
pdf_base64_result
`;

  try {
    const result = await pyodide.runPythonAsync(pythonCode);
    return result;
  } catch (error) {
    console.error('PDF generation error:', error);
    throw new Error(`Failed to generate PDF: ${error}`);
  }
}

/**
 * Download a base64 PDF as a file
 */
export function downloadPDF(base64PDF: string, filename: string) {
  const byteCharacters = atob(base64PDF);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'application/pdf' });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
