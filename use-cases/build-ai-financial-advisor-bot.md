---
title: "Build an AI Personal Finance Advisor Bot"
description: "Create a Cleo/Copilot-style AI advisor that connects to bank accounts via Plaid, categorizes spending with Claude, generates monthly health scores, and sends proactive alerts for budget overruns and unusual transactions."
skills: [anthropic-sdk, prisma]
difficulty: intermediate
time_estimate: "6 hours"
tags: [fintech, ai, personal-finance, plaid, banking, budgeting]
---

# Build an AI Personal Finance Advisor Bot

You're building **FinPal** — a personal finance advisor that connects to your users' bank accounts, understands their spending, and gives proactive, personalized advice. Think Cleo meets Copilot, but yours.

## Who This Is For

A fintech founder tired of spreadsheets who wants to ship a real product. You have bank API access and need AI to make sense of raw transaction data.

## What You'll Build

- 🏦 Plaid integration — transactions, balances, accounts
- 🧠 AI categorization — food, rent, subscriptions, entertainment
- 📊 Monthly financial health score with actionable insights
- 🎯 Goal tracking — emergency fund, debt payoff, vacation savings
- 🚨 Proactive alerts — unusual spending, upcoming bills, budget overruns

## Prerequisites

- Plaid developer account (sandbox is free)
- Anthropic API key
- PostgreSQL database

---

## Step 1: Schema with Prisma

```prisma
// schema.prisma
model User {
  id           String        @id @default(cuid())
  email        String        @unique
  plaidToken   String?       // encrypted access token
  transactions Transaction[]
  goals        Goal[]
  alerts       Alert[]
  createdAt    DateTime      @default(now())
}

model Transaction {
  id          String   @id @default(cuid())
  userId      String
  plaidId     String   @unique
  amount      Float
  merchant    String
  date        DateTime
  category    String?  // AI-assigned
  rawCategory String?  // Plaid's category
  user        User     @relation(fields: [userId], references: [id])
}

model Goal {
  id         String   @id @default(cuid())
  userId     String
  name       String   // "Emergency Fund"
  targetAmt  Float
  currentAmt Float    @default(0)
  deadline   DateTime?
  user       User     @relation(fields: [userId], references: [id])
}

model Alert {
  id        String   @id @default(cuid())
  userId    String
  type      String   // "unusual_spending" | "budget_overrun" | "bill_due"
  message   String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
}
```

```bash
npx prisma migrate dev --name init
```

---

## Step 2: Sync Transactions from Plaid

```typescript
// lib/plaid-sync.ts
import { PlaidApi, Configuration, PlaidEnvironments } from 'plaid';
import { prisma } from './prisma';

const plaid = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments.sandbox,
  baseOptions: { headers: { 'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID, 'PLAID-SECRET': process.env.PLAID_SECRET } }
}));

export async function syncTransactions(userId: string, accessToken: string) {
  const { data } = await plaid.transactionsGet({
    access_token: accessToken,
    start_date: '2024-01-01',
    end_date: new Date().toISOString().split('T')[0],
  });

  for (const txn of data.transactions) {
    await prisma.transaction.upsert({
      where: { plaidId: txn.transaction_id },
      update: { amount: txn.amount, merchant: txn.merchant_name ?? txn.name },
      create: {
        userId,
        plaidId: txn.transaction_id,
        amount: txn.amount,
        merchant: txn.merchant_name ?? txn.name,
        date: new Date(txn.date),
        rawCategory: txn.personal_finance_category?.primary,
      }
    });
  }

  return data.transactions.length;
}
```

---

## Step 3: AI Categorization with Claude

