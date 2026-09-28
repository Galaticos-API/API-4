"""Extract supported uploads without filesystem paths or database access."""
import base64
import io
import zipfile
import xml.etree.ElementTree as ET
from pathlib import PurePath

MAX_BYTES = 100 * 1024 * 1024


def extract_document_text(file_name: str, content_base64: str) -> str:
    if len(content_base64) > (MAX_BYTES * 4 // 3 + 4):
        raise ValueError("Arquivo muito grande")
    content = base64.b64decode(content_base64, validate=True)
    if len(content) > MAX_BYTES:
        raise ValueError("Arquivo muito grande")
    extension = PurePath(file_name).suffix.lower()
    if extension in (".txt", ".md"):
        text = content.decode("utf-8-sig")
    elif extension == ".docx":
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            info = archive.getinfo("word/document.xml")
            if info.file_size > MAX_BYTES:
                raise ValueError("Documento descompactado muito grande")
            root = ET.fromstring(archive.read(info))
        namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
        text = "\n".join("".join(node.itertext()) for node in root.iter(namespace + "p"))
    elif extension == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        if reader.is_encrypted:
            raise ValueError("PDF protegido não é suportado")
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    else:
        raise ValueError("Formato não suportado")
    if not text.strip() or len(text) > MAX_BYTES:
        raise ValueError("Documento sem texto extraível ou acima do limite")
    return text
