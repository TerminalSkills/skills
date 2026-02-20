---
name: wise-api
description: >-
  Send international money transfers via Wise API. Handle multi-currency 
  transfers, recipient management, real-time exchange rates, transfer quotes,
  and payment processing for global remittance applications.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: fintech
  tags: ["wise", "international-transfers", "remittance", "forex", "multi-currency"]
---

# Wise API

Integrate international money transfers using Wise's API for global remittance, multi-currency payments, and foreign exchange services.

## Overview

Wise API enables businesses to send money internationally with real mid-market exchange rates and transparent fees. Supports transfers to 80+ countries, multi-currency accounts, and real-time transfer tracking.

## Authentication

```javascript
// Install dependencies
// npm install axios

const axios = require('axios');

const WISE_BASE_URL = process.env.WISE_ENVIRONMENT === 'live' 
  ? 'https://api.wise.com'
  : 'https://api.sandbox.transferwise.tech';

const wiseAPI = axios.create({
  baseURL: WISE_BASE_URL,
  headers: {
    'Authorization': `Bearer ${process.env.WISE_API_TOKEN}`,
    'Content-Type': 'application/json'
  }
});
```

## Instructions

### Step 1 — Account Setup and Profile Management

```javascript
// Get user profiles
async function getUserProfiles() {
  const response = await wiseAPI.get('/v1/profiles');
  
  return response.data.map(profile => ({
    id: profile.id,
    type: profile.type, // 'personal' or 'business'
    firstName: profile.details?.firstName,
    lastName: profile.details?.lastName,
    email: profile.details?.email
  }));
}

// Get account balances for multi-currency account
async function getAccountBalances(profileId) {
  const response = await wiseAPI.get(`/v1/profiles/${profileId}/balances`);
  
  return response.data.map(balance => ({
    id: balance.id,
    currency: balance.currency,
    amount: balance.amount,
    bankDetails: balance.bankDetails
  }));
}
```

### Step 2 — Exchange Rates and Transfer Quotes

```javascript
// Get real-time exchange rates
async function getExchangeRates(sourceCurrency, targetCurrency) {
  const response = await wiseAPI.get(`/v1/rates?source=${sourceCurrency}&target=${targetCurrency}`);
  
  return response.data.map(rate => ({
    rate: rate.rate,
    source: rate.source,
    target: rate.target,
    time: new Date(rate.time)
  }));
}

// Create transfer quote
async function createTransferQuote(profileId, quoteData) {
  const response = await wiseAPI.post('/v1/quotes', {
    profileId: profileId,
    sourceCurrency: quoteData.sourceCurrency,
    targetCurrency: quoteData.targetCurrency,
    sourceAmount: quoteData.sourceAmount,
    payIn: quoteData.payIn || 'BALANCE'
  });
  
  return {
    id: response.data.id,
    source: response.data.source,
    target: response.data.target,
    rate: response.data.rate,
    fee: response.data.paymentOptions[0]?.fee,
    deliveryEstimate: response.data.deliveryEstimate
  };
}

// Exchange rate calculator
class WiseExchangeCalculator {
  constructor() {
    this.rateCache = new Map();
    this.cacheTimeout = 30000; // 30 seconds
  }
  
  async calculateExchange(fromCurrency, toCurrency, amount) {
    const cacheKey = `${fromCurrency}-${toCurrency}`;
    const cachedRate = this.rateCache.get(cacheKey);
    
    if (cachedRate && (Date.now() - cachedRate.timestamp) < this.cacheTimeout) {
      return {
        fromAmount: amount,
        toAmount: Math.round(amount * cachedRate.rate * 100) / 100,
        rate: cachedRate.rate,
        fromCurrency,
        toCurrency
      };
    }
    
    const rates = await getExchangeRates(fromCurrency, toCurrency);
    const currentRate = rates[0];
    
    this.rateCache.set(cacheKey, {
      rate: currentRate.rate,
      timestamp: Date.now()
    });
    
    return {
      fromAmount: amount,
      toAmount: Math.round(amount * currentRate.rate * 100) / 100,
      rate: currentRate.rate,
      fromCurrency,
      toCurrency
    };
  }
}
```

### Step 3 — Recipient Management

