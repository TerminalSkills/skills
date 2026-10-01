---
name: airtable
description: >-
  Airtable is a hosted spreadsheet-database; its Web API reads and writes
  records, table schema, attachments and webhooks over REST. Use when tasks
  involve reading or writing Airtable data, importing or upserting rows from a
  CSV or another system, syncing external sources with Airtable bases, reacting
  to record changes with webhooks, connecting users through Airtable OAuth, or
  debugging 422 and 429 responses from api.airtable.com.
license: Apache-2.0
compatibility: "Airtable account with a personal access token or an OAuth integration; code samples use Python 3.9+ with requests"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: productivity
  tags: ["airtable", "api", "productivity", "databases", "automation"]
---

# Airtable API Integration

## Overview

The Airtable Web API is a REST API at `https://api.airtable.com/v0`. Records live in tables inside a base; IDs are prefixed by type (`app…` base, `tbl…` table, `fld…` field, `rec…` record, `viw…` view). Requests authenticate with a bearer token: a personal access token (PAT) for your own scripts, or an OAuth access token when other users connect their accounts. Legacy API keys stopped working on February 1, 2024. Writes are limited to 10 records per request and every base to 5 requests per second.

## Instructions

### Authentication

Create a personal access token at https://airtable.com/create/tokens, add only the scopes and bases the script needs, and keep it in an environment variable.

```bash
export AIRTABLE_TOKEN="pat..."        # set from your secret manager; never commit it
curl -s https://api.airtable.com/v0/meta/whoami -H "Authorization: Bearer $AIRTABLE_TOKEN"
# {"id":"usrL2PNC5o3H4lBEi"}
```

| Scope | Allows |
|---|---|
| `data.records:read` / `data.records:write` | Read / create, update and delete records |
| `schema.bases:read` / `schema.bases:write` | Read / change tables and fields |
| `webhook:manage` | Create, list and delete webhooks, fetch payloads; creating a `tableData` webhook and reading its payloads also need `data.records:read` |
| `user.email:read` | Email address in `whoami` |

### Records

```python
"""airtable_client.py — minimal Airtable Web API client."""
import base64, hashlib, hmac, os, time
import requests

API = "https://api.airtable.com/v0"
session = requests.Session()
session.headers["Authorization"] = f"Bearer {os.environ['AIRTABLE_TOKEN']}"

def call(method: str, url: str, **kwargs) -> dict:
    """One request, throttled to 5 per second; waits 30 s and retries on 429."""
    for _ in range(4):
        resp = session.request(method, url, timeout=30, **kwargs)
        if resp.status_code != 429:
            break
        time.sleep(30)
    if not resp.ok:
        raise RuntimeError(f"{method} {url} -> {resp.status_code} {resp.text}")
    time.sleep(0.2)
    return resp.json()

def batches(items: list, size: int = 10):
    for i in range(0, len(items), size):
        yield items[i:i + size]

def list_records(base_id, table, formula=None, fields=None, view=None, sort=None) -> list:
    """Every record of a table. POST /listRecords keeps long formulas out of the URL."""
    options = {"filterByFormula": formula, "fields": fields, "view": view, "sort": sort}
    body = {k: v for k, v in options.items() if v}
    records = []
    while True:
        page = call("POST", f"{API}/{base_id}/{table}/listRecords", json=body)
        records += page["records"]
        if "offset" not in page:
            return records
        body["offset"] = page["offset"]

def create_records(base_id, table, rows: list[dict], typecast=False) -> list:
    created = []
    for batch in batches(rows):
        body = {"records": [{"fields": row} for row in batch], "typecast": typecast}
        created += call("POST", f"{API}/{base_id}/{table}", json=body)["records"]
    return created

def update_records(base_id, table, updates: list[dict]) -> list:
    """updates = [{"id": "rec...", "fields": {...}}]; PATCH leaves other fields untouched."""
    updated = []
    for batch in batches(updates):
        updated += call("PATCH", f"{API}/{base_id}/{table}", json={"records": batch})["records"]
    return updated

def upsert_records(base_id, table, rows: list[dict], merge_on: list[str], typecast=False):
    """Update rows that match on the merge_on fields and create the rest."""
    created, updated = [], []
    for batch in batches(rows):
        body = {"performUpsert": {"fieldsToMergeOn": merge_on}, "typecast": typecast,
                "records": [{"fields": row} for row in batch]}
        data = call("PATCH", f"{API}/{base_id}/{table}", json=body)
        created += data["createdRecords"]
        updated += data["updatedRecords"]
    return created, updated

def delete_records(base_id, table, record_ids: list[str]) -> list:
    deleted = []
    for batch in batches(record_ids):
        params = [("records[]", record_id) for record_id in batch]
        deleted += call("DELETE", f"{API}/{base_id}/{table}", params=params)["records"]
    return deleted
```

