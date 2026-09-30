---
name: stirling-pdf
description: >-
  Stirling PDF is a self-hosted web application with an HTTP API that merges,
  splits, compresses, converts, OCRs, watermarks and password-protects PDF
  files on your own server. Use when a user asks to deploy Stirling PDF with
  Docker, configure it with environment variables or settings.yml, call the
  Stirling PDF API from curl or Python, batch-process PDFs without uploading
  them to a cloud service, or chain several operations with the pipeline
  endpoint.
license: Apache-2.0
compatibility: "Docker Engine with the Compose plugin (or Podman) on a 64-bit host; curl and jq for the API examples; Python 3.10+ with requests for the scripted example"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: documents
  tags: ["pdf", "self-hosted", "docker", "rest-api", "ocr"]
  repository: https://github.com/Stirling-Tools/Stirling-PDF
---
# Stirling PDF — Self-hosted PDF processing with an HTTP API

## Overview

Stirling PDF packages more than 50 PDF tools behind a web UI and a REST API. It runs as one container, keeps documents on the host, and lets scripts call the same operations the UI offers. This skill covers deployment with Docker, configuration, and API calls from the shell and from Python.

## Instructions

### Installation

Create `compose.yaml` in an empty directory such as `/opt/stirling-pdf`:

```yaml
services:
  stirling-pdf:
    image: docker.stirlingpdf.com/stirlingtools/stirling-pdf:latest
    container_name: stirling-pdf
    ports:
      - "127.0.0.1:8080:8080"          # remove 127.0.0.1 to serve the local network
    volumes:
      - ./stirling-data/configs:/configs               # settings and database
      - ./stirling-data/tessdata:/usr/share/tessdata   # OCR language files
      - ./stirling-data/logs:/logs
      - ./stirling-data/pipeline:/pipeline             # automation configs
    environment:
      SECURITY_ENABLELOGIN: "true"
      SECURITY_INITIALLOGIN_USERNAME: admin
      SECURITY_INITIALLOGIN_PASSWORD: ${STIRLING_ADMIN_PASSWORD}
      SECURITY_CUSTOMGLOBALAPIKEY: ${STIRLING_API_KEY}
      SYSTEM_DEFAULTLOCALE: en-GB
      SYSTEM_FILEUPLOADLIMIT: 500MB
      JAVA_TOOL_OPTIONS: "-Xms512m -Xmx4g"
    restart: unless-stopped
```

```bash
cd /opt/stirling-pdf
read -rs STIRLING_ADMIN_PASSWORD && export STIRLING_ADMIN_PASSWORD   # typed by the user; not echoed
export STIRLING_API_KEY="$(openssl rand -hex 32)"                    # store it in a password manager
docker compose up -d
curl -s http://localhost:8080/api/v1/info/status | jq -S .
```

The status call needs no key and returns `{"status": "UP", "version": "3.0.1"}`.

| Image tag | Contents |
|---|---|
| `latest` | All PDF features; the default choice |
| `latest-fat` | Same, plus extra fonts and conversion dependencies |
| `latest-ultra-lite` | Core tools only: no OCR, compression, repair or Office conversion |

Update with `docker compose pull && docker compose up -d`. Data in the mounted folders survives the update.

### Configuration

Settings can be given in three places. Environment variables win over `/configs/custom_settings.yml`, which wins over `/configs/settings.yml` and the in-app settings. A YAML path becomes a variable name by writing it in upper case and replacing dots with underscores:

```yaml
# ./stirling-data/configs/settings.yml
security:
  enableLogin: true          # same as SECURITY_ENABLELOGIN=true
system:
  defaultLocale: en-GB       # same as SYSTEM_DEFAULTLOCALE=en-GB
  fileUploadLimit: "500MB"   # same as SYSTEM_FILEUPLOADLIMIT=500MB
```

Restart the container after changing environment variables. For more OCR languages, download the `.traineddata` files from the Tesseract `tessdata` or `tessdata_fast` repository into `./stirling-data/tessdata` and keep `eng.traineddata` in place.

### Authentication

Login is enabled by default. Every API call then needs the header `X-API-KEY`. Two kinds of key exist:

- A personal key, which the user copies from **Settings → Preferences → API Keys** in the web UI.
- The global key set with `SECURITY_CUSTOMGLOBALAPIKEY`, as in the Compose file above.

