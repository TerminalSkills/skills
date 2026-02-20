---
name: invoice-ninja
description: >-
  Create and manage invoices with Invoice Ninja API. Handle client management, 
  invoice generation, payment tracking, recurring billing, expense tracking, and 
  project time billing for freelancers and small businesses.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: ["invoicing", "billing", "freelancing", "accounting", "self-hosted"]
---

# Invoice Ninja API

Integrate with Invoice Ninja's self-hosted invoicing platform for client management, invoice generation, and payment tracking.

## Overview

Invoice Ninja is an open-source invoicing platform that provides comprehensive invoicing features including client management, invoice generation, payment tracking, recurring billing, expense tracking, and project time billing.

## Authentication

```javascript
// Install axios for HTTP requests
// npm install axios

const axios = require('axios');

// Invoice Ninja API configuration
const INVOICE_NINJA_BASE_URL = process.env.INVOICE_NINJA_URL || 'https://your-domain.invoicing.co';
const INVOICE_NINJA_TOKEN = process.env.INVOICE_NINJA_TOKEN;

const invoiceNinjaAPI = axios.create({
  baseURL: `${INVOICE_NINJA_BASE_URL}/api/v1`,
  headers: {
    'X-API-Token': INVOICE_NINJA_TOKEN,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});
```

## Instructions

### Step 1 — Client Management

```javascript
// Create client
async function createClient(clientData) {
  const response = await invoiceNinjaAPI.post('/clients', {
    name: clientData.name,
    website: clientData.website,
    private_notes: clientData.privateNotes,
    vat_number: clientData.vatNumber,
    
    // Contact information
    contacts: [{
      first_name: clientData.contact.firstName,
      last_name: clientData.contact.lastName,
      email: clientData.contact.email,
      phone: clientData.contact.phone,
      is_primary: true
    }],
    
    // Billing address
    address1: clientData.address?.address1,
    city: clientData.address?.city,
    state: clientData.address?.state,
    postal_code: clientData.address?.postalCode,
    country_id: clientData.address?.countryId,
    
    // Settings
    currency_id: clientData.currencyId || 1, // 1 = USD
    payment_terms: clientData.paymentTerms || 0
  });
  
  return {
    id: response.data.data.id,
    name: response.data.data.name,
    balance: response.data.data.balance,
    contacts: response.data.data.contacts
  };
}

// Get client by ID
async function getClient(clientId) {
  const response = await invoiceNinjaAPI.get(`/clients/${clientId}`);
  const client = response.data.data;
  
  return {
    id: client.id,
    name: client.name,
    balance: client.balance,
    contacts: client.contacts,
    address: {
      address1: client.address1,
      city: client.city,
      state: client.state,
      postalCode: client.postal_code
    }
  };
}

// List clients
async function listClients(filters = {}) {
  const params = new URLSearchParams();
  
  if (filters.name) params.append('filter', filters.name);
  if (filters.page) params.append('page', filters.page);
  
  const response = await invoiceNinjaAPI.get(`/clients?${params}`);
  
  return {
    data: response.data.data.map(client => ({
      id: client.id,
      name: client.name,
      balance: client.balance,
      email: client.contacts?.[0]?.email
    })),
    meta: response.data.meta
  };
}
```

### Step 2 — Invoice Creation and Management

