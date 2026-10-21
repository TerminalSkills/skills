---
name: quickbooks-online
description: >-
  Integrate with the QuickBooks Online API via OAuth2 to manage invoices, bills,
  expenses, customers, vendors, and pull financial reports. Use when: connecting
  SaaS apps to QuickBooks, automating financial data pipelines, syncing
  transactions, or building accounting integrations for small business clients.
license: Apache-2.0
compatibility: "Python 3.10+ (examples), Node.js 18+ with the intuit-oauth package"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags: ["quickbooks", "qbo", "accounting", "invoices", "oauth2"]
  repository: https://github.com/intuit/oauth-pythonclient
  use-cases:
    - "Sync customer invoices from your app to QuickBooks Online automatically"
    - "Pull P&L and balance sheet reports for financial dashboards"
    - "Import expenses and bills from payment processors into QBO"
    - "Keep customers and vendors in sync between your app and QuickBooks"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# QuickBooks Online

## Overview

Connect an application to QuickBooks Online (QBO) through the Intuit Developer REST API (v3). This skill covers OAuth 2.0, customers, vendors, invoices, payments, bills, expenses and reports, against the sandbox or production.

Facts that changed and that older code gets wrong (Intuit documentation and release notes):

- **Minor versions:** versions 1-74 were retired on 1 August 2025; requests with a lower or missing `minorversion` are served as 75. Send `minorversion=75` (or newer) explicitly.
- **Tokens:** access tokens last 60 minutes. The refresh-token value changes about every 24 hours (on the next refresh after that), and the previous value expires, so save the new `refresh_token` from every refresh response. A refresh token unused for 100 days expires, and all of them have a hard five-year limit; an expired or old one returns `invalid_grant` and the customer must reauthorize.
- **Limits:** 500 requests per minute per realm, 10 per second per realm and app, batch requests throttled per realm (recommended 30 operations per batch), queries return at most 1,000 entities, requests over 120 seconds fail, throttled calls return 429 (wait 60 seconds).

## Instructions

### Step 1: OAuth 2.0

Register the app at developer.intuit.com. Use the scope `com.intuit.quickbooks.accounting` (add `openid` only if you need sign-in; add the payments scope only for QuickBooks Payments). The authorization page is `https://appcenter.intuit.com/connect/oauth2`; the token endpoint is `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`. Intuit also publishes official clients (`pip install intuit-oauth`, `npm install intuit-oauth`).

```python
# qbo_auth.py
import base64, json, os, secrets, time
from urllib.parse import urlencode
import requests

CLIENT_ID = os.environ["QBO_CLIENT_ID"]
CLIENT_SECRET = os.environ["QBO_CLIENT_SECRET"]
REDIRECT_URI = os.environ["QBO_REDIRECT_URI"]
ENVIRONMENT = os.environ.get("QBO_ENVIRONMENT", "sandbox")  # sandbox | production
TOKEN_FILE = os.environ.get("QBO_TOKEN_FILE", ".qbo_tokens.json")  # keep out of git, chmod 600
MINOR_VERSION = "75"
TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
BASE_URL = {
    "sandbox": "https://sandbox-quickbooks.api.intuit.com",
    "production": "https://quickbooks.api.intuit.com",
}[ENVIRONMENT]

def auth_url(state: str) -> str:
    return "https://appcenter.intuit.com/connect/oauth2?" + urlencode({
        "client_id": CLIENT_ID, "scope": "com.intuit.quickbooks.accounting",
        "redirect_uri": REDIRECT_URI, "response_type": "code", "state": state,
    })

def _token_request(data: dict) -> dict:
    basic = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    r = requests.post(TOKEN_URL, data=data, timeout=30, headers={
        "Authorization": f"Basic {basic}", "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"})
    r.raise_for_status()
    return r.json()

def _save(tokens: dict) -> dict:
    tokens["expires_at"] = time.time() + tokens["expires_in"]
    fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(tokens, f)
    return tokens

def exchange_code(code: str, realm_id: str) -> dict:
    tokens = _token_request({"grant_type": "authorization_code", "code": code,
                             "redirect_uri": REDIRECT_URI})
    tokens["realm_id"] = realm_id
    return _save(tokens)

def get_valid_token() -> tuple[str, str]:
    with open(TOKEN_FILE) as f:
        tokens = json.load(f)
    if time.time() >= tokens["expires_at"] - 300:
        new = _token_request({"grant_type": "refresh_token",
                              "refresh_token": tokens["refresh_token"]})
        new["realm_id"] = tokens["realm_id"]
        tokens = _save(new)  # the response carries the NEW refresh token: keep it
    return tokens["access_token"], tokens["realm_id"]
```