```typescript
// lib/categorize.ts
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './prisma';

const anthropic = new Anthropic();

export async function categorizeUncategorized(userId: string) {
  const uncategorized = await prisma.transaction.findMany({
    where: { userId, category: null },
    take: 50,
  });

  if (uncategorized.length === 0) return;

  const txnList = uncategorized
    .map(t => `${t.id}: ${t.merchant} $${t.amount}`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Categorize each transaction into: food, rent, subscriptions, entertainment, transport, health, shopping, utilities, income, other.
Return JSON: { "txnId": "category" }

Transactions:
${txnList}`
    }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return;

  const categories: Record<string, string> = JSON.parse(jsonMatch[0]);

  for (const [id, category] of Object.entries(categories)) {
    await prisma.transaction.update({ where: { id }, data: { category } });
  }
}
```

---

## Step 4: Monthly Financial Health Score

```typescript
// lib/health-score.ts
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './prisma';

const anthropic = new Anthropic();

export async function generateHealthScore(userId: string): Promise<{ score: number; insights: string }> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);

  const transactions = await prisma.transaction.findMany({
    where: { userId, date: { gte: start } }
  });

  const goals = await prisma.goal.findMany({ where: { userId } });

  const spending = transactions.reduce((acc, t) => {
    if (t.amount > 0 && t.category) {
      acc[t.category] = (acc[t.category] || 0) + t.amount;
    }
    return acc;
  }, {} as Record<string, number>);

  const income = transactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const totalSpend = Object.values(spending).reduce((a, b) => a + b, 0);
  const savingsRate = income > 0 ? ((income - totalSpend) / income * 100).toFixed(1) : '0';

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Analyze this user's financial health for this month and return a JSON with { score: 0-100, insights: "2-3 sentence plain English summary with actionable tips" }.

Monthly income: $${income.toFixed(2)}
Total spending: $${totalSpend.toFixed(2)}
Savings rate: ${savingsRate}%
Spending breakdown: ${JSON.stringify(spending)}
Goals: ${goals.map(g => `${g.name}: $${g.currentAmt}/$${g.targetAmt}`).join(', ')}`
    }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{"score":50,"insights":"Unable to analyze."}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { score: 50, insights: text };
}
```

---

## Step 5: Proactive Alerts

```typescript
// lib/alerts.ts
import { prisma } from './prisma';

export async function checkAlerts(userId: string) {
  const recentTxns = await prisma.transaction.findMany({
    where: { userId, date: { gte: new Date(Date.now() - 7 * 86400000) } }
  });

  // Unusual spending: single transaction > $500 in non-rent category
  for (const txn of recentTxns) {
    if (txn.amount > 500 && txn.category !== 'rent') {
      await prisma.alert.create({
        data: {
          userId,
          type: 'unusual_spending',
          message: `Large transaction: $${txn.amount} at ${txn.merchant}. Was this expected?`,
        }
      });
    }
  }

  // Budget overrun: entertainment > $200/month
  const entertainmentTotal = recentTxns
    .filter(t => t.category === 'entertainment')
    .reduce((sum, t) => sum + t.amount, 0);

  if (entertainmentTotal > 200) {
    await prisma.alert.create({
      data: {
        userId,
        type: 'budget_overrun',
        message: `Entertainment spending hit $${entertainmentTotal.toFixed(0)} this week. Your monthly budget is $200.`,
      }
    });
  }
}
```

---

## Step 6: Wire It Together

```typescript
// api/advisor.ts
import { syncTransactions } from '../lib/plaid-sync';
import { categorizeUncategorized } from '../lib/categorize';
import { generateHealthScore } from '../lib/health-score';
import { checkAlerts } from '../lib/alerts';

export async function runAdvisorPipeline(userId: string, accessToken: string) {
  const synced = await syncTransactions(userId, accessToken);
  console.log(`Synced ${synced} transactions`);

  await categorizeUncategorized(userId);
  console.log('Categorization complete');

  const health = await generateHealthScore(userId);
  console.log(`Health score: ${health.score}/100 — ${health.insights}`);

  await checkAlerts(userId);
  console.log('Alert check complete');

  return health;
}
```

---

## Next Steps

- Add a chat interface: "How much did I spend on food last month?"
- Build weekly email digests with Resend
- Add Plaid webhooks for real-time transaction updates
- Implement goal contribution suggestions based on surplus income
- Add open banking support for EU users (Nordigen/GoCardless)