Scripts read the key from `$STIRLING_API_KEY`. A missing key gives HTTP 401 with a JSON error; a wrong key gives 401 with the text `Invalid API Key.`

### Calling the API

Every operation is a `POST` with `multipart/form-data` under `/api/v1/` followed by a category and an operation name. The uploaded file is always the field `fileInput`. The response body is the resulting file.

| Operation | Path | Main fields |
|---|---|---|
| Merge | `/api/v1/general/merge-pdfs` | `fileInput` (repeat per file), `sortType`, `generateToc` |
| Split | `/api/v1/general/split-pages` | `pageNumbers` (split points such as `2,5`); returns a ZIP |
| Rotate | `/api/v1/general/rotate-pdf` | `angle`: 90, 180 or 270 |
| Compress | `/api/v1/misc/compress-pdf` | `optimizeLevel` 1–9, or `expectedOutputSize` such as `2MB` |
| OCR | `/api/v1/misc/ocr-pdf` | `languages` (repeat), `ocrType`, `ocrRenderType`, `sidecar`, `deskew` |
| PDF to images | `/api/v1/convert/pdf/img` | `imageFormat`, `singleOrMultiple`, `colorType`, `dpi`, `pageNumbers` |
| Office file to PDF | `/api/v1/convert/file/pdf` | `fileInput` |
| Password | `/api/v1/security/add-password`, `/api/v1/security/remove-password` | `password`, `ownerPassword`, `keyLength` |
| Watermark | `/api/v1/security/add-watermark` | `watermarkType`, `watermarkText`, `fontSize`, `opacity`, `rotation` |

```bash
BASE=http://localhost:8080

# OCR a scan in English and German; skip pages that already contain text
curl -sS -X POST "$BASE/api/v1/misc/ocr-pdf" -H "X-API-KEY: $STIRLING_API_KEY" \
  -F "fileInput=@lease-2019-scan.pdf" -F "languages=eng" -F "languages=deu" \
  -F "ocrType=skip-text" -F "ocrRenderType=hocr" \
  -o lease-2019-searchable.pdf -w "%{http_code} %{size_download}\n"

# Render pages 1 to 3 as 150 dpi PNG files (ZIP archive)
curl -sS -X POST "$BASE/api/v1/convert/pdf/img" -H "X-API-KEY: $STIRLING_API_KEY" \
  -F "fileInput=@floorplan.pdf" -F "imageFormat=png" -F "singleOrMultiple=multiple" \
  -F "colorType=color" -F "dpi=150" -F "pageNumbers=1-3" -o floorplan-pages.zip
```

The full list of endpoints and fields is in the Swagger UI of the instance at `/swagger-ui.html`; the OpenAPI document is served at `/v1/api-docs`.

### Pipelines and long jobs

`POST /api/v1/pipeline/handleData` runs several operations in one request. It takes `fileInput` and a `json` field in which each step names the full endpoint path:

```bash
curl -sS -X POST "$BASE/api/v1/pipeline/handleData" -H "X-API-KEY: $STIRLING_API_KEY" \
  -F "fileInput=@board-pack-october.pdf" \
  -F 'json={"name":"repair-then-compress","pipeline":[
        {"operation":"/api/v1/misc/repair","parameters":{}},
        {"operation":"/api/v1/misc/compress-pdf","parameters":{"optimizeLevel":4}}]}' \
  -o board-pack-october-small.pdf -w "%{http_code} %{size_download}\n"
```

One output file is returned directly; several are returned as `output.zip`. For long jobs add `?async=true` to any operation. The response then contains a `jobId`; poll `GET /api/v1/general/job/JOB_ID` until `complete` is true and fetch the file from `GET /api/v1/general/job/JOB_ID/result`.

## Examples

### Example 1: Merge invoices and protect the result

**User request:** "Combine the three September invoices into one PDF and put a password on it before I send it to the accountant."

```bash
BASE=http://localhost:8080
read -rs PDF_PASSWORD        # typed by the user: the password for the accountant
curl -sS -X POST "$BASE/api/v1/general/merge-pdfs" -H "X-API-KEY: $STIRLING_API_KEY" \
  -F "fileInput=@invoice-2026-0917.pdf" -F "fileInput=@invoice-2026-0922.pdf" \
  -F "fileInput=@invoice-2026-0928.pdf" -F "sortType=orderProvided" \
  -o invoices-2026-09.pdf -w "%{http_code} %{size_download}\n"
curl -sS -X POST "$BASE/api/v1/security/add-password" -H "X-API-KEY: $STIRLING_API_KEY" \
  -F "fileInput=@invoices-2026-09.pdf" -F "password=$PDF_PASSWORD" -F "keyLength=256" \
  -F "preventModify=true" -o invoices-2026-09-protected.pdf -w "%{http_code} %{size_download}\n"
```