With several workers, serialize refreshes (a lock or a single token service); a worker that refreshes with an already-replaced token gets `invalid_grant`. On `invalid_grant`, send the customer through the authorization flow again.

### Step 2: API client

```python
# qbo_client.py
import requests
from qbo_auth import get_valid_token, BASE_URL, MINOR_VERSION

class QBOClient:
    def __init__(self):
        self.token, self.realm_id = get_valid_token()
        self.base = f"{BASE_URL}/v3/company/{self.realm_id}"
        self.headers = {"Authorization": f"Bearer {self.token}",
                        "Accept": "application/json", "Content-Type": "application/json"}

    def _send(self, method, path, **kw):
        params = {**kw.pop("params", {}), "minorversion": MINOR_VERSION}
        r = requests.request(method, f"{self.base}/{path}", headers=self.headers,
                             params=params, timeout=120, **kw)
        r.raise_for_status()  # 429: wait 60 s and retry; 400 bodies list Fault.Error[].Detail
        return r.json()

    def query(self, sql: str) -> list:
        resp = self._send("GET", "query", params={"query": sql}).get("QueryResponse", {})
        return next((v for v in resp.values() if isinstance(v, list)), [])

    def create(self, entity: str, payload: dict) -> dict:
        return self._send("POST", entity, json=payload)

    def update(self, entity: str, payload: dict) -> dict:
        """Needs Id and SyncToken (read the entity first). Add "sparse": true to send only changed fields."""
        return self._send("POST", entity, json=payload)

    def report(self, name: str, params: dict) -> dict:
        return self._send("GET", f"reports/{name}", params=params)

def q(value: str) -> str:
    """Escape a value for a query string literal (apostrophes: O'Brien -> O\\'Brien)."""
    return value.replace("\\", "\\\\").replace("'", "\\'")
```

Paginate with `STARTPOSITION n MAXRESULTS 1000` (positions start at 1). A full update without `sparse` blanks the fields you leave out; a stale `SyncToken` is rejected with a stale-object error, so refetch and retry.

### Step 3: Customers and vendors

```python
# entities.py
from qbo_client import QBOClient, q

client = QBOClient()

def upsert_customer(display_name: str, email: str | None = None) -> dict:
    found = client.query(f"SELECT * FROM Customer WHERE DisplayName = '{q(display_name)}'")
    if found:
        return found[0]
    payload = {"DisplayName": display_name}
    if email:
        payload["PrimaryEmailAddr"] = {"Address": email}
    return client.create("customer", payload)["Customer"]

def upsert_vendor(display_name: str) -> dict:
    found = client.query(f"SELECT * FROM Vendor WHERE DisplayName = '{q(display_name)}'")
    return found[0] if found else client.create("vendor", {"DisplayName": display_name})["Vendor"]
```

### Step 4: Invoices and payments

Look up IDs per company instead of hard-coding them: `SELECT Id, Name FROM Item WHERE Name = 'Services'`, `SELECT Id, Name FROM Account WHERE AccountType = 'Bank'`.

```python
# invoices.py
from datetime import date, timedelta
from qbo_client import QBOClient, q
from entities import upsert_customer

client = QBOClient()

def item_id(name: str) -> str:
    return client.query(f"SELECT Id FROM Item WHERE Name = '{q(name)}'")[0]["Id"]

def create_invoice(customer_name: str, lines: list[dict], due_days: int = 30) -> dict:
    customer = upsert_customer(customer_name)
    today = date.today()
    payload = {
        "CustomerRef": {"value": customer["Id"]},
        "TxnDate": today.isoformat(),
        "DueDate": (today + timedelta(days=due_days)).isoformat(),
        "Line": [{
            "DetailType": "SalesItemLineDetail",
            "Amount": l["amount"], "Description": l["description"],
            "SalesItemLineDetail": {"ItemRef": {"value": item_id(l["item"])},
                                    "UnitPrice": l["amount"], "Qty": 1},
        } for l in lines],
    }
    return client.create("invoice", payload)["Invoice"]

def record_payment(invoice: dict, amount: float, deposit_account_id: str | None = None) -> dict:
    payload = {
        "CustomerRef": invoice["CustomerRef"], "TotalAmt": amount,
        "Line": [{"Amount": amount, "LinkedTxn": [{"TxnId": invoice["Id"], "TxnType": "Invoice"}]}],
    }
    if deposit_account_id:
        payload["DepositToAccountRef"] = {"value": deposit_account_id}
    return client.create("payment", payload)["Payment"]
```

