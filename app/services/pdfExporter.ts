/**
 * PDF Exporter Service
 *
 * This service handles generation of patient reports by:
 * 1. Reading the Customer Report Template.docx file
 * 2. Creating a copy and editing it internally (python-docx)
 * 3. Filling in Date and Session Number placeholders
 * 4. Inserting the PSD plot image in the appropriate section
 * 5. Converting the edited DOCX to PDF while preserving all formatting
 *
 * The DOCX is edited directly and then converted AS-IS to PDF,
 * preserving all styles, fonts, headers, and footers from the original template.
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

  // PSD Analysis Results (legacy - kept for backward compatibility)
  psdMethod: 'welch' | 'periodogram';
  frequencyRange: {
    min: number;
    max: number;
  };
  psdPlotBase64?: string; // Base64 encoded PNG image of the PSD plot (legacy)

  // Multi-plot support (new)
  plots?: Array<{
    plotBase64: string;
    caption: string;
    analysisType: string;
  }>;

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
    console.log('Installing python-docx, pillow, docx2pdf, and reportlab...');
    await micropip.install(['python-docx', 'pillow', 'docx2pdf', 'reportlab']);
    console.log('Packages installed successfully');
  } catch (error) {
    console.error('Failed to install required libraries:', error);
    throw new Error('Failed to install required libraries');
  }

  // Fetch the DOCX template
  let templateDocxBytes: string;
  try {
    console.log('Fetching DOCX template...');
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
    console.log('Template loaded successfully');
  } catch (error) {
    console.error('Failed to load template:', error);
    throw new Error('Failed to load Customer Report Template.docx from repository');
  }

  // Pass the template and data to Python
  pyodide.globals.set('template_docx_base64', templateDocxBytes);
  pyodide.globals.set('plot_base64', reportData.psdPlotBase64 || '');
  pyodide.globals.set('session_date', reportData.examDate || 'N/A');
  pyodide.globals.set('session_number', reportData.patientId || 'N/A');

  const pythonCode = `
import io
import base64
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from PIL import Image
import traceback

def generate_patient_report_pdf():
    """
    Generate patient report by:
    1. Loading the DOCX template
    2. Creating an internal copy and editing it
    3. Replacing Date and Session Number placeholders
    4. Inserting the PSD plot image in the correct location
    5. Converting to PDF using docx2pdf (preferred) or reportlab (fallback)

    Priority order for conversion:
    1. docx2pdf - Best formatting preservation
    2. reportlab - Fallback with acceptable formatting

    Returns:
        Base64 encoded PDF bytes
    """

    try:
        print("Step 1: Decoding template DOCX...")
        # Decode the template DOCX from base64
        template_bytes = base64.b64decode(template_docx_base64)
        template_buffer = io.BytesIO(template_bytes)

        print("Step 2: Loading DOCX document...")
        # Load the DOCX document (this creates an internal copy)
        doc = Document(template_buffer)

        print("Step 3: Replacing placeholders...")
        # Replace Date and Session Number placeholders
        # Search through all paragraphs
        for paragraph in doc.paragraphs:
            if 'Date:' in paragraph.text and '____' in paragraph.text:
                # Replace the date placeholder
                for run in paragraph.runs:
                    if '____' in run.text:
                        run.text = run.text.replace('____________________', session_date, 1)
                        break

            if 'Session Number:' in paragraph.text and '____' in paragraph.text:
                # Replace the session number placeholder
                for run in paragraph.runs:
                    if '____' in run.text:
                        run.text = run.text.replace('____________________', session_number, 1)
                        break

        # Also check in tables (template might use tables)
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for paragraph in cell.paragraphs:
                        if 'Date:' in paragraph.text and '____' in paragraph.text:
                            for run in paragraph.runs:
                                if '____' in run.text:
                                    run.text = run.text.replace('____________________', session_date, 1)
                                    break

                        if 'Session Number:' in paragraph.text and '____' in paragraph.text:
                            for run in paragraph.runs:
                                if '____' in run.text:
                                    run.text = run.text.replace('____________________', session_number, 1)
                                    break

        print("Step 4: Inserting PSD plot image...")
        # Insert the PSD plot image in the correct location
        if plot_base64:
            # Decode the plot image
            img_data = base64.b64decode(plot_base64)
            img_buffer = io.BytesIO(img_data)

            # Find the location to insert the plot
            # Look for "During 40 Hz Visual Stimulation with EVY Light"
            insertion_index = None
            for i, paragraph in enumerate(doc.paragraphs):
                if 'During 40 Hz Visual Stimulation with EVY Light' in paragraph.text:
                    insertion_index = i
                    break

            if insertion_index is not None:
                # Insert image after the bullet point
                # Add a new paragraph after the found location
                p = doc.paragraphs[insertion_index]._element
                new_p = OxmlElement('w:p')
                p.addnext(new_p)

                # Get the new paragraph
                new_para = doc.paragraphs[insertion_index + 1]
                new_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

                # Add the image
                run = new_para.add_run()
                run.add_picture(img_buffer, width=Inches(6))

                print(f"Image inserted at paragraph {insertion_index + 1}")
            else:
                # If not found, try before "Interpretation:" section
                for i, paragraph in enumerate(doc.paragraphs):
                    if 'Interpretation:' in paragraph.text:
                        # Insert a page break and then the image
                        p = doc.paragraphs[i]._element

                        # Add new paragraph for image
                        new_p = OxmlElement('w:p')
                        p.addprevious(new_p)

                        new_para = doc.paragraphs[i]
                        new_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                        run = new_para.add_run()
                        run.add_picture(img_buffer, width=Inches(6))

                        print(f"Image inserted before Interpretation section at paragraph {i}")
                        break

        print("Step 5: Saving modified DOCX...")
        # Save the modified DOCX to a buffer
        output_docx_buffer = io.BytesIO()
        doc.save(output_docx_buffer)
        output_docx_buffer.seek(0)

        print("Step 6: Converting DOCX to PDF...")
        # Try conversion methods in order of preference
        pdf_bytes = None
        conversion_method = None

        # Method 1: Try docx2pdf (best formatting preservation)
        try:
            print("Trying docx2pdf conversion...")
            from docx2pdf import convert

            # docx2pdf needs file paths in Pyodide, create temp files
            import tempfile
            import os

            # Create temp directory
            temp_dir = tempfile.mkdtemp()
            docx_path = os.path.join(temp_dir, 'temp_report.docx')
            pdf_path = os.path.join(temp_dir, 'temp_report.pdf')

            # Write DOCX to temp file
            with open(docx_path, 'wb') as f:
                f.write(output_docx_buffer.getvalue())

            # Convert to PDF
            convert(docx_path, pdf_path)

            # Read PDF back
            with open(pdf_path, 'rb') as f:
                pdf_bytes = f.read()

            # Cleanup
            os.remove(docx_path)
            os.remove(pdf_path)
            os.rmdir(temp_dir)

            conversion_method = "docx2pdf"
            print("Successfully converted using docx2pdf!")

        except Exception as e:
            print(f"docx2pdf conversion failed: {e}")
            print("Falling back to reportlab conversion...")

            # Method 2: Fallback to reportlab
            try:
                from reportlab.lib.pagesizes import A4
                from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, PageBreak
                from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
                from reportlab.lib.units import inch
                from reportlab.lib import colors

                # Create PDF buffer
                pdf_buffer = io.BytesIO()

                # Read the modified DOCX to extract content
                output_docx_buffer.seek(0)
                doc_for_pdf = Document(output_docx_buffer)

                # Create PDF document
                pdf = SimpleDocTemplate(pdf_buffer, pagesize=A4,
                                      topMargin=0.75*inch, bottomMargin=0.75*inch,
                                      leftMargin=0.75*inch, rightMargin=0.75*inch)

                # Container for PDF elements
                story = []
                styles = getSampleStyleSheet()

                # Custom styles to match the template
                title_style = ParagraphStyle(
                    'CustomTitle',
                    parent=styles['Heading1'],
                    fontSize=16,
                    textColor=colors.HexColor('#000000'),
                    spaceAfter=12,
                    alignment=0
                )

                heading_style = ParagraphStyle(
                    'CustomHeading',
                    parent=styles['Heading2'],
                    fontSize=14,
                    textColor=colors.HexColor('#000000'),
                    spaceAfter=10,
                    spaceBefore=10,
                    fontName='Helvetica-Bold'
                )

                body_style = ParagraphStyle(
                    'CustomBody',
                    parent=styles['Normal'],
                    fontSize=11,
                    textColor=colors.HexColor('#000000'),
                    spaceAfter=6,
                    leading=14
                )

                # Process each paragraph from the DOCX
                for para in doc_for_pdf.paragraphs:
                    text = para.text.strip()

                    if not text:
                        story.append(Spacer(1, 0.1*inch))
                        continue

                    # Determine style based on content
                    if 'Customer Report:' in text or 'Brain Response to 40 Hz' in text:
                        story.append(Paragraph(text, title_style))
                    elif any(heading in text for heading in ['Background Information:', 'Understanding the SSVEP',
                                                              'Your Brain Response:', 'Interpretation:',
                                                              'Additional Notes', 'Contact and Follow-Up']):
                        story.append(Paragraph(text, heading_style))
                    else:
                        if text.startswith('●') or text.startswith('•'):
                            bullet_style = ParagraphStyle(
                                'Bullet',
                                parent=body_style,
                                leftIndent=20,
                                bulletIndent=10
                            )
                            story.append(Paragraph(text, bullet_style))
                        else:
                            story.append(Paragraph(text, body_style))

                # Add images from the document
                for rel in doc_for_pdf.part.rels.values():
                    if "image" in rel.target_ref:
                        try:
                            image_data = rel.target_part.blob
                            img_buffer_pdf = io.BytesIO(image_data)
                            img = RLImage(img_buffer_pdf, width=6*inch, height=4*inch)
                            story.append(Spacer(1, 0.2*inch))
                            story.append(img)
                            story.append(Spacer(1, 0.2*inch))
                        except Exception as e:
                            print(f"Error adding image: {e}")

                # Build the PDF
                pdf.build(story)
                pdf_bytes = pdf_buffer.getvalue()
                pdf_buffer.close()

                conversion_method = "reportlab"
                print("Successfully converted using reportlab (formatting may be simplified)")

            except Exception as e:
                print(f"reportlab conversion also failed: {e}")
                raise Exception(f"All PDF conversion methods failed. Last error: {e}")

        if pdf_bytes is None:
            raise Exception("Failed to generate PDF with any conversion method")

        print(f"Step 7: Encoding PDF to base64 (method: {conversion_method})...")
        # Encode to base64
        pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')

        print("PDF generation completed successfully!")
        return pdf_base64

    except Exception as e:
        error_msg = f"Error in PDF generation: {str(e)}\\n{traceback.format_exc()}"
        print(error_msg)
        raise Exception(error_msg)
`;

  try {
    console.log('Executing Python code...');
    // Execute the Python code
    await pyodide.runPythonAsync(pythonCode);

    console.log('Calling PDF generation function...');
    // Call the function to generate the report
    const result = await pyodide.runPythonAsync(`generate_patient_report_pdf()`);
    console.log('PDF generated successfully!');
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

/**
 * Download a base64 DOCX as a file
 * Use this as an alternative when perfect formatting preservation is required
 */
