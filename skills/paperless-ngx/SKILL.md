---
name: paperless-ngx
description: >-
  Paperless-ngx is a self-hosted document archive that OCRs scanned paper and PDFs, indexes the text, and lets you search and organise everything with tags, correspondents and custom fields. Use it when the user asks to "set up a paperless office", "digitise and archive my scanned documents", "self-host a document management system", "upload PDFs through an API", "search my archive by correspondent or tag", or "script Paperless-ngx". Covers Docker Compose deployment, the consumption folder, token-authenticated REST API calls, bulk edits and export.
license: Apache-2.0
compatibility: "Docker 24+ with Compose v2, 2 GB RAM, a shell with curl and python3"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: documents
  tags: "paperless-ngx, document-management, ocr, self-hosted, docker"
  repository: https://github.com/paperless-ngx/paperless-ngx
---
# Paperless-ngx — self-hosted, OCR-searchable document archive

## Overview

Paperless-ngx runs as a small stack (web server plus task workers in one container, a Redis-compatible broker, and a database; SQLite or PostgreSQL). Every file it receives is OCR'd and indexed; scanned or image-only files also get a searchable PDF/A archive copy next to the original. Documents get a title, a creation date, tags, a correspondent, a document type, an optional archive serial number and custom fields. Rules can assign these automatically from the document text.

An agent's job here is deployment and automation, not clicking: bring the stack up, create the organisational objects through the REST API, push documents in (API upload or the consumption folder), and query or export them. The commands were run against version 3.4.2 with the SQLite compose variant.

## Instructions

### Deploy with Docker Compose

Fetch the official SQLite compose files from the project repository into a new directory, then edit them:

```bash
mkdir -p ~/paperless && cd ~/paperless || exit 1
REPO_RAW=raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docker/compose
curl -fsSL -o docker-compose.yml https://$REPO_RAW/docker-compose.sqlite.yml
curl -fsSL -o docker-compose.env https://$REPO_RAW/docker-compose.env
curl -fsSL -o .env https://$REPO_RAW/.env
```

Edit `docker-compose.yml`:

- Replace `ghcr.io/paperless-ngx/paperless-ngx:latest` with a pinned tag from the project's releases page (for example `3.4.2`) so updates are deliberate.
- Change the port mapping `"8000:8000"` to `"127.0.0.1:8000:8000"` so only the local machine can reach it; put a TLS reverse proxy in front for remote access.

In `docker-compose.env` set at least these values (the secret and password below are throwaway examples; generate your own):

```bash
PAPERLESS_SECRET_KEY=k3Zp9vQ2xLw7TnR4bYd8HfJ1sUcA6eMgXo5iVtNqB0zWyPrDhE2aCjSlKm3uFvG9
PAPERLESS_TIME_ZONE=Europe/Berlin
PAPERLESS_OCR_LANGUAGE=eng
PAPERLESS_ADMIN_USER=admin
PAPERLESS_ADMIN_PASSWORD=Vf8-Qm2-Lx9-Tr4-Wn7
USERMAP_UID=1000
USERMAP_GID=1000
```

Generate your own secret with `python3 -c "import secrets; print(secrets.token_urlsafe(64))"`. `PAPERLESS_SECRET_KEY` is required; the shipped value `change-me` must not stay. `PAPERLESS_ADMIN_USER` and `PAPERLESS_ADMIN_PASSWORD` create a superuser at first start (they never overwrite an existing user). Set `USERMAP_UID`/`USERMAP_GID` to the output of `id -u` and `id -g` so the host user can write into `./consume`. For more than a household of documents use `docker-compose.postgres.yml` from the same folder instead. OCR defaults to English; add `PAPERLESS_OCR_LANGUAGE=deu+eng` for mixed languages.

Start it and wait for the API:

```bash
docker compose pull
docker compose up -d
until curl -s -o /dev/null http://127.0.0.1:8000/api/; do sleep 3; done
docker compose logs --tail 20 webserver
```

The first start takes up to a minute while migrations run. An unauthenticated `GET /api/` answers with a redirect (302); that is a healthy sign.

