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

  // Install required packages
  try {
    const micropip = pyodide.pyimport('micropip');
    await micropip.install(['reportlab', 'pypdf', 'pillow']);
  } catch (error) {
    console.error('Failed to install PDF libraries:', error);
    throw new Error('Failed to install required PDF libraries');
  }

  // First, fetch the template PDF from the repository
  let templatePdfBytes: string;
  try {
    const response = await fetch('/Customer Report Template.pdf');
    if (!response.ok) {
      throw new Error(`Failed to fetch template: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Convert to base64 for Python - process in chunks to avoid stack overflow
    let binary = '';
    const chunkSize = 8192; // Process 8KB at a time
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binary += String.fromCharCode(...chunk);
    }
    templatePdfBytes = btoa(binary);
  } catch (error) {
    console.error('Failed to load template PDF:', error);
    throw new Error('Failed to load Customer Report Template.pdf from repository');
  }

  // Pass the template and plot data to Python
  pyodide.globals.set('template_pdf_base64', templatePdfBytes);
  pyodide.globals.set('plot_base64', reportData.psdPlotBase64 || '');
  pyodide.globals.set('session_date', reportData.examDate || '');
  pyodide.globals.set('session_number', reportData.patientId || '');

  const pythonCode = `
import io
import base64
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from PIL import Image
from reportlab.lib.utils import ImageReader

def generate_patient_report_pdf():
    """
    Edit the Customer Report Template PDF by inserting the PSD plot

    Returns:
        Base64 encoded PDF bytes
    """

    # Decode the template PDF from base64
    template_bytes = base64.b64decode(template_pdf_base64)
    template_buffer = io.BytesIO(template_bytes)

    # Read the template PDF (2 pages)
    reader = PdfReader(template_buffer)
    writer = PdfWriter()

    # Add page 1 from template (with Date and Session Number filled)
    page1 = reader.pages[0]

    # Create overlay for page 1 with Date and Session Number
    overlay_buffer = io.BytesIO()
    c = canvas.Canvas(overlay_buffer, pagesize=A4)

    # Fill in Date field (positioned after "Date: ____")
    # Coordinates are approximate - adjust based on template
    c.setFont("Helvetica", 11)
    c.drawString(130, 770, session_date)  # Date position

    # Fill in Session Number field
    c.drawString(280, 755, session_number)  # Session Number position

    c.save()

    # Merge overlay with page 1
    overlay_buffer.seek(0)
    overlay_reader = PdfReader(overlay_buffer)
    page1.merge_page(overlay_reader.pages[0])
    writer.add_page(page1)

    # Create a new page for the PSD plot (insert between page 1 and 2)
    if plot_base64:
        plot_page_buffer = io.BytesIO()
        c = canvas.Canvas(plot_page_buffer, pagesize=A4)
        width, height = A4

        # Decode the plot image and open with PIL
        img_data = base64.b64decode(plot_base64)
        img_buffer = io.BytesIO(img_data)
        pil_image = Image.open(img_buffer)

        # Use ImageReader for reportlab compatibility
        img_reader = ImageReader(pil_image)

        # Draw the plot centered on the page
        # Plot dimensions: make it large but leave margins
        plot_width = width - 2*inch
        plot_height = 4.5*inch

        # Position: centered horizontally, starting from top with margin
        x = 1*inch
        y = height - 5.5*inch  # From top

        c.drawImage(img_reader, x, y, width=plot_width, height=plot_height,
                    preserveAspectRatio=True, anchor='sw')

        c.save()

        # Add plot page to writer
        plot_page_buffer.seek(0)
        plot_reader = PdfReader(plot_page_buffer)
        writer.add_page(plot_reader.pages[0])

    # Add page 2 from template (Interpretation and rest)
    if len(reader.pages) > 1:
        page2 = reader.pages[1]
        writer.add_page(page2)

    # Write final PDF to buffer
    output_buffer = io.BytesIO()
    writer.write(output_buffer)

    # Get PDF bytes and encode to base64
    pdf_bytes = output_buffer.getvalue()
    output_buffer.close()

    pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')

    return pdf_base64
`;

  try {
    // First, execute the Python code to define the function
    await pyodide.runPythonAsync(pythonCode);

    // Now call the function (all data already set in globals)
    const result = await pyodide.runPythonAsync(`generate_patient_report_pdf()`);
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