### Step 5: Bills and expenses

```python
# expenses.py
from datetime import date, timedelta
from qbo_client import QBOClient
from entities import upsert_vendor

client = QBOClient()

def create_bill(vendor_name: str, lines: list[dict], expense_account_id: str, due_days: int = 30) -> dict:
    vendor = upsert_vendor(vendor_name)
    today = date.today()
    payload = {
        "VendorRef": {"value": vendor["Id"]},
        "TxnDate": today.isoformat(),
        "DueDate": (today + timedelta(days=due_days)).isoformat(),
        "Line": [{"DetailType": "AccountBasedExpenseLineDetail", "Amount": l["amount"],
                  "Description": l["description"],
                  "AccountBasedExpenseLineDetail": {"AccountRef": {"value": expense_account_id}}}
                 for l in lines],
    }
    return client.create("bill", payload)["Bill"]

def create_expense(vendor_name: str, amount: float, description: str,
                   expense_account_id: str, bank_account_id: str) -> dict:
    vendor = upsert_vendor(vendor_name)
    payload = {
        "PaymentType": "Cash", "AccountRef": {"value": bank_account_id},
        "EntityRef": {"value": vendor["Id"], "type": "Vendor"},
        "TxnDate": date.today().isoformat(),
        "Line": [{"DetailType": "AccountBasedExpenseLineDetail", "Amount": amount,
                  "Description": description,
                  "AccountBasedExpenseLineDetail": {"AccountRef": {"value": expense_account_id}}}],
    }
    return client.create("purchase", payload)["Purchase"]
```

### Step 6: Reports

```python
# reports.py
from qbo_client import QBOClient

client = QBOClient()

def profit_and_loss(start: str, end: str) -> dict:
    return client.report("ProfitAndLoss", {"start_date": start, "end_date": end})

def summary_rows(report: dict) -> list[tuple[str, str]]:
    out = []
    for row in report.get("Rows", {}).get("Row", []):
        cells = row.get("Summary", {}).get("ColData", [])
        if len(cells) > 1:
            out.append((cells[0]["value"], cells[1]["value"]))
    return out
```

## Examples

### Example 1: "Sync each paid Stripe charge to QuickBooks"

```python
invoice = create_invoice(
    "Larkspur Dental Group",
    [{"description": "Pro plan, March 2026", "amount": 999.00, "item": "Services"}],
    due_days=0)
record_payment(invoice, 999.00, deposit_account_id="35")
print(f"Invoice #{invoice['DocNumber']} synced, total {invoice['TotalAmt']}")
```

Result: `Invoice #1042 synced, total 999.0`; the invoice shows as paid in QBO. Use the ID of your own bank account, found with the Account query in Step 4.

### Example 2: "Give me March's profit and loss"

```python
for label, value in summary_rows(profit_and_loss("2026-03-01", "2026-03-31")):
    print(f"{label:<24}{value:>12}")
```

```
Total Income              22450.00
Total Expenses             8120.00
Net Income                14330.00
```

Environment variables used above: `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI` (must match the registered URI exactly), `QBO_ENVIRONMENT` (`sandbox` default or `production`), `QBO_TOKEN_FILE`. Sandbox and production use different keys.

## Guidelines

- Persist the refresh token returned by every refresh. Track failures and give users a way to reauthorize, since the customer can disconnect the app at any time.
- Test in a sandbox company first, and keep secrets and tokens out of source control and logs.
- Entity IDs (accounts, items, tax codes) differ per company; look them up by query, never copy IDs between companies.
- Respect the throttles (500 requests per minute per realm); back off on 429 and use the batch endpoint (about 30 operations per request) for bulk loads.
- Escape every value you put in a query string, and treat webhook payloads as notifications only: fetch the entity by ID before acting.
