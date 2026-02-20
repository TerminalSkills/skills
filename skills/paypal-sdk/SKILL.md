---
name: paypal-sdk
description: >-
  Accept PayPal payments in web applications using PayPal's JavaScript SDK and 
  REST API. Handle one-time payments, subscriptions, express checkout, and 
  webhook notifications with comprehensive error handling.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: payments
  tags: ["paypal", "payments", "checkout", "subscriptions", "express-checkout"]
---

# PayPal SDK

Integrate PayPal payments into web applications using PayPal's modern JavaScript SDK and REST API for seamless checkout experiences.

## Overview

PayPal SDK enables businesses to accept PayPal payments, credit/debit cards, and alternative payment methods. Supports one-time payments, subscriptions, and express checkout with mobile optimization.

## Authentication

```javascript
// PayPal REST API credentials
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

// Get access token for PayPal API
async function getPayPalAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  
  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  
  const data = await response.json();
  return data.access_token;
}
```

## Instructions

### Step 1 — Frontend PayPal Integration

```javascript
// HTML: Include PayPal SDK
// <script src="https://www.paypal.com/sdk/js?client-id=YOUR_CLIENT_ID&currency=USD"></script>

// Basic PayPal button integration
function initializePayPalButton(amount, currency = 'USD') {
  paypal.Buttons({
    createOrder: function(data, actions) {
      return actions.order.create({
        purchase_units: [{
          amount: {
            currency_code: currency,
            value: amount.toString()
          },
          description: 'Purchase from My Store'
        }]
      });
    },
    
    onApprove: function(data, actions) {
      return actions.order.capture().then(function(orderData) {
        console.log('Payment completed:', orderData);
        
        // Send order data to your server for processing
        return fetch('/api/paypal/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderID: data.orderID,
            payerID: data.payerID,
            orderData: orderData
          })
        });
      });
    },
    
    onError: function(err) {
      console.error('PayPal payment error:', err);
      showErrorMessage('Payment failed. Please try again.');
    },
    
    onCancel: function(data) {
      console.log('Payment cancelled:', data);
      showMessage('Payment cancelled.');
    }
  }).render('#paypal-button-container');
}

// Advanced PayPal integration with custom amounts
class PayPalCheckout {
  constructor(options = {}) {
    this.currency = options.currency || 'USD';
    this.environment = options.environment || 'sandbox';
  }
  
  createAdvancedButton(containerSelector, orderData) {
    paypal.Buttons({
      style: {
        color: 'blue',
        shape: 'rect',
        label: 'paypal',
        layout: 'vertical'
      },
      
      createOrder: (data, actions) => {
        return actions.order.create({
          purchase_units: [{
            amount: {
              currency_code: this.currency,
              value: orderData.total,
              breakdown: {
                item_total: {
                  currency_code: this.currency,
                  value: orderData.itemsTotal
                },
                shipping: orderData.shipping ? {
                  currency_code: this.currency,
                  value: orderData.shipping
                } : undefined,
                tax_total: orderData.tax ? {
                  currency_code: this.currency,
                  value: orderData.tax
                } : undefined
              }
            },
            items: orderData.items.map(item => ({
              name: item.name,
              unit_amount: {
                currency_code: this.currency,
                value: item.price
              },
              quantity: item.quantity.toString(),
              description: item.description,
              category: 'DIGITAL_GOODS' // or 'PHYSICAL_GOODS'
            })),
            shipping: orderData.shipping ? {
              name: {
                full_name: orderData.shippingAddress.name
              },
              address: {
                address_line_1: orderData.shippingAddress.address1,
                address_line_2: orderData.shippingAddress.address2,
                admin_area_2: orderData.shippingAddress.city,
                admin_area_1: orderData.shippingAddress.state,
                postal_code: orderData.shippingAddress.zip,
                country_code: orderData.shippingAddress.country
              }
            } : undefined
          }],
          
          application_context: {
            shipping_preference: orderData.shipping ? 'SET_PROVIDED_ADDRESS' : 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            brand_name: 'My Store',
            landing_page: 'BILLING'
          }
        });
      },
      
      onApprove: async (data, actions) => {
        try {
          const order = await actions.order.capture();
          await this.handleSuccessfulPayment(order, orderData);
          return order;
        } catch (error) {
          console.error('Payment capture failed:', error);
          throw error;
        }
      },
      
      onError: (err) => this.handlePaymentError(err),
      onCancel: (data) => this.handlePaymentCancel(data)
      
    }).render(containerSelector);
  }
  
  async handleSuccessfulPayment(paypalOrder, localOrderData) {
    const response = await fetch('/api/paypal/process-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paypalOrderId: paypalOrder.id,
        localOrderData: localOrderData,
        paymentDetails: paypalOrder
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      window.location.href = `/success?order=${result.orderId}`;
    } else {
      throw new Error(result.error);
    }
  }
  
  handlePaymentError(error) {
    console.error('PayPal payment error:', error);
    this.showMessage('Payment failed. Please try again or use a different payment method.');
  }
  
  handlePaymentCancel(data) {
    console.log('Payment cancelled by user:', data);
    this.showMessage('Payment was cancelled.');
  }
  
  showMessage(message) {
    // Implement your UI notification system
    alert(message);
  }
}
```

