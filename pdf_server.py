"""Production-safe Flask API and static host for Patent + PDF Suite."""

import ipaddress
import os
import socket
import re
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin, urlparse

import requests
from flask import Flask, jsonify, request, send_file, send_from_directory
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
DIST_DIR = BASE_DIR / "dist"
MAX_PDF_BYTES = int(os.getenv("MAX_PDF_BYTES", str(30 * 1024 * 1024)))
CONNECT_TIMEOUT_SECONDS = int(os.getenv("PDF_CONNECT_TIMEOUT", "10"))
READ_TIMEOUT_SECONDS = int(os.getenv("PDF_READ_TIMEOUT", "90"))
MAX_REDIRECTS = 3
ARCHIVE_CDX_URL = "https://web.archive.org/cdx/search/cdx"
FDA_DRUGSFDA_API = "https://api.fda.gov/drug/drugsfda.json"
APP_VERSION = "fda-download-fix-2026-07-16"
ALLOWED_ORIGINS = {
    origin.strip().rstrip("/")
    for origin in os.getenv("ALLOWED_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(",")
    if origin.strip()
}

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024  # JSON API has no file uploads.


@app.after_request
def add_security_headers(response):
    """Allow only configured development/separate-frontend origins."""
    origin = request.headers.get("Origin", "").rstrip("/")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


def is_public_ip(address: str) -> bool:
    """Reject loopback, private, link-local and other non-public targets."""
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return False
    return ip.is_global


def validate_public_http_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("A valid public HTTP(S) URL is required.")
    if parsed.username or parsed.password:
        raise ValueError("URLs with credentials are not allowed.")
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        addresses: Iterable[tuple] = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, ValueError) as exc:
        raise ValueError("The PDF host could not be resolved.") from exc
    if not addresses or any(not is_public_ip(item[4][0]) for item in addresses):
        raise ValueError("The PDF URL must use a public internet host.")
    return value


def filename_from_url(url: str) -> str:
    filename = secure_filename(urlparse(url).path.rsplit("/", 1)[-1])
    return filename if filename.lower().endswith(".pdf") else "document.pdf"


def find_archived_pdf(original_url: str) -> str | None:
    """Return the most recent public PDF snapshot for a dead source URL, if any."""
    try:
        response = requests.get(
            ARCHIVE_CDX_URL,
            params={
                "url": original_url,
                "output": "json",
                "fl": "timestamp,original",
                "filter": ["statuscode:200", "mimetype:application/pdf"],
                "collapse": "digest",
                "limit": "1",
                "sort": "reverse",
            },
            timeout=(CONNECT_TIMEOUT_SECONDS, 20),
            headers={"User-Agent": "Patent-PDF-Suite/1.0"},
        )
        response.raise_for_status()
        rows = response.json()
        if len(rows) < 2 or len(rows[1]) < 2:
            return None
        timestamp, archived_original = rows[1][0], rows[1][1]
        return f"https://web.archive.org/web/{timestamp}id_/{archived_original}"
    except (requests.RequestException, ValueError, IndexError, TypeError):
        return None


@lru_cache(maxsize=512)
def get_fda_application_documents(application_number: str) -> list[dict]:
    """Look up official Drugs@FDA document records for a single application."""
    try:
        response = requests.get(
            FDA_DRUGSFDA_API,
            params={"search": f'application_number:"{application_number}"', "limit": "1"},
            timeout=(CONNECT_TIMEOUT_SECONDS, 20),
            headers={"User-Agent": "Patent-PDF-Suite/1.0"},
        )
        response.raise_for_status()
        result = response.json().get("results", [{}])[0]
        return [
            doc
            for submission in result.get("submissions", [])
            for doc in submission.get("application_docs", [])
            if isinstance(doc, dict)
        ]
    except (requests.RequestException, ValueError, IndexError, TypeError):
        return []


