---
name: quickbooks-online
description: >-
  Integrate with the QuickBooks Online API via OAuth2 to manage invoices, bills,
  expenses, customers, vendors, and pull financial reports. Use when: connecting
  SaaS apps to QuickBooks, automating financial data pipelines, syncing
  transactions, or building accounting integrations for small business clients.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: finance
  tags: ["quickbooks", "qbo", "accounting", "invoices", "finance", "api", "oauth2", "automation"]
  use-cases:
    - "Sync customer invoices from your app to QuickBooks Online automatically"
    - "Pull P&L and balance sheet reports for financial dashboards"
    - "Import expenses and bills from payment processors into QBO"
    - "Keep customers and vendors in sync between your app and QuickBooks"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# QuickBooks Online

## Overview

Connect your application to QuickBooks Online (QBO) via the Intuit Developer API. This skill covers OAuth2 setup, CRUD operations for core accounting entities (invoices, bills, payments, customers, vendors, accounts), and report generation (P&L, balance sheet, cash flow). Works with both sandbox and production QBO companies.

## Instructions

### Step 1: Set up OAuth2

Register your app at [developer.intuit.com](https://developer.intuit.com). QBO uses OAuth2 with refresh tokens (expire after 100 days).

```python
# qbo_auth.py — OAuth2 token management for QuickBooks Online
import requests
import base64
import json
import os
from datetime import datetime, timedelta

QBO_CLIENT_ID = os.environ["QBO_CLIENT_ID"]
QBO_CLIENT_SECRET = os.environ["QBO_CLIENT_SECRET"]
QBO_REDIRECT_URI = os.environ["QBO_REDIRECT_URI"]
QBO_ENVIRONMENT = os.environ.get("QBO_ENVIRONMENT", "sandbox")  # "sandbox" or "production"

TOKEN_FILE = ".qbo_tokens.json"

BASE_URL = {
    "sandbox": "https://sandbox-quickbooks.api.intuit.com",
    "production": "https://quickbooks.api.intuit.com",
}[QBO_ENVIRONMENT]

def get_auth_url() -> str:
    """Generate the OAuth2 authorization URL."""
    import secrets
    state = secrets.token_urlsafe(16)
    params = {
        "client_id": QBO_CLIENT_ID,
        "scope": "com.intuit.quickbooks.accounting",
        "redirect_uri": QBO_REDIRECT_URI,
        "response_type": "code",
        "state": state,
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"https://appcenter.intuit.com/connect/oauth2?{query}"

def exchange_code_for_tokens(code: str, realm_id: str) -> dict:
    """Exchange authorization code for tokens. realm_id is the QBO company ID."""
    credentials = base64.b64encode(
        f"{QBO_CLIENT_ID}:{QBO_CLIENT_SECRET}".encode()
    ).decode()

    response = requests.post(
        "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": QBO_REDIRECT_URI,
        },
    )
    tokens = response.json()
    tokens["realm_id"] = realm_id
    tokens["expires_at"] = (
        datetime.utcnow() + timedelta(seconds=tokens["expires_in"])
    ).isoformat()
    tokens["refresh_token_expires_at"] = (
        datetime.utcnow() + timedelta(days=100)
    ).isoformat()
    save_tokens(tokens)
    return tokens

def refresh_access_token() -> dict:
    """Refresh the access token (expires after 1 hour)."""
    tokens = load_tokens()
    credentials = base64.b64encode(
        f"{QBO_CLIENT_ID}:{QBO_CLIENT_SECRET}".encode()
    ).decode()

    response = requests.post(
        "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "refresh_token",
            "refresh_token": tokens["refresh_token"],
        },
    )
    new_tokens = response.json()
    new_tokens["realm_id"] = tokens["realm_id"]
    new_tokens["expires_at"] = (
        datetime.utcnow() + timedelta(seconds=new_tokens["expires_in"])
    ).isoformat()
    new_tokens["refresh_token_expires_at"] = tokens["refresh_token_expires_at"]
    save_tokens(new_tokens)
    return new_tokens

def get_valid_token() -> tuple[str, str]:
    """Return (access_token, realm_id), refreshing if needed."""
    tokens = load_tokens()
    expires_at = datetime.fromisoformat(tokens["expires_at"])
    if datetime.utcnow() >= expires_at - timedelta(minutes=5):
        tokens = refresh_access_token()
    return tokens["access_token"], tokens["realm_id"]

def save_tokens(tokens: dict):
    with open(TOKEN_FILE, "w") as f:
        json.dump(tokens, f)

def load_tokens() -> dict:
    with open(TOKEN_FILE) as f:
        return json.load(f)
```

### Step 2: Create an API client

```python
# qbo_client.py — QBO API client using the v3 REST API
import requests
from qbo_auth import get_valid_token, BASE_URL

class QBOClient:
    def __init__(self):
        self.token, self.realm_id = get_valid_token()
        self.base = f"{BASE_URL}/v3/company/{self.realm_id}"

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def query(self, sql: str) -> list:
        """Run a QBO query (SQL-like syntax)."""
        response = requests.get(
            f"{self.base}/query",
            headers=self._headers(),
            params={"query": sql, "minorversion": "65"},
        )
        response.raise_for_status()
        data = response.json()
        # The response key varies by entity: QueryResponse.Invoice, .Customer, etc.
        query_response = data.get("QueryResponse", {})
        for key, value in query_response.items():
            if isinstance(value, list):
                return value
        return []

    def create(self, entity: str, payload: dict) -> dict:
        """Create a QBO entity."""
        response = requests.post(
            f"{self.base}/{entity}?minorversion=65",
            headers=self._headers(),
            json=payload,
        )
        response.raise_for_status()
        return response.json()

    def update(self, entity: str, payload: dict) -> dict:
        """Update a QBO entity (requires Id and SyncToken in payload)."""
        response = requests.post(
            f"{self.base}/{entity}?operation=update&minorversion=65",
            headers=self._headers(),
            json=payload,
        )
        response.raise_for_status()
        return response.json()

    def get_report(self, report_name: str, params: dict = None) -> dict:
        """Fetch a financial report."""
        response = requests.get(
            f"{self.base}/reports/{report_name}",
            headers=self._headers(),
            params={**(params or {}), "minorversion": "65"},
        )
        response.raise_for_status()
        return response.json()
```

### Step 3: Manage customers and vendors

```python
# entities.py — Customers and vendors
from qbo_client import QBOClient

client = QBOClient()

def upsert_customer(display_name: str, email: str = None, phone: str = None,
                    company_name: str = None) -> dict:
    """Find or create a customer in QBO."""
    # Try to find existing customer
    results = client.query(
        f"SELECT * FROM Customer WHERE DisplayName = '{display_name}'"
    )
    if results:
        return results[0]

    payload = {"DisplayName": display_name}
    if email:
        payload["PrimaryEmailAddr"] = {"Address": email}
    if phone:
        payload["PrimaryPhone"] = {"FreeFormNumber": phone}
    if company_name:
        payload["CompanyName"] = company_name

    result = client.create("customer", payload)
    return result["Customer"]

def upsert_vendor(display_name: str, email: str = None, phone: str = None) -> dict:
    """Find or create a vendor in QBO."""
    results = client.query(
        f"SELECT * FROM Vendor WHERE DisplayName = '{display_name}'"
    )
    if results:
        return results[0]

    payload = {"DisplayName": display_name}
    if email:
        payload["PrimaryEmailAddr"] = {"Address": email}

    result = client.create("vendor", payload)
    return result["Vendor"]
```

### Step 4: Create and manage invoices

```python
# invoices.py — Invoice operations
from qbo_client import QBOClient
from entities import upsert_customer
from datetime import datetime, timedelta

client = QBOClient()

def create_invoice(customer_name: str, line_items: list,
                   due_days: int = 30, currency: str = "USD") -> dict:
    """
    Create an invoice in QBO.

    line_items format:
      [{"description": "...", "amount": 1500.0, "income_account_id": "79"}]
    """
    customer = upsert_customer(customer_name)
    today = datetime.utcnow()
    due_date = today + timedelta(days=due_days)

    lines = []
    for item in line_items:
        lines.append({
            "Amount": item["amount"],
            "DetailType": "SalesItemLineDetail",
            "Description": item.get("description", ""),
            "SalesItemLineDetail": {
                "ItemRef": {"value": "1", "name": "Services"},  # Adjust to your chart
                "UnitPrice": item["amount"],
                "Qty": 1,
            },
        })

    payload = {
        "CustomerRef": {"value": customer["Id"]},
        "DueDate": due_date.strftime("%Y-%m-%d"),
        "TxnDate": today.strftime("%Y-%m-%d"),
        "CurrencyRef": {"value": currency},
        "Line": lines,
    }

    result = client.create("invoice", payload)
    invoice = result["Invoice"]
    print(f"Created Invoice #{invoice['DocNumber']} — ${invoice['TotalAmt']}")
    return invoice

def list_unpaid_invoices() -> list:
    """Return all open (unpaid) invoices."""
    return client.query(
        "SELECT * FROM Invoice WHERE Balance > '0' MAXRESULTS 1000"
    )

def record_payment(invoice_id: str, amount: float, account_id: str = "35") -> dict:
    """Record a payment against an invoice. account_id = Checking account."""
    payload = {
        "TotalAmt": amount,
        "CustomerRef": {},  # Will be resolved from invoice
        "Line": [{
            "Amount": amount,
            "LinkedTxn": [{"TxnId": invoice_id, "TxnType": "Invoice"}],
        }],
        "DepositToAccountRef": {"value": account_id},
    }
    result = client.create("payment", payload)
    return result["Payment"]
```

### Step 5: Manage bills and expenses

```python
# expenses.py — Bills and expenses
from qbo_client import QBOClient
from entities import upsert_vendor
from datetime import datetime

client = QBOClient()

def create_bill(vendor_name: str, line_items: list, due_days: int = 30) -> dict:
    """Create a vendor bill (accounts payable)."""
    vendor = upsert_vendor(vendor_name)
    today = datetime.utcnow()

    lines = [
        {
            "Amount": item["amount"],
            "DetailType": "AccountBasedExpenseLineDetail",
            "Description": item.get("description", ""),
            "AccountBasedExpenseLineDetail": {
                "AccountRef": {"value": item.get("expense_account_id", "7")},
            },
        }
        for item in line_items
    ]

    payload = {
        "VendorRef": {"value": vendor["Id"]},
        "TxnDate": today.strftime("%Y-%m-%d"),
        "DueDate": (today.replace(day=today.day + due_days)).strftime("%Y-%m-%d"),
        "Line": lines,
    }

    result = client.create("bill", payload)
    return result["Bill"]

def create_expense(vendor_name: str, amount: float, description: str,
                   account_id: str = "7", payment_account_id: str = "35") -> dict:
    """Record a direct expense (already paid — not a bill)."""
    vendor = upsert_vendor(vendor_name)

    payload = {
        "PaymentType": "Cash",
        "AccountRef": {"value": payment_account_id},  # Bank/credit card account
        "EntityRef": {"value": vendor["Id"], "type": "Vendor"},
        "TxnDate": datetime.utcnow().strftime("%Y-%m-%d"),
        "Line": [{
            "Amount": amount,
            "DetailType": "AccountBasedExpenseLineDetail",
            "Description": description,
            "AccountBasedExpenseLineDetail": {
                "AccountRef": {"value": account_id},
            },
        }],
    }

    result = client.create("purchase", payload)
    return result["Purchase"]
```

### Step 6: Pull financial reports

```python
# reports.py — Financial reporting
from qbo_client import QBOClient

client = QBOClient()

def get_profit_and_loss(start_date: str, end_date: str) -> dict:
    """Fetch P&L report. Dates: YYYY-MM-DD."""
    report = client.get_report("ProfitAndLoss", {
        "start_date": start_date,
        "end_date": end_date,
    })
    return parse_report(report)

def get_balance_sheet(as_of_date: str) -> dict:
    """Fetch Balance Sheet as of a given date."""
    report = client.get_report("BalanceSheet", {"date_macro": "Custom",
                                                 "end_date": as_of_date})
    return parse_report(report)

def get_cash_flow(start_date: str, end_date: str) -> dict:
    """Fetch Cash Flow Statement."""
    report = client.get_report("CashFlow", {
        "start_date": start_date,
        "end_date": end_date,
    })
    return parse_report(report)

def parse_report(report: dict) -> dict:
    """Extract rows from QBO report into a flat summary dict."""
    summary = {"title": report.get("Header", {}).get("ReportName", "Report"), "rows": []}
    for row in report.get("Rows", {}).get("Row", []):
        if "Summary" in row:
            cells = row["Summary"].get("ColData", [])
            if cells:
                summary["rows"].append({
                    "label": cells[0].get("value", ""),
                    "value": cells[1].get("value", "") if len(cells) > 1 else "",
                })
    return summary
```

## Examples

### Example 1: Full billing pipeline from Stripe to QBO

```python
# Triggered when Stripe webhook fires for a successful charge
stripe_event = {
    "customer_email": "alice@example.com",
    "amount": 999.00,
    "description": "Pro Plan — March 2025",
    "date": "2025-03-01",
}

customer = upsert_customer(
    display_name=stripe_event["customer_email"],
    email=stripe_event["customer_email"],
)

invoice = create_invoice(
    customer_name=customer["DisplayName"],
    line_items=[{
        "description": stripe_event["description"],
        "amount": stripe_event["amount"],
    }],
    due_days=0,  # Already paid
)

record_payment(invoice_id=invoice["Id"], amount=stripe_event["amount"])
print(f"QBO invoice synced: #{invoice['DocNumber']}")
```

### Example 2: Monthly P&L snapshot

```python
pnl = get_profit_and_loss("2025-03-01", "2025-03-31")
print(f"\n{pnl['title']}")
for row in pnl["rows"]:
    print(f"  {row['label']:<25} {row['value']:>12}")
```

**Output:**
```
Profit and Loss
  Total Income              $22,450.00
  Gross Profit              $22,450.00
  Total Expenses             $8,120.00
  Net Operating Income      $14,330.00
  Net Income                $14,330.00
```

## Environment Variables

| Variable | Description |
|---|---|
| `QBO_CLIENT_ID` | OAuth2 client ID from Intuit Developer portal |
| `QBO_CLIENT_SECRET` | OAuth2 client secret |
| `QBO_REDIRECT_URI` | Callback URL registered in your QBO app |
| `QBO_ENVIRONMENT` | `sandbox` (default) or `production` |

## Guidelines

- QBO access tokens expire after 1 hour; refresh tokens expire after 100 days. Automate token refresh and alert before the refresh token expires.
- Use the sandbox environment (`sandbox-quickbooks.api.intuit.com`) for all testing — it includes a sample company with realistic data.
- QBO query language is SQL-like but limited. Use `MAXRESULTS` and `STARTPOSITION` for pagination (`MAXRESULTS 1000` is the max per page).
- Entity IDs (accounts, items) vary per QBO company. Query the chart of accounts on first run to map account names to IDs.
- For production, store tokens in a database and rotate them proactively before the 100-day refresh expiry.
- Intuit rate limits: 500 requests/minute per app. For bulk imports, batch API calls rather than one-per-record loops.
- The `minorversion=65` parameter unlocks the latest API features — include it on all requests.