- A list page holds at most 100 records (`pageSize`); follow `offset` until it is absent. `maxRecords` caps the total. `GET /v0/{baseId}/{table}` takes the same options as query parameters, but the URL must stay under 16,000 characters.
- Fields whose value is empty (`""`, `[]`, `false`) are omitted from returned records — read with `record["fields"].get("Done", False)`.
- `sort` is a list such as `[{"field": "Due Date", "direction": "desc"}]`. Pass `"returnFieldsByFieldId": true` to key fields by ID, so a renamed column does not break the integration.
- `PUT` instead of `PATCH` clears every field that is not in the request.
- `fieldsToMergeOn` accepts one to three fields of type number, text, long text, single select, multiple select or date. If two existing records match, the request fails.

### Formula filtering

`filterByFormula` takes an Airtable formula; a record is returned when the result is not `0`, `false`, `""`, `NaN`, `[]` or `#Error!`.

```python
formulas = {
    "status_active": "{Status} = 'Active'",
    "high_priority_open": "AND({Priority} = 'High', {Status} != 'Done')",
    "due_in_7_days_or_overdue": "IS_BEFORE({Due Date}, DATEADD(TODAY(), 7, 'days'))",
    "name_contains": "FIND('invoice', LOWER({Name}))",       # case-insensitive search
    "has_project": "{Project} != ''",                        # linked record present
    "missing_email": "{Email} = ''",
}
```

### Schema

```python
tables = call("GET", f"{API}/meta/bases/{base_id}/tables")["tables"]      # schema.bases:read
table_id = next(t["id"] for t in tables if t["name"] == "Orders")

call("POST", f"{API}/meta/bases/{base_id}/tables/{table_id}/fields", json={   # schema.bases:write
    "name": "Region", "type": "singleSelect",
    "options": {"choices": [{"name": "EMEA"}, {"name": "APAC"}, {"name": "Americas"}]},
})
```

`GET /v0/meta/bases` lists the bases the token can reach. Creating a field needs the table ID, not its name.

### Attachments

Either write a public URL into the attachment field (`{"Photos": [{"url": "https://cdn.northwind.io/p/1042.jpg"}]}`) or upload the bytes, up to 5 MB, to the separate content host:

```python
def upload_attachment(base_id, record_id, field, file_path, content_type) -> dict:
    with open(file_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode()
    url = f"https://content.airtable.com/v0/{base_id}/{record_id}/{field}/uploadAttachment"
    body = {"contentType": content_type, "filename": os.path.basename(file_path), "file": encoded}
    return call("POST", url, json=body)
```

Writing an attachment field replaces its content: include `{"id": "att..."}` for each existing attachment you want to keep. Attachment URLs returned by the API expire after 2 hours; download the file if you need to keep it.

### Webhooks

A webhook sends a small ping to your HTTPS endpoint; the changes themselves are fetched from the payloads endpoint. Tables and fields in the specification must be given by ID.