### Step 2 — Server-side Order Processing

```javascript
// Server-side PayPal integration
const express = require('express');
const app = express();

// Process PayPal payment on server
app.post('/api/paypal/process-payment', async (req, res) => {
  try {
    const { paypalOrderId, localOrderData, paymentDetails } = req.body;
    
    // Verify payment with PayPal
    const accessToken = await getPayPalAccessToken();
    const paypalOrder = await getPayPalOrder(paypalOrderId, accessToken);
    
    // Validate payment amount and status
    if (paypalOrder.status !== 'COMPLETED') {
      return res.status(400).json({ 
        success: false, 
        error: 'Payment not completed' 
      });
    }
    
    const paidAmount = parseFloat(paypalOrder.purchase_units[0].payments.captures[0].amount.value);
    const expectedAmount = parseFloat(localOrderData.total);
    
    if (Math.abs(paidAmount - expectedAmount) > 0.01) {
      return res.status(400).json({ 
        success: false, 
        error: 'Payment amount mismatch' 
      });
    }
    
    // Create order in your database
    const order = await createOrder({
      paypalOrderId: paypalOrderId,
      customerEmail: paypalOrder.payer.email_address,
      customerName: `${paypalOrder.payer.name.given_name} ${paypalOrder.payer.name.surname}`,
      items: localOrderData.items,
      totalAmount: paidAmount,
      currency: paypalOrder.purchase_units[0].payments.captures[0].amount.currency_code,
      paymentMethod: 'paypal',
      status: 'completed',
      paypalTransactionId: paypalOrder.purchase_units[0].payments.captures[0].id
    });
    
    // Send confirmation email
    await sendOrderConfirmationEmail(order);
    
    // Fulfill order
    await fulfillOrder(order);
    
    res.json({
      success: true,
      orderId: order.id,
      transactionId: paypalOrder.purchase_units[0].payments.captures[0].id
    });
    
  } catch (error) {
    console.error('PayPal payment processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Payment processing failed'
    });
  }
});

// Get PayPal order details
async function getPayPalOrder(orderId, accessToken) {
  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get PayPal order: ${response.statusText}`);
  }
  
  return await response.json();
}
```

### Step 3 — PayPal Subscriptions

```javascript
// Create subscription product and plan
async function createSubscriptionPlan(planData) {
  const accessToken = await getPayPalAccessToken();
  
  // First, create a product
  const productResponse = await fetch(`${PAYPAL_BASE_URL}/v1/catalogs/products`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: planData.productName,
      description: planData.productDescription,
      type: 'DIGITAL', // or 'PHYSICAL'
      category: 'SOFTWARE'
    })
  });
  
  const product = await productResponse.json();
  
  // Create billing plan
  const planResponse = await fetch(`${PAYPAL_BASE_URL}/v1/billing/plans`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      product_id: product.id,
      name: planData.planName,
      description: planData.planDescription,
      status: 'ACTIVE',
      billing_cycles: [{
        frequency: {
          interval_unit: planData.intervalUnit, // 'MONTH', 'YEAR'
          interval_count: planData.intervalCount || 1
        },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: planData.totalCycles || 0, // 0 = unlimited
        pricing_scheme: {
          fixed_price: {
            value: planData.amount,
            currency_code: planData.currency || 'USD'
          }
        }
      }],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: planData.setupFee ? {
          value: planData.setupFee,
          currency_code: planData.currency || 'USD'
        } : undefined,
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3
      }
    })
  });
  
  return await planResponse.json();
}