def find_fda_replacement_pdf(original_url: str, action_date: str) -> str | None:
    """Find the official FDA Label PDF for the exact Excel Action Date.

    Old accessdata URLs encode the FDA application number in their filename.
    Drugs@FDA exposes current document URLs keyed by that application number.
    We only accept an exact date-and-label match so another historical record is
    never silently substituted.
    """
    parsed = urlparse(original_url)
    if parsed.hostname not in {"accessdata.fda.gov", "www.accessdata.fda.gov"}:
        return None
    if "/drugsatfda_docs/label/" not in parsed.path.lower() or not action_date:
        return None
    match = re.match(r"(\d{5,6})", Path(parsed.path).name)
    if not match:
        return None
    application_number = match.group(1).zfill(6)
    for doc in get_fda_application_documents(application_number):
        title = " ".join(
            str(doc.get(key, "")) for key in ("application_docs_title", "application_docs_type")
        ).lower()
        document_url = str(doc.get("application_docs_url", "")).strip()
        if doc.get("application_docs_date") == action_date and "label" in title and document_url:
            try:
                return validate_public_http_url(document_url)
            except ValueError:
                continue
    return None


def fetch_pdf(url: str, action_date: str = "", allow_fallback: bool = True) -> tuple[bytes, str, bool]:
    """Fetch a PDF with DNS/IP validation on every redirect and a size cap."""
    # Some public document portals reject generic script user agents even when
    # their PDF URL is valid. This browser-compatible header keeps legitimate
    # public downloads working without forwarding user credentials.
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
        ),
        "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
    }
    current_url = validate_public_http_url(url)

    for _ in range(MAX_REDIRECTS + 1):
        response = requests.get(
            current_url,
            headers=headers,
            timeout=(CONNECT_TIMEOUT_SECONDS, READ_TIMEOUT_SECONDS),
            stream=True,
            allow_redirects=False,
        )
        if response.is_redirect:
            location = response.headers.get("Location")
            response.close()
            if not location:
                raise ValueError("The PDF server returned an invalid redirect.")
            current_url = validate_public_http_url(urljoin(current_url, location))
            continue
        try:
            if response.status_code >= 400:
                if response.status_code == 404 and allow_fallback:
                    official_fda_url = find_fda_replacement_pdf(current_url, action_date)
                    if official_fda_url:
                        return (*fetch_pdf(official_fda_url, action_date, allow_fallback=False)[:2], True)
                    archived_url = find_archived_pdf(current_url)
                    if archived_url:
                        return (*fetch_pdf(archived_url, action_date, allow_fallback=False)[:2], True)
                raise ValueError(f"The source server returned HTTP {response.status_code}.")
            try:
                declared_size = int(response.headers.get("Content-Length", "0"))
            except ValueError:
                declared_size = 0
            if declared_size > MAX_PDF_BYTES:
                raise ValueError("The PDF is larger than the allowed 30 MB limit.")
            chunks, received = [], 0
            for chunk in response.iter_content(chunk_size=64 * 1024):
                if not chunk:
                    continue
                received += len(chunk)
                if received > MAX_PDF_BYTES:
                    raise ValueError("The PDF is larger than the allowed 30 MB limit.")
                chunks.append(chunk)
            content = b"".join(chunks)
        finally:
            response.close()
        if not content:
            raise ValueError("The server returned an empty file.")
        # PDF files normally start with this marker; reject HTML/error pages.
        if not content.lstrip()[:5].startswith(b"%PDF-"):
            raise ValueError("The URL did not return a valid PDF file.")
        return content, filename_from_url(url), False
    raise ValueError("Too many redirects while downloading the PDF.")


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "version": APP_VERSION})


@app.route("/api/download-pdf", methods=["POST", "OPTIONS"])
def download_pdf():
    if request.method == "OPTIONS":
        return ("", 204)
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"success": False, "error": "A JSON request body is required."}), 400
    url = str(payload.get("url", "")).strip()
    action_date = str(payload.get("actionDate", "")).strip()
    try:
        content, filename, restored_from_archive = fetch_pdf(url, action_date)
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400
    except requests.RequestException:
        return jsonify({"success": False, "error": "Could not download the PDF from its source."}), 502
    response = send_file(BytesIO(content), mimetype="application/pdf", as_attachment=True, download_name=filename)
    if restored_from_archive:
        response.headers["X-PDF-Source"] = "Internet-Archive"
    return response


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path: str):
    """Serve Vite's production build and support client-side route refreshes."""
    if not DIST_DIR.is_dir():
        return jsonify({"error": "Frontend build not found. Run npm run build."}), 503
    candidate = DIST_DIR / path
    if path and candidate.is_file():
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, "index.html")


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
