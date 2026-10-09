"""End-to-end smoke for S2-01/S2-02/S2-06 using synthetic files and a disposable project."""

from __future__ import annotations

import argparse
import html
import io
import json
import os
import re
import sys
import time
import uuid
import zipfile
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request, urlopen


def pdf_bytes(text: str) -> bytes:
    safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 12 Tf 72 720 Td ({safe}) Tj ET".encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, body in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f"{number} 0 obj\n".encode() + body + b"\nendobj\n")
    xref_offset = len(output)
    output.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode())
    output.extend(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode())
    return bytes(output)


def docx_bytes(text: str) -> bytes:
    escaped = html.escape(text, quote=False)
    document_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>{escaped}</w:t></w:r></w:p>
<w:tbl><w:tblPr/><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid>
<w:tr><w:tc><w:p><w:r><w:t>Campo</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{escaped}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:sectPr/></w:body></w:document>'''
    content_types = '''<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>'''
    relationships = '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", relationships)
        archive.writestr("word/document.xml", document_xml)
    return output.getvalue()


def request_json(url: str, cookie: str, method: str = "GET", body: bytes | None = None,
                 headers: dict[str, str] | None = None) -> tuple[int, object | None]:
    request_headers = {"Cookie": cookie, "Accept": "application/json"}
    if headers:
        request_headers.update(headers)
    request = Request(url, data=body, headers=request_headers, method=method)
    try:
        with urlopen(request, timeout=20) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except HTTPError as error:
        # Do not print response bodies: they may contain implementation details.
        raise RuntimeError(f"{method} {request.full_url.split('?')[0]} retornou HTTP {error.code}") from None
    except (URLError, TimeoutError) as error:
        reason = getattr(error, "reason", error)
        raise RuntimeError(f"Falha de rede em {method} {request.full_url.split('?')[0]}: {type(reason).__name__}") from None


def validate_api_base(value: str) -> str:
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        raise ValueError("URL base da API inválida.") from None
    if (parsed.scheme != "http" or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
            or parsed.username or parsed.password or parsed.path not in {"", "/"}
            or parsed.query or parsed.fragment or port == 0):
        raise ValueError("Por segurança, a API deve ser local (localhost/127.0.0.1/::1), sem credenciais ou caminho adicional.")
    return value.rstrip("/")


def wait_until_processed(api: str, project_id: str, cookie: str, document_id: str,
                         timeout_seconds: int) -> dict[str, object]:
    deadline = time.monotonic() + timeout_seconds
    list_url = f"{api}/api/v1/projects/{project_id}/documents?limit=50"
    while time.monotonic() < deadline:
        status, payload = request_json(list_url, cookie)
        if status != 200 or not isinstance(payload, dict):
            raise RuntimeError("A listagem de documentos retornou resposta inesperada.")
        items = payload.get("items")
        item = next((row for row in items if isinstance(row, dict) and row.get("id") == document_id), None) if isinstance(items, list) else None
        if item is None:
            raise RuntimeError("O documento enviado não apareceu na listagem do projeto.")
        state = item.get("status_processamento")
        if state == "processado":
            return item
        if state == "falha":
            raise RuntimeError("A ingestão terminou em falha; consulte o estado do documento no sistema.")
        if state not in {"pendente", "processando"}:
            raise RuntimeError("O documento retornou um estado de processamento desconhecido.")
        time.sleep(2)
    raise RuntimeError(f"Timeout: o documento não foi processado em {timeout_seconds} segundos.")


def search_for_document(api: str, project_id: str, cookie: str, phrase: str,
                        document_id: str, timeout_seconds: int = 60) -> bool:
    query = urlencode({"q": phrase, "projeto_id": project_id, "limit": "50"})
    url = f"{api}/api/v1/search?{query}"
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        status, payload = request_json(url, cookie)
        if status != 200 or not isinstance(payload, dict):
            raise RuntimeError("A busca retornou resposta inesperada.")
        items = payload.get("items")
        found = next((row for row in items if isinstance(row, dict) and row.get("entity_id") == document_id), None) if isinstance(items, list) else None
        if found:
            if found.get("project_id") != project_id:
                raise RuntimeError("A busca retornou uma fonte fora do projeto solicitado.")
            expected_source = f"/projects/{project_id}/documents"
            if found.get("source_url") != expected_source:
                raise RuntimeError("A busca retornou um caminho de origem incorreto para o documento.")
            return True
        time.sleep(2)
    return False


def run(api: str, project_id: str, cookie: str, timeout_seconds: int) -> None:
    api = validate_api_base(api)
    fixtures = (
        (".pdf", "application/pdf", lambda marker: pdf_bytes(marker)),
        (".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", lambda marker: docx_bytes(marker)),
        (".md", "text/markdown", lambda marker: f"# Smoke\n\n{marker}\n".encode("utf-8")),
        (".txt", "text/plain", lambda marker: f"Smoke documental.\n\n{marker}\n".encode("utf-8")),
    )
    uploaded: list[str] = []
    failures: list[str] = []
    try:
        for extension, mime, build in fixtures:
            token = uuid.uuid4().hex
            # Three natural-language terms give full-text search a stable, unique probe.
            marker = f"Quasar Nectario {token}"
            filename = f"sinapse-smoke-{token}{extension}"
            upload_url = f"{api}/api/v1/projects/{project_id}/documents"
            status, payload = request_json(
                upload_url,
                cookie,
                method="POST",
                body=build(marker),
                headers={"Content-Type": mime, "X-File-Name": quote(filename, safe="")},
            )
            if (status != 201 or not isinstance(payload, dict) or not isinstance(payload.get("id"), str)
                    or payload.get("projeto_id") != project_id):
                raise RuntimeError(f"Upload de {extension} não retornou HTTP 201 e ID do documento.")
            document_id = payload["id"]
            uploaded.append(document_id)
            document = wait_until_processed(api, project_id, cookie, document_id, timeout_seconds)
            if document.get("projeto_id") != project_id or document.get("nome") != filename:
                raise RuntimeError(f"Escopo ou origem incorretos no documento {extension}.")
            if not search_for_document(api, project_id, cookie, marker, document_id):
                raise RuntimeError(f"A busca S2-06 não encontrou a fonte recém-indexada ({extension}).")

            delete_url = f"{api}/api/v1/projects/{project_id}/documents/{document_id}"
            delete_status, _ = request_json(delete_url, cookie, method="DELETE")
            if delete_status != 204:
                raise RuntimeError(f"Remoção de {extension} não retornou HTTP 204.")
            uploaded.remove(document_id)
            search_url = f"{api}/api/v1/search?{urlencode({'q': marker, 'projeto_id': project_id, 'limit': '50'})}"
            _, result = request_json(search_url, cookie)
            items = result.get("items") if isinstance(result, dict) else None
            if isinstance(items, list) and any(
                isinstance(row, dict) and row.get("entity_id") == document_id for row in items
            ):
                raise RuntimeError(f"A fonte {extension} continuou aparecendo na busca após remoção.")
            print(f"PASS {extension}: upload, processamento, busca/origem e remoção")
    except Exception as error:
        failures.append(str(error))
    finally:
        for document_id in uploaded:
            try:
                request_json(f"{api}/api/v1/projects/{project_id}/documents/{document_id}", cookie, method="DELETE")
            except Exception:
                failures.append(f"Falha na limpeza do documento sintético {document_id}.")
    if failures:
        for failure in failures:
            print(f"FAIL {failure}", file=sys.stderr)
        raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default=os.getenv("SINAPSE_API_BASE_URL", "http://localhost:3001"), help="Base URL de uma API local.")
    parser.add_argument("--project-id", default=os.getenv("SINAPSE_PROJECT_ID"), help="UUID de projeto descartável no ambiente de teste.")
    parser.add_argument("--timeout", type=int, default=600, help="Tempo máximo de processamento por arquivo (segundos).")
    parser.add_argument("--confirm-disposable", action="store_true", help="Confirma que o projeto informado é descartável e pertence a um banco de teste.")
    args = parser.parse_args()
    cookie = os.getenv("SINAPSE_SESSION_COOKIE", "").strip()
    if not args.confirm_disposable:
        parser.error("Confirme o uso de um projeto/banco descartável com --confirm-disposable.")
    if not cookie or not re.fullmatch(r"[0-9a-fA-F-]{36}", args.project_id or ""):
        parser.error("Defina SINAPSE_SESSION_COOKIE e SINAPSE_PROJECT_ID (UUID de um projeto descartável).")
    if args.timeout < 1 or args.timeout > 1800:
        parser.error("--timeout deve ficar entre 1 e 1800 segundos.")
    try:
        api = validate_api_base(args.api)
    except ValueError as error:
        parser.error(str(error))
    run(api, args.project_id, cookie, args.timeout)


if __name__ == "__main__":
    main()