// Frontend subscription button
function createSubscriptionButton(planId, containerSelector) {
  paypal.Buttons({
    createSubscription: function(data, actions) {
      return actions.subscription.create({
        plan_id: planId,
        application_context: {
          brand_name: 'My SaaS App',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'SUBSCRIBE_NOW'
        }
      });
    },
    
    onApprove: function(data, actions) {
      console.log('Subscription approved:', data.subscriptionID);
      
      // Send subscription data to your server
      return fetch('/api/paypal/subscription-approved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionID: data.subscriptionID,
          planId: planId
        })
      }).then(response => response.json())
        .then(result => {
          if (result.success) {
            window.location.href = '/subscription-success';
          }
        });
    },
    
    onError: function(err) {
      console.error('Subscription error:', err);
    }
  }).render(containerSelector);
}
```

### Step 4 — Webhook Integration

```javascript
// PayPal webhook handler
app.post('/webhook/paypal', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    const event = JSON.parse(req.body.toString());
    
    // Verify webhook (optional but recommended)
    const isValid = await verifyPayPalWebhook(req.headers, req.body);
    if (!isValid) {
      return res.status(401).send('Unauthorized');
    }
    
    await handlePayPalWebhook(event);
    res.status(200).send('OK');
    
  } catch (error) {
    console.error('PayPal webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});

async function handlePayPalWebhook(event) {
  console.log(`Processing PayPal webhook: ${event.event_type}`);
  
  switch (event.event_type) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
      await handleSubscriptionActivated(event.resource);
      break;
    case 'BILLING.SUBSCRIPTION.CANCELLED':
      await handleSubscriptionCancelled(event.resource);
      break;
    case 'BILLING.SUBSCRIPTION.SUSPENDED':
      await handleSubscriptionSuspended(event.resource);
      break;
    case 'PAYMENT.SALE.COMPLETED':
      await handlePaymentCompleted(event.resource);
      break;
    case 'PAYMENT.SALE.DENIED':
      await handlePaymentFailed(event.resource);
      break;
    default:
      console.log(`Unhandled webhook event: ${event.event_type}`);
  }
}
```

### Step 5 — Advanced Features and Utilities

```javascript
// PayPal service class for comprehensive management
class PayPalService {
  constructor() {
    this.clientId = process.env.PAYPAL_CLIENT_ID;
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    this.baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }
  
  async getAccessToken() {
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    
    const data = await response.json();
    return data.access_token;
  }
  
  // Refund a payment
  async refundPayment(captureId, amount = null) {
    const accessToken = await this.getAccessToken();
    
    const refundData = {
      note_to_payer: 'Refund processed by merchant'
    };
    
    if (amount) {
      refundData.amount = {
        value: amount.toString(),
        currency_code: 'USD'
      };
    }
    
    const response = await fetch(
      `${this.baseUrl}/v2/payments/captures/${captureId}/refund`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(refundData)
      }
    );
    
    return await response.json();
  }
  
  // Cancel subscription
  async cancelSubscription(subscriptionId, reason = 'User requested cancellation') {
    const accessToken = await this.getAccessToken();
    
    const response = await fetch(
      `${this.baseUrl}/v1/billing/subscriptions/${subscriptionId}/cancel`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      }
    );
    
    return response.ok;
  }
  
  // Get transaction history
  async getTransactionHistory(startDate, endDate) {
    const accessToken = await this.getAccessToken();
    
    const response = await fetch(
      `${this.baseUrl}/v1/reporting/transactions?start_date=${startDate}&end_date=${endDate}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return await response.json();
  }
}

// Usage example
const paypalService = new PayPalService();

app.post('/api/paypal/refund', async (req, res) => {
  try {
    const { captureId, amount } = req.body;
    const refund = await paypalService.refundPayment(captureId, amount);
    
    res.json({
      success: true,
      refundId: refund.id,
      status: refund.status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

## Guidelines

- **Always validate payments server-side** — never trust client-side data alone
- **Use HTTPS in production** — PayPal requires secure connections
- **Implement proper error handling** for network failures and payment declines
- **Store PayPal transaction IDs** for reference and dispute resolution
- **Handle webhook events reliably** — implement proper retry logic
- **Test with PayPal sandbox** thoroughly before going live
- **Verify webhook authenticity** in production environments
- **Handle multiple currencies** if serving international customers
- **Implement proper refund workflows** for customer service
- **Monitor transaction fees** and adjust pricing accordingly
- **Use PayPal's developer tools** for debugging and testing
- **Consider PayPal's user experience guidelines** for optimal conversion rates