```javascript
// Create invoice
async function createInvoice(invoiceData) {
  const response = await invoiceNinjaAPI.post('/invoices', {
    client_id: invoiceData.clientId,
    number: invoiceData.number,
    date: invoiceData.date || new Date().toISOString().split('T')[0],
    due_date: invoiceData.dueDate,
    public_notes: invoiceData.publicNotes,
    private_notes: invoiceData.privateNotes,
    terms: invoiceData.terms,
    discount: invoiceData.discount || 0,
    tax_name1: invoiceData.taxName1,
    tax_rate1: invoiceData.taxRate1 || 0,
    
    // Line items
    line_items: invoiceData.lineItems.map(item => ({
      product_key: item.productKey,
      notes: item.description,
      cost: item.cost,
      qty: item.quantity || 1,
      tax_rate1: item.taxRate1 || 0,
      discount: item.discount || 0
    }))
  });
  
  return {
    id: response.data.data.id,
    number: response.data.data.number,
    clientId: response.data.data.client_id,
    amount: response.data.data.amount,
    balance: response.data.data.balance,
    status: response.data.data.status_id,
    date: new Date(response.data.data.date),
    dueDate: new Date(response.data.data.due_date)
  };
}

// Get invoice by ID
async function getInvoice(invoiceId) {
  const response = await invoiceNinjaAPI.get(`/invoices/${invoiceId}`);
  const invoice = response.data.data;
  
  return {
    id: invoice.id,
    number: invoice.number,
    clientId: invoice.client_id,
    amount: invoice.amount,
    balance: invoice.balance,
    status: invoice.status_id,
    date: new Date(invoice.date),
    dueDate: new Date(invoice.due_date),
    lineItems: invoice.line_items.map(item => ({
      productKey: item.product_key,
      description: item.notes,
      cost: item.cost,
      quantity: item.qty,
      lineTotal: item.line_total
    }))
  };
}

// Send invoice
async function sendInvoice(invoiceId) {
  const response = await invoiceNinjaAPI.post(`/invoices/${invoiceId}/email`);
  return { success: true };
}

// Mark invoice as paid
async function markInvoiceAsPaid(invoiceId, paymentDate = null) {
  const data = paymentDate ? { payment_date: paymentDate } : {};
  const response = await invoiceNinjaAPI.put(`/invoices/${invoiceId}/mark_paid`, data);
  return response.data.data;
}

// Download invoice PDF
async function downloadInvoicePDF(invoiceId) {
  const response = await invoiceNinjaAPI.get(`/invoices/${invoiceId}/download`, {
    responseType: 'arraybuffer',
    headers: { 'Accept': 'application/pdf' }
  });
  
  return {
    data: response.data,
    filename: `invoice-${invoiceId}.pdf`,
    mimeType: 'application/pdf'
  };
}
```

### Step 3 — Payment Tracking and Management

```javascript
// Create payment
async function createPayment(paymentData) {
  const response = await invoiceNinjaAPI.post('/payments', {
    client_id: paymentData.clientId,
    amount: paymentData.amount,
    payment_date: paymentData.date || new Date().toISOString().split('T')[0],
    payment_type_id: paymentData.paymentTypeId || 1, // 1 = Bank Transfer
    transaction_reference: paymentData.transactionReference,
    private_notes: paymentData.privateNotes,
    
    // Invoice allocations
    invoices: paymentData.invoices?.map(invoice => ({
      invoice_id: invoice.invoiceId,
      amount: invoice.amount
    })) || []
  });
  
  return {
    id: response.data.data.id,
    clientId: response.data.data.client_id,
    amount: response.data.data.amount,
    date: new Date(response.data.data.payment_date),
    paymentTypeId: response.data.data.payment_type_id
  };
}

// List payments
async function listPayments(filters = {}) {
  const params = new URLSearchParams();
  
  if (filters.clientId) params.append('client_id', filters.clientId);
  if (filters.page) params.append('page', filters.page);
  
  const response = await invoiceNinjaAPI.get(`/payments?${params}`);
  
  return {
    data: response.data.data.map(payment => ({
      id: payment.id,
      clientId: payment.client_id,
      amount: payment.amount,
      date: new Date(payment.payment_date),
      paymentTypeId: payment.payment_type_id
    })),
    meta: response.data.meta
  };
}
```

### Step 4 — Recurring Invoices

```javascript
// Create recurring invoice
async function createRecurringInvoice(recurringData) {
  const response = await invoiceNinjaAPI.post('/recurring_invoices', {
    client_id: recurringData.clientId,
    frequency_id: recurringData.frequencyId, // 1=Weekly, 2=Bi-Weekly, 3=Monthly
    number: recurringData.number,
    date: recurringData.startDate || new Date().toISOString().split('T')[0],
    due_date_days: recurringData.dueDateDays || 'terms',
    remaining_cycles: recurringData.remainingCycles || -1, // -1 = unlimited
    public_notes: recurringData.publicNotes,
    terms: recurringData.terms,
    
    // Line items
    line_items: recurringData.lineItems.map(item => ({
      product_key: item.productKey,
      notes: item.description,
      cost: item.cost,
      qty: item.quantity || 1
    }))
  });
  
  return {
    id: response.data.data.id,
    number: response.data.data.number,
    clientId: response.data.data.client_id,
    frequencyId: response.data.data.frequency_id,
    remainingCycles: response.data.data.remaining_cycles
  };
}

// Start recurring invoice
async function startRecurringInvoice(recurringInvoiceId) {
  const response = await invoiceNinjaAPI.put(`/recurring_invoices/${recurringInvoiceId}/start`);
  return response.data.data;
}

// Stop recurring invoice
async function stopRecurringInvoice(recurringInvoiceId) {
  const response = await invoiceNinjaAPI.put(`/recurring_invoices/${recurringInvoiceId}/stop`);
  return response.data.data;
}
```