```python
def create_webhook(base_id, table_id, notification_url) -> dict:
    spec = {"options": {"filters": {"dataTypes": ["tableData"], "recordChangeScope": table_id}}}
    body = {"notificationUrl": notification_url, "specification": spec}
    return call("POST", f"{API}/bases/{base_id}/webhooks", json=body)
    # {"id": "ach...", "macSecretBase64": "...", "expirationTime": "..."} — the secret is shown only once

def verify_ping(raw_body: bytes, mac_header: str, mac_secret_base64: str) -> bool:
    """mac_header is the X-Airtable-Content-MAC request header."""
    digest = hmac.new(base64.b64decode(mac_secret_base64), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"hmac-sha256={digest}", mac_header)

def read_payloads(base_id, webhook_id, cursor=1):
    """Call after each ping; store the returned cursor for the next call."""
    payloads = []
    while True:
        url = f"{API}/bases/{base_id}/webhooks/{webhook_id}/payloads"
        page = call("GET", url, params={"cursor": cursor})
        payloads += page["payloads"]
        cursor = page["cursor"]
        if not page["mightHaveMore"]:
            return payloads, cursor
```

- Optional filters: `fromSources` (`client`, `publicApi`, `formSubmission`, `automation`, `sync`…), `changeTypes` (`add`, `remove`, `update`), `watchDataInFieldIds`. Payloads carry only the cells that changed; add `"includes": {"includeCellValuesInFieldIds": "all"}` under `options` to get every field of a changed record.
- A webhook created with a PAT or OAuth token expires after 7 days. `POST …/webhooks/{id}/refresh` or reading its payloads extends it by 7 days; payloads are kept for a week.
- Limits: 10 webhooks per base, 2 per OAuth integration per base. Creating one requires creator permission on the base.
- Answer each ping with `200` or `204` within 25 seconds. A failed ping is retried with exponential backoff for about a day, then notifications are disabled until re-enabled with `POST …/webhooks/{id}/enableNotifications` and body `{"enable": true}`.

### OAuth 2.0

Register the integration at https://airtable.com/create/oauth. Airtable requires PKCE and a `state` value on every authorization request.

```python
import base64, hashlib, os, secrets, urllib.parse
import requests

def authorization_url(client_id: str, redirect_uri: str) -> tuple[str, str, str]:
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(32)
    query = urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code",
        "scope": "data.records:read data.records:write schema.bases:read",
        "state": state, "code_challenge": challenge, "code_challenge_method": "S256",
    })
    return f"https://airtable.com/oauth2/v1/authorize?{query}", verifier, state   # keep both in the session

def exchange_code(code: str, verifier: str, client_id: str, redirect_uri: str) -> dict:
    data = {"grant_type": "authorization_code", "code": code,
            "redirect_uri": redirect_uri, "code_verifier": verifier}
    secret = os.environ.get("AIRTABLE_CLIENT_SECRET")
    auth = (client_id, secret) if secret else None        # HTTP Basic when the integration has a secret
    if not secret:
        data["client_id"] = client_id
    return requests.post("https://airtable.com/oauth2/v1/token", data=data, auth=auth, timeout=30).json()
```

Access tokens last 60 minutes and refresh tokens 60 days. Renew with `grant_type=refresh_token`; each refresh invalidates the previous access and refresh tokens, so store the new pair. Compare the returned `state` with the stored one before exchanging the code.

### Field types

| Field | API type | Value written |
|---|---|---|
| Single line / long text | `singleLineText` / `multilineText` | String |
| Rich text | `richText` | Markdown string |
| Number, currency, percent | `number`, `currency`, `percent` | Number (percent as a fraction, 0.25 = 25%) |
| Single / multiple select | `singleSelect` / `multipleSelects` | Option name / list of names |
| Date / date and time | `date` / `dateTime` | ISO 8601 string |
| Checkbox | `checkbox` | Boolean |
| URL, email, phone | `url`, `email`, `phoneNumber` | String |
| Attachment | `multipleAttachments` | List of `{"url": ...}` objects |
| Linked record | `multipleRecordLinks` | List of record IDs |
| Formula, rollup, lookup, count, autonumber, created time | `formula`, `rollup`, `multipleLookupValues`, `count`, `autoNumber`, `createdTime` | Read-only |

