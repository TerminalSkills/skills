---
name: xero-accounting
description: >-
  Integrate with the Xero accounting API to sync invoices, expenses, bank
  transactions, and contacts — and generate financial reports like P&L and
  balance sheet. Use when: connecting apps to Xero, automating bookkeeping
  workflows, syncing accounting data, or pulling financial reports programmatically.
license: Apache-2.0
compatibility: "Python 3.10+ (examples) or Node.js 18+ with xero-node"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags: "xero, accounting, invoices, bookkeeping, finance"
  use-cases: "Sync invoices from your app to Xero automatically, Pull monthly P&L and balance sheet reports via API, Import bank transactions and reconcile accounts in Xero, Create and manage contacts, bills, and expenses programmatically"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Xero Accounting

## Overview

Connect an application to Xero's Accounting API (`https://api.xero.com/api.xro/2.0`). The skill covers the OAuth 2.0 authorization-code flow with token refresh, picking the organisation (tenant), syncing invoices, payments, bank transactions and contacts, and reading P&L, balance sheet and trial balance reports. The examples use plain `requests`; the official SDKs (`xero-python` 15.x, `xero-node` 20.x) wrap the same endpoints.

## Instructions

### Step 1: Register the app and get tokens

Create an app at [developer.xero.com](https://developer.xero.com/app/manage) and export its `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` and `XERO_REDIRECT_URI`. A web app uses the authorization-code flow with the client secret; native or single-page apps use the PKCE variant without a secret. Request only the scopes the code needs:

- `accounting.transactions` for invoices, payments and bank transactions
- `accounting.contacts` for contacts
- `accounting.reports.read` for the report endpoints
- `accounting.settings` only if you read the chart of accounts
- `offline_access` to receive a refresh token

Access tokens last 30 minutes. A refresh token is single use: every refresh returns a new one, which you must store, and an unused refresh token expires after 60 days.

```python
# xero_auth.py: OAuth 2.0 token handling for the Xero API
import base64, json, os, secrets, requests
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

CLIENT_ID = os.environ["XERO_CLIENT_ID"]
CLIENT_SECRET = os.environ["XERO_CLIENT_SECRET"]
REDIRECT_URI = os.environ["XERO_REDIRECT_URI"]
TOKEN_FILE = ".xero_tokens.json"   # development only; use a database in production
SCOPES = "openid profile email offline_access accounting.transactions accounting.contacts accounting.reports.read"

def auth_url(state: str) -> str:
    """Keep `state` in the session and compare it on the callback."""
    return "https://login.xero.com/identity/connect/authorize?" + urlencode({
        "response_type": "code", "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI, "scope": SCOPES, "state": state,
    })

def _token_request(data: dict) -> dict:
    basic = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    r = requests.post("https://identity.xero.com/connect/token",
                      headers={"Authorization": f"Basic {basic}"}, data=data, timeout=30)
    r.raise_for_status()
    tokens = r.json()
    tokens["expires_at"] = (datetime.now(timezone.utc) + timedelta(seconds=tokens["expires_in"])).isoformat()
    with open(TOKEN_FILE, "w") as f:
        json.dump(tokens, f)          # always persist the NEW refresh token
    return tokens

def exchange_code(code: str) -> dict:
    return _token_request({"grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECT_URI})

def get_access_token() -> str:
    with open(TOKEN_FILE) as f:
        tokens = json.load(f)
    if datetime.now(timezone.utc) >= datetime.fromisoformat(tokens["expires_at"]) - timedelta(minutes=5):
        tokens = _token_request({"grant_type": "refresh_token", "refresh_token": tokens["refresh_token"]})
    return tokens["access_token"]

def get_tenant_id(access_token: str, tenant_name: str | None = None) -> str:
    r = requests.get("https://api.xero.com/connections",
                     headers={"Authorization": f"Bearer {access_token}"}, timeout=30)
    r.raise_for_status()
    orgs = r.json()
    if tenant_name:
        orgs = [o for o in orgs if o["tenantName"] == tenant_name]
    return orgs[0]["tenantId"]
```

### Step 2: Create an API client

Every accounting call needs the `Xero-Tenant-Id` header. Ask for JSON explicitly, because the API answers XML by default. Retry on `429` after the number of seconds in the `Retry-After` header.

```python
# xero_client.py: reusable Xero API client
import time, requests
from xero_auth import get_access_token, get_tenant_id

class XeroClient:
    BASE_URL = "https://api.xero.com/api.xro/2.0"

    def __init__(self, tenant_name: str | None = None):
        self.tenant_id = get_tenant_id(get_access_token(), tenant_name)

    def request(self, method: str, endpoint: str, params=None, json=None, since: str | None = None) -> dict:
        headers = {
            "Authorization": f"Bearer {get_access_token()}",   # refreshes when needed
            "Xero-Tenant-Id": self.tenant_id,
            "Accept": "application/json",
        }
        if since:                                              # e.g. "2026-10-01T00:00:00"
            headers["If-Modified-Since"] = since
        for _ in range(3):
            r = requests.request(method, f"{self.BASE_URL}/{endpoint}", headers=headers,
                                 params=params, json=json, timeout=60)
            if r.status_code != 429:
                break
            time.sleep(int(r.headers.get("Retry-After", "10")))
        r.raise_for_status()
        return r.json()

    def get(self, endpoint, params=None, since=None):
        return self.request("GET", endpoint, params=params, since=since)

    def post(self, endpoint, data):
        return self.request("POST", endpoint, json=data)
```

### Step 3: Invoices and payments

`POST /Invoices` creates records, and `POST` with an existing `InvoiceID` updates one. List calls return 100 invoices per page; pass `page=1, 2, ...` until a page comes back empty.

```python
# sync_invoices.py
from datetime import date
from xero_client import XeroClient

client = XeroClient()

def create_invoice(contact_name: str, line_items: list, due_date: str, currency: str = "USD") -> dict:
    """Sales invoice (ACCREC). line_items: [{"description", "quantity", "unitAmount", "accountCode"}]"""
    payload = {"Invoices": [{
        "Type": "ACCREC",
        "Contact": {"Name": contact_name},
        "Date": date.today().isoformat(),
        "DueDate": due_date,
        "CurrencyCode": currency,
        "Status": "AUTHORISED",     # DRAFT stays editable; AUTHORISED can receive payments
        "LineItems": [{
            "Description": i["description"], "Quantity": i["quantity"],
            "UnitAmount": i["unitAmount"], "AccountCode": i.get("accountCode", "200"),
        } for i in line_items],
    }]}
    return client.post("Invoices", payload)["Invoices"][0]

def list_invoices(status: str = "AUTHORISED", modified_since: str | None = None) -> list:
    invoices, page = [], 1
    while True:
        batch = client.get("Invoices", {"Statuses": status, "page": page}, since=modified_since)["Invoices"]
        if not batch:
            return invoices
        invoices += batch
        page += 1

def record_payment(invoice_id: str, amount: float, bank_account_code: str = "090") -> dict:
    payload = {"Payments": [{
        "Invoice": {"InvoiceID": invoice_id},
        "Account": {"Code": bank_account_code},
        "Amount": amount,
        "Date": date.today().isoformat(),
    }]}
    return client.post("Payments", payload)["Payments"][0]
```

### Step 4: Bank transactions

Use type `SPEND` for money out and `RECEIVE` for money in. Several transactions can go in one request. Add `?summarizeErrors=false` to the URL when one bad row should not reject the whole batch.

```python
# sync_bank_transactions.py
from xero_client import XeroClient

client = XeroClient()

def import_transactions(bank_account_id: str, transactions: list) -> list:
    """transactions: dicts with date, contact, amount (negative = spend), description, account_code."""
    rows = [{
        "Type": "SPEND" if tx["amount"] < 0 else "RECEIVE",
        "Contact": {"Name": tx["contact"]},
        "BankAccount": {"AccountID": bank_account_id},
        "Date": tx["date"],
        "LineItems": [{
            "Description": tx["description"], "Quantity": 1,
            "UnitAmount": abs(tx["amount"]), "AccountCode": tx.get("account_code", "400"),
        }],
    } for tx in transactions]
    created = client.post("BankTransactions?summarizeErrors=false", {"BankTransactions": rows})["BankTransactions"]
    for tx in created:
        if tx.get("HasValidationErrors"):
            print("rejected:", tx["ValidationErrors"])
    return created
```

### Step 5: Financial reports

Report responses are nested: top-level `Rows` are a header plus `Section` rows, and each section holds its own `Row` and `SummaryRow` entries. Read the section rows, not the top level.

```python
# reports.py
from xero_client import XeroClient

client = XeroClient()

def profit_and_loss(from_date: str, to_date: str) -> dict:
    report = client.get("Reports/ProfitAndLoss", {"fromDate": from_date, "toDate": to_date})["Reports"][0]
    totals = {}
    for section in report["Rows"]:
        for row in section.get("Rows", []):
            if row["RowType"] == "SummaryRow" or not section.get("Title"):   # untitled sections hold Gross/Net Profit
                totals[row["Cells"][0]["Value"]] = row["Cells"][1]["Value"]
    return totals

def balance_sheet(as_of: str) -> dict:
    """Same nested layout; Reports/TrialBalance takes the same `date` parameter."""
    return client.get("Reports/BalanceSheet", {"date": as_of})["Reports"][0]
```

### Step 6: Contacts

`POST /Contacts` creates a contact, or updates it when the body carries a `ContactID`. Filter lists with the `where` parameter, not with a field name as the parameter.

```python
# contacts.py
from xero_client import XeroClient

client = XeroClient()

def upsert_contact(name: str, email: str | None = None) -> dict:
    contact = {"Name": name, **({"EmailAddress": email} if email else {})}
    return client.post("Contacts", {"Contacts": [contact]})["Contacts"][0]

def find_contact_by_email(email: str) -> dict | None:
    contacts = client.get("Contacts", {"where": f'EmailAddress=="{email}"'}).get("Contacts", [])
    return contacts[0] if contacts else None
```

## Examples

### Example 1: Record a paid subscription as a Xero invoice

Request: "When a customer pays their October subscription, create the matching invoice in Xero and mark it paid."

```python
from contacts import upsert_contact
from sync_invoices import create_invoice, record_payment

contact = upsert_contact("Brightwave Studio Ltd", email="billing@brightwave.studio")
invoice = create_invoice(
    contact_name=contact["Name"],
    line_items=[{"description": "Team plan, October 2026", "quantity": 1, "unitAmount": 2500.00}],
    due_date="2026-10-31",
)
record_payment(invoice["InvoiceID"], amount=2500.00)
print(f"Synced {invoice['InvoiceNumber']}")
```

Result: the invoice (for example `INV-0042`) shows as paid in Xero.

### Example 2: Monthly P&L summary

Request: "Print last month's profit and loss totals."

```python
from reports import profit_and_loss

for label, value in profit_and_loss("2026-09-01", "2026-09-30").items():
    print(f"{label:<24}{value:>12}")
```

```console
Total Income               18500.00
Total Cost of Sales         3200.00
Gross Profit               15300.00
Total Operating Expenses    6750.00
Net Profit                  8550.00
```

The labels come from the organisation's own report layout, so they differ between companies.

## Guidelines

- Keep tokens and the client secret out of git, and store the refresh token returned by every refresh. Reusing an old one fails, and a user who is idle for 60 days must authorize again.
- Xero rate-limits each organisation and each app. Send many records in one POST, sync with `If-Modified-Since`, and honour `Retry-After` on `429`.
- Account codes (`200` sales, `400` expenses, `090` bank) differ between organisations. Read the chart of accounts through `GET /Accounts` (needs `accounting.settings`) before hardcoding.
- Test against a Demo Company (switch to it in Xero, then authorize your app against it), never a live ledger.
- Create `DRAFT` invoices when a human should review first; an `AUTHORISED` invoice can only be voided.