### Authenticate against the API

Exchange the admin login for a token and keep it in an environment variable:

```bash
export PAPERLESS_URL=http://127.0.0.1:8000
export PAPERLESS_TOKEN=$(curl -s -X POST $PAPERLESS_URL/api/token/ \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"$PAPERLESS_ADMIN_PASSWORD\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
```

Every call then sends `-H "Authorization: Token $PAPERLESS_TOKEN"`. Browse the full schema at `$PAPERLESS_URL/api/schema/view/`. For scripts, create a dedicated non-admin user in the web UI and use its token.

### Create tags, correspondents, types and custom fields

```bash
AUTH="Authorization: Token $PAPERLESS_TOKEN"
JSON='Content-Type: application/json'
curl -s -X POST $PAPERLESS_URL/api/correspondents/ -H "$AUTH" -H "$JSON" \
  -d '{"name":"Stadtwerke Musterhausen","match":"Stadtwerke Musterhausen","matching_algorithm":3}'
curl -s -X POST $PAPERLESS_URL/api/tags/ -H "$AUTH" -H "$JSON" -d '{"name":"utilities"}'
curl -s -X POST $PAPERLESS_URL/api/document_types/ -H "$AUTH" -H "$JSON" -d '{"name":"Invoice"}'
curl -s -X POST $PAPERLESS_URL/api/custom_fields/ -H "$AUTH" -H "$JSON" \
  -d '{"name":"Amount due","data_type":"monetary"}'
```

Each response contains the new `id`. `matching_algorithm` values: 0 none, 1 any word, 2 all words, 3 literal phrase, 4 regex, 5 fuzzy, 6 auto (learned from your documents). With a `match` text, new documents containing it are assigned the object automatically. The same pattern works for `/api/storage_paths/`; `/api/mail_accounts/`, `/api/mail_rules/` and `/api/workflows/` also exist.

### Upload documents

```bash
curl -s -X POST $PAPERLESS_URL/api/documents/post_document/ -H "$AUTH" \
  -F document=@invoice.pdf -F title="Stadtwerke invoice Oct 2026" \
  -F correspondent=1 -F document_type=1 -F tags=1
```

Optional form fields: `title`, `created`, `correspondent`, `document_type`, `storage_path`, `tags` (repeat for several), `archive_serial_number`, `custom_fields`. The reply is a task UUID. Consumption is asynchronous; poll it:

```bash
curl -s "$PAPERLESS_URL/api/tasks/?task_id=4a3e90c8-fc01-4fab-b5f0-6a306761c194" -H "$AUTH"
```

The task shows `status` (`success` or `failure`) and, on success, the id of the created document.

### Consumption folder

Files copied into `./consume` are picked up, processed and then removed from that folder, so copy, never move your only original. To sort scans by folder name, add to `docker-compose.env`:

```bash
PAPERLESS_CONSUMER_RECURSIVE=true
PAPERLESS_CONSUMER_SUBDIRS_AS_TAGS=true
```

A file dropped as `consume/taxes/2025/return.pdf` then gets the tags `taxes` and `2025`. On network filesystems (NFS, SMB) set `PAPERLESS_CONSUMER_POLLING_INTERVAL=10` because native file notifications are unreliable there. Restart with `docker compose up -d` after changing env values.

### Search and filter

```bash
# full-text query with the index (supports field syntax and highlights)
curl -s "$PAPERLESS_URL/api/documents/?query=electricity&fields=id,title,correspondent,tags" -H "$AUTH"
# simple substring search in title and content
curl -s "$PAPERLESS_URL/api/documents/?text=Musterhausen&fields=id,title" -H "$AUTH"
# structured filters
curl -s "$PAPERLESS_URL/api/documents/?correspondent__id=1&tags__id__all=1&fields=id,title" -H "$AUTH"
# custom field filter (URL-encode the JSON)
curl -s -G "$PAPERLESS_URL/api/documents/" -H "$AUTH" \
  --data-urlencode 'custom_field_query=["Amount due","icontains","148"]' --data-urlencode 'fields=id,title'
```

