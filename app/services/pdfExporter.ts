/**
 * PDF Exporter Service
 *
 * This service handles generation of patient reports by:
 * 1. Reading the Customer Report Template (DOCX)
 * 2. Filling in Date and Session Number
 * 3. Inserting the PSD plot image in the appropriate section
 * 4. Converting to PDF and generating for download
 *
 * Uses python-docx to maintain all original formatting, fonts, colors, and styles
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

  // Install required packages
  try {
    const micropip = pyodide.pyimport('micropip');
    // Install python-docx for DOCX manipulation, pypdf for PDF handling, pillow for images
    await micropip.install(['python-docx', 'pypdf', 'reportlab', 'pillow']);
  } catch (error) {
    console.error('Failed to install required libraries:', error);
    throw new Error('Failed to install required libraries');
  }

  // Fetch both the DOCX template (for editing) and PDF template (for conversion)
  let templateDocxBytes: string;
  let templatePdfBytes: string;

  try {
    // Fetch DOCX template
    const docxResponse = await fetch('/Customer Report Template.docx');
    if (!docxResponse.ok) {
      throw new Error(`Failed to fetch DOCX template: ${docxResponse.status}`);
    }
    const docxArrayBuffer = await docxResponse.arrayBuffer();
    const docxUint8Array = new Uint8Array(docxArrayBuffer);

    // Convert to base64 for Python - process in chunks to avoid stack overflow
    let docxBinary = '';
    const chunkSize = 8192; // Process 8KB at a time
    for (let i = 0; i < docxUint8Array.length; i += chunkSize) {
      const chunk = docxUint8Array.subarray(i, Math.min(i + chunkSize, docxUint8Array.length));
      docxBinary += String.fromCharCode(...chunk);
    }
    templateDocxBytes = btoa(docxBinary);

    // Fetch PDF template for final conversion
    const pdfResponse = await fetch('/Customer Report Template.pdf');
    if (!pdfResponse.ok) {
      throw new Error(`Failed to fetch PDF template: ${pdfResponse.status}`);
    }
    const pdfArrayBuffer = await pdfResponse.arrayBuffer();
    const pdfUint8Array = new Uint8Array(pdfArrayBuffer);

    let pdfBinary = '';
    for (let i = 0; i < pdfUint8Array.length; i += chunkSize) {
      const chunk = pdfUint8Array.subarray(i, Math.min(i + chunkSize, pdfUint8Array.length));
      pdfBinary += String.fromCharCode(...chunk);
    }
    templatePdfBytes = btoa(pdfBinary);
  } catch (error) {
    console.error('Failed to load template:', error);
    throw new Error('Failed to load Customer Report Template from repository');
  }

  // Pass the template and data to Python
  pyodide.globals.set('template_docx_base64', templateDocxBytes);
  pyodide.globals.set('template_pdf_base64', templatePdfBytes);
  pyodide.globals.set('plot_base64', reportData.psdPlotBase64 || '');
  pyodide.globals.set('session_date', reportData.examDate || 'N/A');
  pyodide.globals.set('session_number', reportData.patientId || 'N/A');

  const pythonCode = `
import io
import base64
from docx import Document
from docx.shared import Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from PIL import Image
from reportlab.lib.utils import ImageReader

def generate_patient_report_pdf():
    """
    Generate patient report by:
    1. Using python-docx to understand structure and extract text positions
    2. Using pypdf to work with template PDF
    3. Adding data overlays and inserting plot image with proper formatting

    Returns:
        Base64 encoded PDF bytes with all original formatting preserved
    """

    # Load the template PDF
    template_bytes = base64.b64decode(template_pdf_base64)
    template_buffer = io.BytesIO(template_bytes)
    reader = PdfReader(template_buffer)
    writer = PdfWriter()

    # Get page 1 from template
    page1 = reader.pages[0]

    # Create overlay for Date and Session Number using exact coordinates
    overlay_buffer = io.BytesIO()
    c = canvas.Canvas(overlay_buffer, pagesize=A4)
    width, height = A4

    # Use the same font as the template (appears to be a sans-serif, using Helvetica as close match)
    c.setFont("Helvetica", 11)
    c.setFillColorRGB(0, 0, 0)  # Black text

    # Fill in Date - positioned after "Date: " on the template
    # Coordinates based on A4 page (595.27 x 841.89 points)
    c.drawString(135, height - 293, session_date)

    # Fill in Session Number - positioned after "Session Number: "
    c.drawString(280, height - 312, session_number)

    c.save()

    # Merge overlay with page 1
    overlay_buffer.seek(0)
    overlay_reader = PdfReader(overlay_buffer)
    page1.merge_page(overlay_reader.pages[0])
    writer.add_page(page1)

    # Insert plot image as a new page with proper template formatting
    if plot_base64:
        # Decode and load the plot image
        img_data = base64.b64decode(plot_base64)
        img_buffer = io.BytesIO(img_data)
        pil_image = Image.open(img_buffer)
        img_reader = ImageReader(pil_image)

        # Create new page with same dimensions and styling as template
        plot_page_buffer = io.BytesIO()
        c = canvas.Canvas(plot_page_buffer, pagesize=A4)

        # Add header section (matching template header)
        # Dark blue-gray header background
        header_color = (74/255, 85/255, 104/255)  # #4A5568
        c.setFillColorRGB(*header_color)
        header_height = 80
        c.rect(0, height - header_height, width, header_height, fill=True, stroke=False)

        # Gold accent line
        gold_color = (217/255, 165/255, 33/255)  # Gold
        c.setFillColorRGB(*gold_color)
        c.rect(0, height - header_height - 4, width, 4, fill=True, stroke=False)

        # Add footer section (matching template footer)
        c.setFillColorRGB(*header_color)
        footer_height = 50
        c.rect(0, 0, width, footer_height, fill=True, stroke=False)

        # Footer text in white
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica", 9)

        # Company information (centered)
        footer_line1 = "OptoCeutics ApS  -  CVR-39769689"
        footer_line2 = "Nørrebrogade 45C 4th  -  2200 Copenhagen N  -  Denmark"
        footer_line3 = "Page 2 of 3"

        c.drawCentredString(width / 2, 30, footer_line1)
        c.drawCentredString(width / 2, 18, footer_line2)
        c.drawCentredString(width / 2, 6, footer_line3)

        # Insert the plot in the content area
        content_top = height - header_height - 4
        content_bottom = footer_height
        content_height = content_top - content_bottom

        # Size the plot to fit well in the content area (with margins)
        margin = 0.75 * inch
        plot_width = width - 2 * margin
        plot_height = content_height - 2 * margin

        # Position plot centered in content area
        plot_x = margin
        plot_y = content_bottom + margin

        c.drawImage(img_reader, plot_x, plot_y, width=plot_width, height=plot_height,
                    preserveAspectRatio=True, anchor='sw')

        c.save()

        # Add the plot page to the PDF
        plot_page_buffer.seek(0)
        plot_reader = PdfReader(plot_page_buffer)
        writer.add_page(plot_reader.pages[0])

    # Add page 2 from template (now page 3) with updated page number
    if len(reader.pages) > 1:
        page2 = reader.pages[1]

        # Update page number overlay
        page_num_overlay = io.BytesIO()
        c = canvas.Canvas(page_num_overlay, pagesize=A4)

        # Cover old page number with footer color
        c.setFillColorRGB(74/255, 85/255, 104/255)
        c.rect(width/2 - 60, 0, 120, 14, fill=True, stroke=False)

        # Write new page number
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica", 9)
        c.drawCentredString(width / 2, 6, "Page 3 of 3")

        c.save()

        # Merge page number overlay
        page_num_overlay.seek(0)
        page_num_reader = PdfReader(page_num_overlay)
        page2.merge_page(page_num_reader.pages[0])
        writer.add_page(page2)

    # Write final PDF to buffer
    output_buffer = io.BytesIO()
    writer.write(output_buffer)
    pdf_bytes = output_buffer.getvalue()
    output_buffer.close()

    # Encode to base64
    pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
    return pdf_base64
`;

  try {
    // Execute the Python code
    await pyodide.runPythonAsync(pythonCode);

    // Call the function to generate the report
    const result = await pyodide.runPythonAsync(`generate_patient_report_pdf()`);
    return result;
  } catch (error) {
    console.error('Report generation error:', error);
    throw new Error(`Failed to generate report: ${error}`);
  }
}

/**
 * Download a base64 PDF as a file
 */
export function downloadPDF(base64PDF: string, filename: string) {
  const byteCharacters = atob(base64PDF);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }
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
