---
title: Build a Searchable Paper Archive with Paperless-ngx
slug: build-searchable-paper-archive-with-paperless-ngx
description: Scan a drawer of paper and PDFs into a self-hosted, OCR-searchable archive that files documents by sender and type, for a household or a very small office.
skills:
  - paperless-ngx
  - docker-helper
category: documents
tags:
  - document-management
  - ocr
  - self-hosted
  - archive
  - paperless
  - scanning
---

## The Problem

Elena Vargas runs a two-person bookkeeping practice from a home office. Her paperwork lives in three places: a filing cabinet with eight years of utility bills, insurance letters and tax notices; a "Scans" folder with 1,400 files named `scan0001.pdf`; and an inbox full of PDF attachments. When the tax office asks for the 2023 heating invoice, she spends an evening opening files until she finds it.

She does not want to upload family and client documents to a cloud service, and she does not need data extraction from each file. She needs one private place where every document is read by OCR, filed under the right sender and type, and found with a single search.

## The Solution

Deploy Paperless-ngx on her always-on mini PC with Docker Compose, bound to the local machine. The agent uses `docker-helper` to bring up and check the stack, and `paperless-ngx` to create tags, correspondents and document types through the REST API, import the 1,400 existing scans, and keep a drop folder open for the scanner. Matching rules file new documents automatically; a periodic export covers backups.

## Step-by-Step Walkthrough

### 1. Deploy the stack

Prompt: "Set up Paperless-ngx on this machine with Docker Compose, local access only, version pinned."

The agent downloads the official SQLite compose files from the project repository into `~/paperless`, pins the image tag, binds the port to loopback, and fills in the environment file:

```bash
mkdir -p ~/paperless && cd ~/paperless || exit 1
REPO_RAW=raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docker/compose
curl -fsSL -o docker-compose.yml https://$REPO_RAW/docker-compose.sqlite.yml
curl -fsSL -o docker-compose.env https://$REPO_RAW/docker-compose.env
curl -fsSL -o .env https://$REPO_RAW/.env
sed -i 's#paperless-ngx:latest#paperless-ngx:3.4.2#; s#"8000:8000"#"127.0.0.1:8000:8000"#' docker-compose.yml
```

It then sets `PAPERLESS_SECRET_KEY` (generated with `python3 -c "import secrets; print(secrets.token_urlsafe(64))"`), `PAPERLESS_TIME_ZONE=Europe/Berlin`, `PAPERLESS_OCR_LANGUAGE=deu+eng`, the admin user and password, and `USERMAP_UID`/`USERMAP_GID` from `id -u` and `id -g`. Starting and checking:

```bash
docker compose pull && docker compose up -d
until curl -s -o /dev/null http://127.0.0.1:8000/api/; do sleep 3; done
docker compose ps
```

### 2. Create the filing structure through the API

Prompt: "Create correspondents for my utilities and the tax office, plus tags and document types."

```bash
export PAPERLESS_URL=http://127.0.0.1:8000
export PAPERLESS_TOKEN=$(curl -s -X POST $PAPERLESS_URL/api/token/ \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"$PAPERLESS_ADMIN_PASSWORD\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
AUTH="Authorization: Token $PAPERLESS_TOKEN"; JSON='Content-Type: application/json'

for name in "Stadtwerke Musterhausen" "Finanzamt Musterhausen" "Nordring Versicherung"; do
  curl -s -X POST $PAPERLESS_URL/api/correspondents/ -H "$AUTH" -H "$JSON" \
    -d "{\"name\":\"$name\",\"match\":\"$name\",\"matching_algorithm\":3}"
done
for t in Invoice Letter Contract; do
  curl -s -X POST $PAPERLESS_URL/api/document_types/ -H "$AUTH" -H "$JSON" -d "{\"name\":\"$t\"}"
done
curl -s -X POST $PAPERLESS_URL/api/tags/ -H "$AUTH" -H "$JSON" -d '{"name":"taxes"}'
curl -s -X POST $PAPERLESS_URL/api/custom_fields/ -H "$AUTH" -H "$JSON" \
  -d '{"name":"Amount due","data_type":"monetary"}'
```

Matching algorithm 3 is "literal phrase": any new document whose text contains the sender's name is assigned to that correspondent.

### 3. Import the backlog

Prompt: "Import everything in ~/Scans, using the folder names as tags."

The agent enables folder-based tagging in `docker-compose.env`, restarts, and copies the files (copies, because Paperless removes consumed files from the drop folder):

```bash
cd ~/paperless || exit 1
printf 'PAPERLESS_CONSUMER_RECURSIVE=true\nPAPERLESS_CONSUMER_SUBDIRS_AS_TAGS=true\n' >> docker-compose.env
docker compose up -d
cp -r ~/Scans/. ./consume/
sleep 60; ls consume | wc -l
curl -s "$PAPERLESS_URL/api/documents/?page_size=1&fields=id" -H "$AUTH"
```

The count in the API response grows while OCR works through the queue. The agent checks failed tasks afterwards with `GET /api/tasks/` and reports the files that need a rescan.

### 4. Make the scanner feed the archive

Prompt: "My scanner saves to a network share. Make Paperless pick those up."

If the share is mounted on the host, the agent mounts it into the consume directory (a second volume line in `docker-compose.yml`), and because network filesystems often miss file events it adds polling:

```bash
printf 'PAPERLESS_CONSUMER_POLLING_INTERVAL=10\n' >> docker-compose.env
docker compose up -d
```

### 5. Find, correct and export

Prompt: "Find the heating invoices from Stadtwerke, keep the ones created in 2023, and tag them for the tax return."

```bash
curl -s -G "$PAPERLESS_URL/api/documents/" -H "$AUTH" \
  --data-urlencode 'query=heating' --data-urlencode 'correspondent__id=1' \
  --data-urlencode 'fields=id,title,created'
curl -s -X POST $PAPERLESS_URL/api/documents/bulk_edit/ -H "$AUTH" -H "$JSON" \
  -d '{"documents":[212,245,301],"method":"add_tag","parameters":{"tag":1}}'
docker compose exec -T webserver document_exporter ../export
```

The last command writes every document and a `manifest.json` into `~/paperless/export`, which Elena includes in her nightly backup job.

## Real-World Example

On a Saturday, the agent deploys the stack in about ten minutes and imports 1,412 scans. Roughly 1,350 consume cleanly; 41 fail OCR because they are skewed phone photos, and the agent lists them for rescanning. The literal-phrase correspondents file around 600 documents on their own. The next Monday the tax office asks for the 2023 heating invoice: Elena types "heating" in the search box, filters by correspondent, and has the PDF in under a minute. The new scanner folder keeps filling the archive without any manual step, and the nightly export gives her a restorable copy.

## Related Skills

- [paperless-ngx](/skills/paperless-ngx) — deploys the archive, creates the filing structure through the REST API, imports documents and runs the export
- [docker-helper](/skills/docker-helper) — checks container state, logs and Compose changes while bringing the stack up
