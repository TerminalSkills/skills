---
name: xero-accounting
description: >-
  Integrate with the Xero accounting API to sync invoices, expenses, bank
  transactions, and contacts — and generate financial reports like P&L and
  balance sheet. Use when: connecting apps to Xero, automating bookkeeping
  workflows, syncing accounting data, or pulling financial reports programmatically.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: ["xero", "accounting", "invoices", "bookkeeping", "finance"]
  use-cases:
    - "Sync invoices from your app to Xero automatically"
    - "Pull monthly P&L and balance sheet reports via API"
    - "Import bank transactions and reconcile accounts in Xero"
    - "Create and manage contacts, bills, and expenses programmatically"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Xero Accounting

## Overview

Integrate your application with Xero's accounting platform via the Xero API. This skill covers OAuth2 authentication, syncing core accounting objects (invoices, bills, expenses, contacts, bank transactions), and pulling financial reports (P&L, balance sheet, trial balance). Supports both one-time imports and continuous sync patterns.

## Instructions

### Step 1: Set up OAuth2 authentication

Xero uses OAuth2 with PKCE. Register your app at [developer.xero.com](https://developer.xero.com), then implement the token flow:

```python
# xero_auth.py — OAuth2 token management for Xero API
import requests
import base64
import json
import os
from datetime import datetime, timedelta

XERO_CLIENT_ID = os.environ["XERO_CLIENT_ID"]
XERO_CLIENT_SECRET = os.environ["XERO_CLIENT_SECRET"]
XERO_REDIRECT_URI = os.environ["XERO_REDIRECT_URI"]
TOKEN_FILE = ".xero_tokens.json"

def get_auth_url():
    """Generate the OAuth2 authorization URL."""
    import secrets
    state = secrets.token_urlsafe(16)
    params = {
        "response_type": "code",
        "client_id": XERO_CLIENT_ID,
        "redirect_uri": XERO_REDIRECT_URI,
        "scope": "openid profile email accounting.transactions accounting.reports.read accounting.contacts offline_access",
        "state": state,
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"https://login.xero.com/identity/connect/authorize?{query}"

def exchange_code_for_tokens(code: str) -> dict:
    """Exchange authorization code for access + refresh tokens."""
    credentials = base64.b64encode(
        f"{XERO_CLIENT_ID}:{XERO_CLIENT_SECRET}".encode()
    ).decode()

    response = requests.post(
        "https://identity.xero.com/connect/token",
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": XERO_REDIRECT_URI,
        },
    )
    tokens = response.json()
    tokens["expires_at"] = (
        datetime.utcnow() + timedelta(seconds=tokens["expires_in"])
    ).isoformat()
    save_tokens(tokens)
    return tokens

def refresh_access_token(tokens: dict) -> dict:
    """Refresh the access token using the refresh token."""
    credentials = base64.b64encode(
        f"{XERO_CLIENT_ID}:{XERO_CLIENT_SECRET}".encode()
    ).decode()

    response = requests.post(
        "https://identity.xero.com/connect/token",
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
    new_tokens["expires_at"] = (
        datetime.utcnow() + timedelta(seconds=new_tokens["expires_in"])
    ).isoformat()
    save_tokens(new_tokens)
    return new_tokens

def get_valid_token() -> str:
    """Return a valid access token, refreshing if needed."""
    tokens = load_tokens()
    expires_at = datetime.fromisoformat(tokens["expires_at"])
    if datetime.utcnow() >= expires_at - timedelta(minutes=5):
        tokens = refresh_access_token(tokens)
    return tokens["access_token"]

def get_tenant_id(access_token: str) -> str:
    """Get the Xero organisation (tenant) ID."""
    response = requests.get(
        "https://api.xero.com/connections",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    connections = response.json()
    return connections[0]["tenantId"]  # Use first connected org

def save_tokens(tokens: dict):
    with open(TOKEN_FILE, "w") as f:
        json.dump(tokens, f)

def load_tokens() -> dict:
    with open(TOKEN_FILE) as f:
        return json.load(f)
```

### Step 2: Create an API client

```python
# xero_client.py — Reusable Xero API client
import requests
from xero_auth import get_valid_token, get_tenant_id

class XeroClient:
    BASE_URL = "https://api.xero.com/api.xro/2.0"

    def __init__(self):
        self.token = get_valid_token()
        self.tenant_id = get_tenant_id(self.token)

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "Xero-Tenant-Id": self.tenant_id,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def get(self, endpoint: str, params: dict = None) -> dict:
        response = requests.get(
            f"{self.BASE_URL}/{endpoint}",
            headers=self._headers(),
            params=params,
        )
        response.raise_for_status()
        return response.json()

    def post(self, endpoint: str, data: dict) -> dict:
        response = requests.post(
            f"{self.BASE_URL}/{endpoint}",
            headers=self._headers(),
            json=data,
        )
        response.raise_for_status()
        return response.json()

    def put(self, endpoint: str, data: dict) -> dict:
        response = requests.put(
            f"{self.BASE_URL}/{endpoint}",
            headers=self._headers(),
            json=data,
        )
        response.raise_for_status()
        return response.json()
```

### Step 3: Sync invoices

```python
# sync_invoices.py — Create and retrieve invoices in Xero
from xero_client import XeroClient
from datetime import datetime

client = XeroClient()

def create_invoice(contact_name: str, line_items: list, due_date: str, currency: str = "USD") -> dict:
    """
    Create a sales invoice (ACCREC) in Xero.

    line_items format:
      [{"description": "...", "quantity": 1, "unitAmount": 100.0, "accountCode": "200"}]
    """
    payload = {
        "Invoices": [{
            "Type": "ACCREC",
            "Contact": {"Name": contact_name},
            "DueDate": due_date,          # e.g. "2025-03-31"
            "CurrencyCode": currency,
            "LineItems": [
                {
                    "Description": item["description"],
                    "Quantity": item["quantity"],
                    "UnitAmount": item["unitAmount"],
                    "AccountCode": item.get("accountCode", "200"),
                }
                for item in line_items
            ],
            "Status": "AUTHORISED",
        }]
    }
    result = client.post("Invoices", payload)
    invoice = result["Invoices"][0]
    print(f"Created invoice {invoice['InvoiceNumber']} — Total: {invoice['Total']}")
    return invoice

def list_invoices(status: str = "AUTHORISED", modified_since: str = None) -> list:
    """Retrieve invoices, optionally filtered by status or modified date."""
    params = {"Status": status}
    headers_extra = {}
    if modified_since:
        headers_extra["If-Modified-Since"] = modified_since

    result = client.get("Invoices", params=params)
    return result.get("Invoices", [])

def mark_invoice_paid(invoice_id: str, amount: float, account_code: str = "090") -> dict:
    """Record a payment against an invoice."""
    payload = {
        "Payments": [{
            "Invoice": {"InvoiceID": invoice_id},
            "Account": {"Code": account_code},
            "Amount": amount,
            "Date": datetime.utcnow().strftime("%Y-%m-%d"),
        }]
    }
    result = client.post("Payments", payload)
    return result["Payments"][0]
```

### Step 4: Sync bank transactions

```python
# sync_bank_transactions.py — Push bank transactions into Xero
from xero_client import XeroClient

client = XeroClient()

def create_bank_transaction(
    account_id: str,
    contact_name: str,
    amount: float,
    date: str,
    description: str,
    account_code: str = "400",
    tx_type: str = "SPEND",  # SPEND or RECEIVE
) -> dict:
    """Record a bank transaction (spend or receive money)."""
    payload = {
        "BankTransactions": [{
            "Type": tx_type,
            "Contact": {"Name": contact_name},
            "BankAccount": {"AccountID": account_id},
            "Date": date,
            "LineItems": [{
                "Description": description,
                "Quantity": 1,
                "UnitAmount": abs(amount),
                "AccountCode": account_code,
            }],
            "IsReconciled": False,
        }]
    }
    result = client.post("BankTransactions", payload)
    return result["BankTransactions"][0]

def bulk_import_transactions(account_id: str, transactions: list) -> list:
    """
    Import multiple bank transactions in a single API call.

    transactions: list of dicts with keys:
      date, contact, amount (negative=spend, positive=receive), description, account_code
    """
    bank_txs = []
    for tx in transactions:
        tx_type = "SPEND" if tx["amount"] < 0 else "RECEIVE"
        bank_txs.append({
            "Type": tx_type,
            "Contact": {"Name": tx["contact"]},
            "BankAccount": {"AccountID": account_id},
            "Date": tx["date"],
            "LineItems": [{
                "Description": tx["description"],
                "Quantity": 1,
                "UnitAmount": abs(tx["amount"]),
                "AccountCode": tx.get("account_code", "400"),
            }],
        })

    payload = {"BankTransactions": bank_txs}
    result = client.post("BankTransactions", payload)
    created = result["BankTransactions"]
    print(f"Imported {len(created)} bank transactions")
    return created
```

### Step 5: Generate financial reports

```python
# reports.py — Pull P&L and balance sheet from Xero
from xero_client import XeroClient

client = XeroClient()

def get_profit_and_loss(from_date: str, to_date: str) -> dict:
    """
    Fetch Profit & Loss report.
    Dates format: YYYY-MM-DD
    """
    params = {
        "fromDate": from_date,
        "toDate": to_date,
    }
    result = client.get("Reports/ProfitAndLoss", params=params)
    report = result["Reports"][0]

    # Parse rows into a flat dict
    summary = {}
    for row in report.get("Rows", []):
        if row.get("RowType") == "SummaryRow":
            cells = row.get("Cells", [])
            if len(cells) >= 2:
                summary[cells[0].get("Value", "")] = cells[1].get("Value", "")

    return {"raw": report, "summary": summary}

def get_balance_sheet(date: str) -> dict:
    """Fetch Balance Sheet as of a given date (YYYY-MM-DD)."""
    result = client.get("Reports/BalanceSheet", params={"date": date})
    return result["Reports"][0]

def get_trial_balance(date: str) -> list:
    """Fetch Trial Balance as of a given date."""
    result = client.get("Reports/TrialBalance", params={"date": date})
    report = result["Reports"][0]
    rows = []
    for row in report.get("Rows", []):
        if row.get("RowType") == "Row":
            cells = row.get("Cells", [])
            if cells:
                rows.append({
                    "account": cells[0].get("Value"),
                    "debit": cells[1].get("Value") if len(cells) > 1 else None,
                    "credit": cells[2].get("Value") if len(cells) > 2 else None,
                    "ytd_debit": cells[3].get("Value") if len(cells) > 3 else None,
                    "ytd_credit": cells[4].get("Value") if len(cells) > 4 else None,
                })
    return rows
```

### Step 6: Manage contacts

```python
# contacts.py — Create and update Xero contacts (customers and suppliers)
from xero_client import XeroClient

client = XeroClient()

def upsert_contact(name: str, email: str = None, phone: str = None,
                   is_customer: bool = True, is_supplier: bool = False) -> dict:
    """Create or update a contact in Xero."""
    contact = {
        "Name": name,
        "IsCustomer": is_customer,
        "IsSupplier": is_supplier,
    }
    if email:
        contact["EmailAddress"] = email
    if phone:
        contact["Phones"] = [{"PhoneType": "DEFAULT", "PhoneNumber": phone}]

    payload = {"Contacts": [contact]}
    result = client.post("Contacts", payload)
    return result["Contacts"][0]

def find_contact_by_email(email: str) -> dict | None:
    """Look up a contact by email address."""
    result = client.get("Contacts", params={"EmailAddress": email})
    contacts = result.get("Contacts", [])
    return contacts[0] if contacts else None
```

## Examples

### Example 1: Sync Stripe payment as Xero invoice

```python
# When a Stripe payment succeeds, create a matching Xero invoice and mark it paid
stripe_payment = {
    "customer_email": "client@example.com",
    "amount": 2500.00,
    "currency": "USD",
    "description": "Monthly SaaS subscription — March 2025",
    "date": "2025-03-01",
}

contact = upsert_contact(
    name=stripe_payment["customer_email"],
    email=stripe_payment["customer_email"],
    is_customer=True,
)

invoice = create_invoice(
    contact_name=contact["Name"],
    line_items=[{
        "description": stripe_payment["description"],
        "quantity": 1,
        "unitAmount": stripe_payment["amount"],
        "accountCode": "200",
    }],
    due_date=stripe_payment["date"],
    currency=stripe_payment["currency"].upper(),
)

mark_invoice_paid(invoice["InvoiceID"], amount=stripe_payment["amount"])
print(f"Synced invoice {invoice['InvoiceNumber']} to Xero ✓")
```

### Example 2: Generate monthly P&L and print summary

```python
pnl = get_profit_and_loss("2025-03-01", "2025-03-31")
print("March 2025 P&L Summary")
print("=" * 30)
for label, value in pnl["summary"].items():
    print(f"  {label:<20} {value:>12}")
```

**Output:**
```
March 2025 P&L Summary
==============================
  Total Income          $18,500.00
  Total Cost of Sales    $3,200.00
  Gross Profit          $15,300.00
  Total Expenses         $6,750.00
  Net Profit             $8,550.00
```

## Environment Variables

| Variable | Description |
|---|---|
| `XERO_CLIENT_ID` | OAuth2 client ID from Xero developer portal |
| `XERO_CLIENT_SECRET` | OAuth2 client secret |
| `XERO_REDIRECT_URI` | Callback URL registered in Xero app |

## Guidelines

- Always refresh the access token before making API calls — Xero tokens expire after 30 minutes.
- Use `If-Modified-Since` headers on GET requests to sync only updated records.
- Xero rate limits: 60 calls/minute per tenant. Batch writes (e.g. multiple invoices in one POST) to stay within limits.
- Account codes (e.g. "200" for Revenue, "400" for Expenses) vary by organization — confirm the chart of accounts before hardcoding.
- For production, store tokens in a database or secrets manager, not in a local file.
- Use `AUTHORISED` status for invoices to make them visible in Xero's UI immediately.
- The Xero sandbox (demo company) is available at `https://api.xero.com` — connect it during OAuth to test without affecting real data.
