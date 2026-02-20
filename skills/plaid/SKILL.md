---
name: plaid
description: >-
  Connect bank accounts and access financial data with Plaid API. Handle account 
  linking, transaction data, balances, income verification, and payment initiation 
  for fintech applications and financial services.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: fintech
  tags: ["plaid", "banking", "open-banking", "financial-data", "ach-payments"]
---

# Plaid

Integrate bank account connectivity and financial data access using Plaid's open banking API for fintech applications.

## Overview

Plaid connects applications to users' bank accounts to access financial data including account balances, transaction history, income verification, and identity information. Supports over 12,000 financial institutions.

## Authentication

```javascript
// Install Plaid SDK
// npm install plaid

const { PlaidApi, Configuration, PlaidEnvironments } = require('plaid');

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
      'Plaid-Version': '2020-09-14',
    },
  },
});

const plaidClient = new PlaidApi(configuration);
```

## Instructions

### Step 1 — Account Linking with Plaid Link

```javascript
// Server-side: Create link token
app.post('/api/create-link-token', async (req, res) => {
  const { userId, clientName } = req.body;
  
  const configs = {
    user: {
      client_user_id: userId
    },
    client_name: clientName || "My Fintech App",
    products: ['transactions', 'accounts'],
    country_codes: ['US'],
    language: 'en'
  };
  
  const response = await plaidClient.linkTokenCreate(configs);
  
  res.json({
    linkToken: response.data.link_token,
    expiration: response.data.expiration
  });
});

// Client-side: Initialize Plaid Link
const handler = Plaid.create({
  token: linkToken,
  
  onSuccess: async (publicToken, metadata) => {
    const response = await fetch('/api/exchange-public-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicToken: publicToken,
        institutionId: metadata.institution.institution_id,
        accounts: metadata.accounts
      })
    });
    
    const result = await response.json();
    console.log('Account linked successfully:', result);
  },
  
  onExit: (error, metadata) => {
    if (error != null) {
      console.error('Link error:', error);
    }
  }
});

handler.open();
```

### Step 2 — Token Exchange and Account Data

```javascript
// Exchange public token for access token
app.post('/api/exchange-public-token', async (req, res) => {
  const { publicToken, institutionId, accounts } = req.body;
  
  const response = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken
  });
  
  const accessToken = response.data.access_token;
  const itemId = response.data.item_id;
  
  // Store connection in database
  const connection = await db.bankConnections.create({
    data: {
      userId: req.user.id,
      accessToken: encryptToken(accessToken),
      itemId: itemId,
      institutionId: institutionId,
      status: 'active'
    }
  });
  
  res.json({
    connectionId: connection.id,
    institutionName: institutionId
  });
});

// Get account balances
app.get('/api/accounts/:connectionId/balances', async (req, res) => {
  const connection = await db.bankConnections.findUnique({
    where: { id: req.params.connectionId, userId: req.user.id }
  });
  
  const accessToken = decryptToken(connection.accessToken);
  
  const response = await plaidClient.accountsBalanceGet({
    access_token: accessToken
  });
  
  const balances = response.data.accounts.map(account => ({
    accountId: account.account_id,
    name: account.name,
    type: account.type,
    subtype: account.subtype,
    balances: {
      available: account.balances.available,
      current: account.balances.current,
      limit: account.balances.limit
    }
  }));
  
  res.json({ balances });
});
```

### Step 3 — Transaction Data

```javascript
// Get transactions
app.get('/api/transactions/:connectionId', async (req, res) => {
  const { startDate, endDate, count = 100 } = req.query;
  
  const connection = await db.bankConnections.findUnique({
    where: { id: req.params.connectionId, userId: req.user.id }
  });
  
  const accessToken = decryptToken(connection.accessToken);
  
  const request = {
    access_token: accessToken,
    start_date: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end_date: endDate || new Date().toISOString().split('T')[0],
    count: parseInt(count)
  };
  
  const response = await plaidClient.transactionsGet(request);
  
  const transactions = response.data.transactions.map(transaction => ({
    transactionId: transaction.transaction_id,
    accountId: transaction.account_id,
    amount: transaction.amount,
    category: transaction.category,
    name: transaction.name,
    date: transaction.date,
    merchantName: transaction.merchant_name
  }));
  
  res.json({ transactions });
});

// Get identity information
app.get('/api/identity/:connectionId', async (req, res) => {
  const connection = await db.bankConnections.findUnique({
    where: { id: req.params.connectionId, userId: req.user.id }
  });
  
  const accessToken = decryptToken(connection.accessToken);
  
  const response = await plaidClient.identityGet({
    access_token: accessToken
  });
  
  const identity = response.data.accounts.map(account => ({
    accountId: account.account_id,
    owners: account.owners.map(owner => ({
      names: owner.names,
      phoneNumbers: owner.phone_numbers,
      emails: owner.emails,
      addresses: owner.addresses
    }))
  }));
  
  res.json({ identity });
});
```

### Step 4 — Webhook Handling

```javascript
// Webhook handler
app.post('/api/plaid-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const webhook = JSON.parse(req.body.toString());
  
  switch (webhook.webhook_type) {
    case 'TRANSACTIONS':
      await handleTransactionsWebhook(webhook);
      break;
    case 'ITEM':
      await handleItemWebhook(webhook);
      break;
    default:
      console.log(`Unhandled webhook type: ${webhook.webhook_type}`);
  }
  
  res.status(200).json({ success: true });
});

async function handleTransactionsWebhook(webhook) {
  switch (webhook.webhook_code) {
    case 'SYNC_UPDATES_AVAILABLE':
      await syncTransactions(webhook.item_id);
      break;
    case 'DEFAULT_UPDATE':
      await syncHistoricalTransactions(webhook.item_id, webhook.new_transactions);
      break;
  }
}

async function handleItemWebhook(webhook) {
  const connection = await db.bankConnections.findUnique({
    where: { itemId: webhook.item_id }
  });
  
  switch (webhook.webhook_code) {
    case 'ERROR':
      await db.bankConnections.update({
        where: { id: connection.id },
        data: { status: 'error', error: webhook.error }
      });
      break;
    case 'PENDING_EXPIRATION':
      await sendReauthenticationNotification(connection.userId);
      break;
  }
}
```

## Guidelines

- **Always encrypt access tokens** before storing them in your database
- **Implement proper webhook handling** to keep data synchronized
- **Use appropriate Plaid products** based on your use case
- **Handle Link errors gracefully** — network issues and user authentication problems are common
- **Respect rate limits** — Plaid has API rate limits based on your plan
- **Store transaction data locally** for faster queries and reduced API usage
- **Implement data retention policies** — don't store financial data longer than necessary
- **Handle connection health** — send notifications when re-authentication is required
- **Test with Plaid's sandbox** thoroughly before using real financial institutions
- **Consider data privacy regulations** — PCI DSS, PII protection, and regional privacy laws