export function downloadDOCX(base64DOCX: string, filename: string) {
  const byteCharacters = atob(base64DOCX);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }
  const blob = new Blob([byteArray], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate a patient report DOCX (edited template with all formatting preserved)
 * Returns the modified DOCX file for download or further processing
 * This preserves ALL original formatting, headers, footers, fonts, and styles
 */
export async function generatePatientReportDOCX(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pyodide: any,
  reportData: PatientReportData
): Promise<string> {

  // Install required packages
  try {
    const micropip = pyodide.pyimport('micropip');
    console.log('Installing python-docx and pillow...');
    await micropip.install(['python-docx', 'pillow']);
    console.log('Packages installed successfully');
  } catch (error) {
    console.error('Failed to install required libraries:', error);
    throw new Error('Failed to install required libraries');
  }

  // Fetch the DOCX template
  let templateDocxBytes: string;
  try {
    console.log('Fetching DOCX template...');
    const docxResponse = await fetch('/Customer Report Template.docx');
    if (!docxResponse.ok) {
      throw new Error(`Failed to fetch DOCX template: ${docxResponse.status}`);
    }
    const docxArrayBuffer = await docxResponse.arrayBuffer();
    const docxUint8Array = new Uint8Array(docxArrayBuffer);

    // Convert to base64 for Python - process in chunks to avoid stack overflow
    let docxBinary = '';
    const chunkSize = 8192;
    for (let i = 0; i < docxUint8Array.length; i += chunkSize) {
      const chunk = docxUint8Array.subarray(i, Math.min(i + chunkSize, docxUint8Array.length));
      docxBinary += String.fromCharCode(...chunk);
    }
    templateDocxBytes = btoa(docxBinary);
    console.log('Template loaded successfully');
  } catch (error) {
    console.error('Failed to load template:', error);
    throw new Error('Failed to load Customer Report Template.docx from repository');
  }

  // Pass the template and data to Python
  pyodide.globals.set('template_docx_base64', templateDocxBytes);
  pyodide.globals.set('plot_base64', reportData.psdPlotBase64 || ''); // Legacy field
  pyodide.globals.set('session_date', reportData.examDate || 'N/A');
  pyodide.globals.set('session_number', reportData.patientId || 'N/A');

  // Pass multi-plot data (new)
  const plotsData = reportData.plots || [];
  pyodide.globals.set('plots_data', JSON.stringify(plotsData));

  const pythonCode = `
import io
import base64
import json
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
import traceback

def generate_patient_report_docx():
    """
    Generate patient report DOCX by editing the template.
    This preserves ALL original formatting.
    Supports multiple plots with captions.

    Returns:
        Base64 encoded DOCX bytes
    """

    try:
        print("Loading and editing DOCX template...")
        template_bytes = base64.b64decode(template_docx_base64)
        template_buffer = io.BytesIO(template_bytes)
        doc = Document(template_buffer)

        # Replace placeholders
        for paragraph in doc.paragraphs:
            if 'Date:' in paragraph.text and '____' in paragraph.text:
                for run in paragraph.runs:
                    if '____' in run.text:
                        run.text = run.text.replace('____________________', session_date, 1)
                        break

            if 'Session Number:' in paragraph.text and '____' in paragraph.text:
                for run in paragraph.runs:
                    if '____' in run.text:
                        run.text = run.text.replace('____________________', session_number, 1)
                        break

        # Parse plots data
        plots = json.loads(plots_data) if plots_data else []

        # Insert plots (new multi-plot support)
        if plots and len(plots) > 0:
            print(f"Inserting {len(plots)} plot(s)...")

            # Find insertion point
            insertion_index = None
            for i, paragraph in enumerate(doc.paragraphs):
                if 'During 40 Hz Visual Stimulation with EVY Light' in paragraph.text:
                    insertion_index = i
                    break

            if insertion_index is not None:
                # Insert all plots sequentially
                current_index = insertion_index
                for plot_idx, plot in enumerate(plots):
                    plot_base64_data = plot.get('plotBase64', '')
                    plot_caption = plot.get('caption', f'Analysis Plot {plot_idx + 1}')

                    if plot_base64_data:
                        # Decode image
                        img_data = base64.b64decode(plot_base64_data)
                        img_buffer = io.BytesIO(img_data)

                        # Add new paragraph for image
                        p = doc.paragraphs[current_index]._element
                        new_p = OxmlElement('w:p')
                        p.addnext(new_p)

                        new_para = doc.paragraphs[current_index + 1]
                        new_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                        run = new_para.add_run()
                        run.add_picture(img_buffer, width=Inches(6))

                        # Add caption below image
                        caption_p = OxmlElement('w:p')
                        new_para._element.addnext(caption_p)

                        caption_para = doc.paragraphs[current_index + 2]
                        caption_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                        caption_run = caption_para.add_run(plot_caption)
                        caption_run.font.size = Pt(10)
                        caption_run.font.italic = True

                        # Add spacing paragraph
                        if plot_idx < len(plots) - 1:
                            spacing_p = OxmlElement('w:p')
                            caption_para._element.addnext(spacing_p)
                            current_index += 4  # Account for original + image + caption + spacing
                        else:
                            current_index += 3  # No spacing after last plot

                        print(f"Plot {plot_idx + 1} inserted: {plot_caption}")

        # Backward compatibility: if no plots array, use legacy single plot
        elif plot_base64:
            print("Using legacy single plot mode...")
            img_data = base64.b64decode(plot_base64)
            img_buffer = io.BytesIO(img_data)

            insertion_index = None
            for i, paragraph in enumerate(doc.paragraphs):
                if 'During 40 Hz Visual Stimulation with EVY Light' in paragraph.text:
                    insertion_index = i
                    break

            if insertion_index is not None:
                p = doc.paragraphs[insertion_index]._element
                new_p = OxmlElement('w:p')
                p.addnext(new_p)

                new_para = doc.paragraphs[insertion_index + 1]
                new_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = new_para.add_run()
                run.add_picture(img_buffer, width=Inches(6))
                print("Legacy plot inserted successfully")

        # Save modified DOCX
        output_buffer = io.BytesIO()
        doc.save(output_buffer)
        docx_bytes = output_buffer.getvalue()
        output_buffer.close()

        docx_base64 = base64.b64encode(docx_bytes).decode('utf-8')
        print("DOCX generation completed successfully!")
        return docx_base64

    except Exception as e:
        error_msg = f"Error: {str(e)}\\n{traceback.format_exc()}"
        print(error_msg)
        raise Exception(error_msg)
`;

  try {
    console.log('Generating modified DOCX...');
    await pyodide.runPythonAsync(pythonCode);
    const result = await pyodide.runPythonAsync(`generate_patient_report_docx()`);
    console.log('DOCX generated successfully!');
    return result;
  } catch (error) {
    console.error('Report generation error:', error);
    throw new Error(`Failed to generate report: ${error}`);
  }
}