Use `fields=` to keep responses small; omit it only when you need the full OCR `content`. Pagination uses `page` and `page_size`.

### Edit, bulk edit, download

```bash
curl -s -X PATCH $PAPERLESS_URL/api/documents/2/ -H "$AUTH" -H "$JSON" \
  -d '{"document_type":1,"tags":[1],"custom_fields":[{"field":1,"value":"EUR148.90"}]}'
curl -s -X POST $PAPERLESS_URL/api/documents/bulk_edit/ -H "$AUTH" -H "$JSON" \
  -d '{"documents":[1,2],"method":"add_tag","parameters":{"tag":1}}'
curl -s -o invoice-archived.pdf $PAPERLESS_URL/api/documents/1/download/ -H "$AUTH"
```

Monetary custom fields take a string with a currency code prefix (`EUR148.90`). `bulk_edit` methods include `set_correspondent`, `set_document_type`, `add_tag`, `remove_tag`, `modify_tags` and `delete`; check the schema for the exact parameter names of each. `download/` returns the archive copy when one exists; add `?original=true` for the file exactly as uploaded.

### Backup and export

```bash
docker compose exec -T webserver document_exporter ../export
```

This writes all documents plus `manifest.json` into `./export` on the host. Restore into a fresh instance with `document_importer`. Also back up the Docker volumes and `docker-compose.env`.

## Examples

### 1. Stand up an archive and ingest a scanned electricity bill

**Request:** "Set up Paperless-ngx on this machine, and file the PDF `invoice.pdf` as an Invoice from Stadtwerke Musterhausen."

```bash
cd ~/paperless || exit 1
docker compose up -d
until curl -s -o /dev/null http://127.0.0.1:8000/api/; do sleep 3; done
# token, correspondent, tag and type as shown above, then:
curl -s -X POST $PAPERLESS_URL/api/documents/post_document/ -H "$AUTH" \
  -F document=@invoice.pdf -F correspondent=1 -F document_type=1 -F tags=1
```

**Result:** the upload returns a quoted task UUID. Within seconds `GET /api/tasks/?task_id=<uuid>` reports `"status": "success"`. A search for `query=electricity` returns the document with its OCR text highlighted, correspondent 1, document type 1 and tag 1.

### 2. Auto-file scanner output and pull a monthly list

**Request:** "My scanner drops PDFs into the consume folder. File anything mentioning Stadtwerke automatically, and list this archive's utility invoices."

```bash
curl -s -X POST $PAPERLESS_URL/api/correspondents/ -H "$AUTH" -H "$JSON" \
  -d '{"name":"Stadtwerke Musterhausen","match":"Stadtwerke Musterhausen","matching_algorithm":3}'
cp scan-0412.pdf ./consume/
curl -s "$PAPERLESS_URL/api/documents/?correspondent__id=1&fields=id,title,created" -H "$AUTH"
```

**Result:** the copied scan disappears from `./consume`, appears as a new document already assigned to the correspondent (matched from its text), and the listing returns it with its title and creation date.

## Guidelines

- Pin the image tag and read the release notes before upgrading; run `document_exporter` first. Do not auto-update unattended.
- Bind to 127.0.0.1 and add a TLS reverse proxy for remote use. Never expose port 8000 directly; set `PAPERLESS_URL` to the public address when a proxy is used.
- Keep `PAPERLESS_SECRET_KEY`, the admin password and API tokens out of git and chat logs; read them from environment variables.
- Documents are stored unencrypted on the volumes; use disk encryption for sensitive archives.
- Uploads are processed asynchronously. Always check the task result instead of assuming success; OCR of a big scan can take minutes.
- OCR quality depends on the input: 300 dpi scans and the right `PAPERLESS_OCR_LANGUAGE` matter more than any setting.
- Deleting through the API (`DELETE /api/documents/<id>/`, bulk `delete`) is permanent for the archive; confirm before running it.
- Not a fit for collaborative editing or e-signature; it archives and searches finished documents. For one-off PDF text extraction, use a PDF skill instead.
