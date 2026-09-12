"""Text-based PDF input for the GB10 API."""
import io


def pdf_text(content):
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(content))
    if len(reader.pages) > 100:
        raise ValueError('PDF limit is 100 pages. Split the file before uploading.')
    text = '\n'.join(page.extract_text() or '' for page in reader.pages)
    if not text.strip():
        raise ValueError('No extractable text found. Scanned PDFs need OCR before upload.')
    return text