```javascript
// Create recipient account
async function createRecipient(profileId, recipientData) {
  const response = await wiseAPI.post('/v1/accounts', {
    profileId: profileId,
    accountHolderName: recipientData.accountHolderName,
    currency: recipientData.currency,
    type: recipientData.type,
    details: recipientData.details
  });
  
  return {
    id: response.data.id,
    accountHolderName: response.data.accountHolderName,
    currency: response.data.currency,
    type: response.data.type,
    details: response.data.details
  };
}

// Get recipient requirements for a country
async function getRecipientRequirements(sourceCurrency, targetCurrency, sourceAmount) {
  const response = await wiseAPI.get('/v1/account-requirements', {
    params: {
      source: sourceCurrency,
      target: targetCurrency,
      sourceAmount: sourceAmount
    }
  });
  
  return response.data.map(requirement => ({
    type: requirement.type,
    title: requirement.title,
    fields: requirement.fields
  }));
}

// List recipients
async function getRecipients(profileId, currency = null) {
  const params = currency ? { currency } : {};
  const response = await wiseAPI.get(`/v1/profiles/${profileId}/accounts`, { params });
  
  return response.data.map(recipient => ({
    id: recipient.id,
    accountHolderName: recipient.accountHolderName,
    currency: recipient.currency,
    type: recipient.type,
    details: recipient.details
  }));
}
```

### Step 4 — Transfer Creation and Management

```javascript
// Create transfer
async function createTransfer(profileId, quoteId, recipientId, reference) {
  const response = await wiseAPI.post('/v1/transfers', {
    profileId: profileId,
    quoteId: quoteId,
    targetAccount: recipientId,
    customerTransactionId: `txn_${Date.now()}`,
    details: {
      reference: reference,
      transferPurpose: 'verification.transfers.purpose.pay.bills'
    }
  });
  
  return {
    id: response.data.id,
    status: response.data.status,
    reference: response.data.reference,
    rate: response.data.rate,
    sourceValue: response.data.sourceValue,
    targetValue: response.data.targetValue
  };
}

// Fund transfer
async function fundTransfer(transferId, type = 'BALANCE') {
  const response = await wiseAPI.post(`/v1/transfers/${transferId}/payments`, {
    type: type
  });
  
  return {
    status: response.data.status,
    errorCode: response.data.errorCode
  };
}

// Get transfer status
async function getTransferStatus(transferId) {
  const response = await wiseAPI.get(`/v1/transfers/${transferId}`);
  
  return {
    id: response.data.id,
    status: response.data.status,
    sourceValue: response.data.sourceValue,
    targetValue: response.data.targetValue,
    rate: response.data.rate,
    reference: response.data.reference
  };
}

// Complete transfer flow
class WiseTransferService {
  constructor(profileId) {
    this.profileId = profileId;
  }
  
  async createCompleteTransfer(transferData) {
    // Step 1: Create quote
    const quote = await createTransferQuote(this.profileId, {
      sourceCurrency: transferData.sourceCurrency,
      targetCurrency: transferData.targetCurrency,
      sourceAmount: transferData.sourceAmount
    });
    
    // Step 2: Create or find recipient
    const recipient = await createRecipient(this.profileId, transferData.recipient);
    
    // Step 3: Create transfer
    const transfer = await createTransfer(
      this.profileId,
      quote.id,
      recipient.id,
      transferData.reference
    );
    
    // Step 4: Fund transfer
    const fundingResult = await fundTransfer(transfer.id, 'BALANCE');
    
    return {
      transferId: transfer.id,
      status: transfer.status,
      sourceAmount: transfer.sourceValue,
      targetAmount: transfer.targetValue,
      rate: transfer.rate
    };
  }
}
```

### Step 5 — Webhook Handling

```javascript
// Webhook handler for transfer status updates
app.post('/api/wise-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-signature-sha256'];
  const body = req.body.toString();
  
  if (!verifyWiseWebhookSignature(body, signature)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }
  
  const event = JSON.parse(body);
  await handleWiseWebhookEvent(event);
  
  res.status(200).json({ success: true });
});

async function handleWiseWebhookEvent(event) {
  switch (event.event_type) {
    case 'transfers#state-change':
      await handleTransferStatusChange(event.data);
      break;
    case 'balances#credit':
      await handleBalanceCredit(event.data);
      break;
    default:
      console.log(`Unhandled webhook event: ${event.event_type}`);
  }
}

async function handleTransferStatusChange(data) {
  const transferId = data.resource.id;
  const newStatus = data.current_state;
  
  await db.transfers.update({
    where: { wiseTransferId: transferId },
    data: { status: newStatus }
  });
  
  // Send status update notification
  if (newStatus === 'outgoing_payment_sent') {
    await sendTransferCompleteNotification(transferId);
  }
}
```

## Guidelines

- **Use sandbox environment** extensively during development
- **Implement proper error handling** for network failures and regulatory blocks
- **Store sensitive data securely** — encrypt API tokens
- **Handle webhook events promptly** — return 200 status quickly
- **Implement rate limiting** — respect Wise's API rate limits
- **Use Strong Customer Authentication (SCA)** for EU compliance when required
- **Validate recipient details** before creating transfers
- **Monitor transfer statuses** — some transfers require additional verification
- **Handle currency restrictions** — some currency pairs have limitations
- **Use appropriate transfer purposes** — incorrect codes can cause delays
- **Test with various currencies** and countries to understand requirements
- **Consider compliance requirements** based on your jurisdiction