## Examples

### Example 1: Import a CSV without creating duplicates

**User request:** "Load customers.csv into the Customers table of our CRM base. Rows whose email already exists should be updated, not duplicated."

```python
import csv, os
from airtable_client import upsert_records
BASE_ID = os.environ["AIRTABLE_BASE_ID"]          # appB7xK2mQ9vTnL4s
with open("customers.csv", newline="") as f:
    rows = [{"Email": r["email"], "Name": r["name"], "Plan": r["plan"], "MRR": r["mrr"]} for r in csv.DictReader(f)]

created, updated = upsert_records(BASE_ID, "Customers", rows, merge_on=["Email"], typecast=True)
print(f"{len(created)} created, {len(updated)} updated")
```

`typecast=True` converts the CSV strings (`"49"` to a number, a new plan name to a new select option). `Email` must be a single line text field: the email field type is not among the types `fieldsToMergeOn` accepts. For 1,240 rows the script sends 124 requests (at least 25 seconds at the throttled rate) and prints `38 created, 1202 updated`.

### Example 2: Query overdue tasks from the command line

**User request:** "Show me the open high-priority tasks that are past their due date."

```bash
curl -s -X POST "https://api.airtable.com/v0/appB7xK2mQ9vTnL4s/Tasks/listRecords" \
  -H "Authorization: Bearer $AIRTABLE_TOKEN" -H "Content-Type: application/json" \
  -d '{"filterByFormula": "AND({Priority} = \"High\", {Status} != \"Done\", IS_BEFORE({Due Date}, TODAY()))",
       "fields": ["Name", "Due Date", "Owner"], "sort": [{"field": "Due Date"}]}'
```

```json
{
  "records": [
    {"id": "recQ4mZ81xYtW0pLd", "createdTime": "2026-09-02T08:14:11.000Z",
     "fields": {"Name": "Renew SOC 2 audit contract", "Due Date": "2026-09-24", "Owner": "Priya Raman"}},
    {"id": "rec7HcVn3KsE9uTaB", "createdTime": "2026-09-10T13:40:52.000Z",
     "fields": {"Name": "Rotate payment gateway keys", "Due Date": "2026-09-29", "Owner": "Marcus Lindqvist"}}
  ]
}
```

No `offset` key in the response means this is the last page.

## Guidelines

- Rate limits: 5 requests per second per base and 50 per second across all PAT traffic of one user. Going over returns `429`, and requests keep failing until you have waited 30 seconds — back off, do not retry immediately.
- Free workspaces are capped at 1,000 API calls per month and Team workspaces at 100,000; schema calls count too. Batch writes (10 records per request) and cache reads instead of polling.
- `422` means the request data failed validation against the base: an unknown field name, an unknown select option without `typecast`, a string in a number field, or a write to a computed field. `403` means the token lacks the scope or the base; `502` and `503` are safe to retry.
- Use table and field IDs in long-lived integrations; names break when someone renames a column.
- Linked record fields take record IDs, not display values. A select value that is not an existing option fails with `INVALID_MULTIPLE_CHOICE_OPTIONS` unless `typecast` is true, in which case Airtable creates the option — convenient for imports, a source of typo options elsewhere.
- Give each token the narrowest scopes and only the bases it needs. Never put a PAT or the webhook MAC secret in client-side code or a repository.
- Verify the `X-Airtable-Content-MAC` header on every webhook ping, and treat the ping as a signal only: fetch payloads with your stored cursor.
- Deleting records and `PUT` updates cannot be undone through the API; confirm the record IDs with the user first.
- For a UI-level export or a one-off edit, the Airtable interface or a CSV import is simpler than the API.