**Result:**

```text
200 412873
200 414106
```

`invoices-2026-09-protected.pdf` holds the three invoices in the given order and asks for the password when opened.

### Example 2: Make a folder of scans searchable and smaller

**User request:** "OCR every PDF in /srv/scans/inbox, shrink it, and put the result in /srv/scans/done."

```python
import json, os, pathlib, requests

BASE = os.environ.get("STIRLING_URL", "http://localhost:8080")
HEADERS = {"X-API-KEY": os.environ["STIRLING_API_KEY"]}
PIPELINE = {
    "name": "ocr-then-compress",
    "pipeline": [
        {"operation": "/api/v1/misc/ocr-pdf",
         "parameters": {"languages": ["eng", "deu"], "ocrType": "skip-text", "ocrRenderType": "hocr"}},
        {"operation": "/api/v1/misc/compress-pdf", "parameters": {"optimizeLevel": 4}},
    ],
}
src, dst = pathlib.Path("/srv/scans/inbox"), pathlib.Path("/srv/scans/done")
dst.mkdir(parents=True, exist_ok=True)

for pdf in sorted(src.glob("*.pdf")):
    with pdf.open("rb") as fh:
        resp = requests.post(
            f"{BASE}/api/v1/pipeline/handleData", headers=HEADERS,
            files={"fileInput": (pdf.name, fh, "application/pdf")},
            data={"json": json.dumps(PIPELINE)}, timeout=900,
        )
    resp.raise_for_status()
    if not resp.content:
        raise SystemExit(f"{pdf.name}: empty response, see 'docker logs stirling-pdf'")
    (dst / pdf.name).write_bytes(resp.content)
    print(f"{pdf.name}: {pdf.stat().st_size // 1024} KB -> {len(resp.content) // 1024} KB")
```

**Result:**

```text
delivery-note-0412.pdf: 3812 KB -> 946 KB
lease-2019-scan.pdf: 9240 KB -> 2105 KB
tax-office-letter.pdf: 1477 KB -> 388 KB
```

## Guidelines

- **Change the default login.** Without `SECURITY_INITIALLOGIN_*`, a fresh instance creates `admin` with the password `stirling`. Set `SECURITY_ENABLELOGIN=false` only on a machine nobody else can reach, because the API is then open to everyone who can connect.
- **Protect the key in transit.** `X-API-KEY` is sent in clear text over HTTP. Keep the port bound to `127.0.0.1` or put a reverse proxy with TLS in front. Never write the key into scripts or the Compose file; read it from the environment.
- **API calls are metered.** On a server that is not linked to a Stirling account, tool calls made with an API key and pipeline runs count against 1,000 document units per month. A file costs one unit per 25 pages or 5 MB, whichever is more. Work done by hand in the web UI does not count. Tell the user before starting a large batch.
- **Pipelines fail quietly.** A wrong operation path, a missing required field or a failed step gives HTTP 200 with an empty body. Check the response size and read `docker logs stirling-pdf`.
- **Use full paths in pipeline JSON.** Steps use `/api/v1/misc/compress-pdf`, not `compress-pdf`. Steps that need a second file, such as an image watermark, cannot be expressed in a pipeline; call that endpoint directly.
- **Always send `ocrType` and `languages` for OCR.** Languages that are not installed are dropped, and the call fails when none is left.
- **Uploads are limited.** The default limit is 2000 MB per file and per request. Lower it with `SYSTEM_FILEUPLOADLIMIT` on shared servers and raise the Java heap for large files.
- **Not everything is in the API.** Tools that run only in the browser, such as viewing and drawing a signature by hand, have no endpoint.
- **Open core.** The free plan covers all PDF operations for up to 5 users. An external database needs a Team licence; SAML single sign-on, the Prometheus endpoint and audit logs need Enterprise.
- **When not to use it.** For a single merge on a developer machine a local library or `qpdf` is lighter than a Java service. Stirling PDF processes existing documents; to generate invoices or reports from data, use a PDF generation library.