### Step 5 — Expenses and Time Tracking

```javascript
// Create expense
async function createExpense(expenseData) {
  const response = await invoiceNinjaAPI.post('/expenses', {
    client_id: expenseData.clientId,
    expense_category_id: expenseData.categoryId,
    amount: expenseData.amount,
    expense_date: expenseData.date || new Date().toISOString().split('T')[0],
    public_notes: expenseData.publicNotes,
    private_notes: expenseData.privateNotes,
    should_be_invoiced: expenseData.shouldBeInvoiced || false,
    is_billable: expenseData.isBillable || false
  });
  
  return {
    id: response.data.data.id,
    clientId: response.data.data.client_id,
    amount: response.data.data.amount,
    date: new Date(response.data.data.expense_date),
    shouldBeInvoiced: response.data.data.should_be_invoiced
  };
}

// Create task/time entry
async function createTask(taskData) {
  const response = await invoiceNinjaAPI.post('/tasks', {
    client_id: taskData.clientId,
    project_id: taskData.projectId,
    description: taskData.description,
    time_log: taskData.timeLog || JSON.stringify([]),
    is_billable: taskData.isBillable !== false,
    rate: taskData.rate || 0
  });
  
  return {
    id: response.data.data.id,
    clientId: response.data.data.client_id,
    description: response.data.data.description,
    timeLog: JSON.parse(response.data.data.time_log || '[]'),
    rate: response.data.data.rate
  };
}

// Invoice Ninja integration class
class InvoiceNinjaIntegration {
  // Create invoice from template
  async createInvoiceFromTemplate(templateData) {
    let client;
    if (templateData.client.id) {
      client = await getClient(templateData.client.id);
    } else {
      client = await createClient(templateData.client);
    }
    
    const invoice = await createInvoice({
      clientId: client.id,
      ...templateData.invoice
    });
    
    return { client, invoice };
  }
  
  // Get business dashboard data
  async getDashboardData() {
    const [clients, invoices, payments] = await Promise.all([
      listClients({ perPage: 1 }),
      listInvoices({ perPage: 10, sort: 'created_at|desc' }),
      listPayments({ perPage: 10, sort: 'payment_date|desc' })
    ]);
    
    return {
      totals: {
        clientCount: clients.meta.pagination.total,
        invoiceCount: invoices.meta.pagination.total
      },
      recentInvoices: invoices.data,
      recentPayments: payments.data
    };
  }
}

// API endpoints
const ninjaIntegration = new InvoiceNinjaIntegration();

app.get('/api/invoice-ninja/dashboard', async (req, res) => {
  try {
    const data = await ninjaIntegration.getDashboardData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

app.post('/api/invoice-ninja/quick-invoice', async (req, res) => {
  try {
    const result = await ninjaIntegration.createInvoiceFromTemplate(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});
```

## Guidelines

- **Secure API token storage** — never expose tokens in client-side code
- **Use appropriate error handling** for network failures and validation issues
- **Implement proper pagination** when fetching large datasets
- **Validate data before API calls** — check required fields and data types
- **Cache frequently used data** like client lists to reduce API calls
- **Handle Invoice Ninja updates** — API may change between versions
- **Use webhooks when available** for real-time updates
- **Implement proper logging** for audit trails and debugging
- **Back up critical data** — maintain local copies of important business data
- **Use include parameters** to fetch related data in single API calls
- **Test with sample data** before processing real client information
- **Handle currency conversions** appropriately for international clients
- **Monitor server resources** — Invoice Ninja can be resource-intensive with large datasets