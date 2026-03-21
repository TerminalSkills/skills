---
title: "Build a Personal Finance Tracker with Budgets and AI Insights"
description: "Build your own Mint/YNAB replacement — import bank transactions via CSV or Plaid, auto-categorize with AI, set budgets, track savings goals, and get monthly spending reports."
skills: [anthropic-sdk, prisma]
difficulty: intermediate
time_estimate: "10 hours"
tags: [finance, budgeting, analytics, ai, transactions, goals]
---

# Build a Personal Finance Tracker with Budgets and AI Insights

You've used Mint, YNAB, and Copilot. They're either dead, expensive, or missing features you actually want. Time to build your own — full control over your data, your categories, your rules.

## What You'll Build

- CSV import from any bank + optional Plaid API connection
- AI-powered transaction categorization with editable rules
- Budget creation: monthly limits per category with alerts
- Savings goal tracking with progress visualization
- Monthly report: spending vs. budget, trends, top merchants

## Schema

```typescript
// prisma/schema.prisma
model Account {
  id           String        @id @default(cuid())
  userId       String
  name         String
  type         String        // checking | savings | credit | investment
  institution  String?
  balance      Float         @default(0)
  transactions Transaction[]
  createdAt    DateTime      @default(now())
}

model Transaction {
  id          String   @id @default(cuid())
  accountId   String
  account     Account  @relation(fields: [accountId], references: [id])
  date        DateTime
  description String
  amount      Float    // negative = expense, positive = income
  category    String?
  merchant    String?
  notes       String?
  isReviewed  Boolean  @default(false)
  importHash  String?  @unique // deduplicate CSV imports
  createdAt   DateTime @default(now())

  @@index([accountId, date])
  @@index([category])
}

model Budget {
  id          String   @id @default(cuid())
  userId      String
  category    String
  monthYear   String   // "2024-01"
  limit       Float
  spent       Float    @default(0)
  createdAt   DateTime @default(now())

  @@unique([userId, category, monthYear])
}

model SavingsGoal {
  id          String   @id @default(cuid())
  userId      String
  name        String
  targetAmount Float
  currentAmount Float  @default(0)
  deadline    DateTime?
  color       String   @default("#10b981")
  isComplete  Boolean  @default(false)
  createdAt   DateTime @default(now())
}

model CategoryRule {
  id        String   @id @default(cuid())
  userId    String
  pattern   String   // regex or keyword
  category  String
  priority  Int      @default(0)
}
```

## CSV Import with Deduplication

```typescript
// lib/import.ts
import { parse } from 'csv-parse/sync'
import crypto from 'crypto'
import { prisma } from './db'

interface RawTransaction {
  date: string
  description: string
  amount: string
  balance?: string
}

export async function importCSV(accountId: string, csv: string, format: 'chase' | 'boa' | 'generic') {
  const records = parse(csv, { columns: true, skip_empty_lines: true })
  const transactions = records.map((row: any) => normalizeRow(row, format))

  let imported = 0
  let skipped = 0

  for (const tx of transactions) {
    const hash = crypto
      .createHash('sha256')
      .update(`${tx.date}|${tx.description}|${tx.amount}`)
      .digest('hex')

    try {
      await prisma.transaction.create({
        data: {
          accountId,
          date: new Date(tx.date),
          description: tx.description,
          amount: parseFloat(tx.amount),
          importHash: hash,
        },
      })
      imported++
    } catch (e: any) {
      if (e.code === 'P2002') skipped++ // unique constraint = duplicate
      else throw e
    }
  }

  return { imported, skipped }
}

function normalizeRow(row: any, format: string) {
  switch (format) {
    case 'chase':
      return { date: row['Transaction Date'], description: row['Description'], amount: row['Amount'] }
    case 'boa':
      return { date: row['Date'], description: row['Description'], amount: row['Amount'] }
    default:
      return { date: row.date || row.Date, description: row.description || row.Description, amount: row.amount || row.Amount }
  }
}
```

## AI Auto-Categorization with Claude

```typescript
// lib/categorize.ts
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './db'

const client = new Anthropic()

const CATEGORIES = [
  'Food & Dining', 'Groceries', 'Transportation', 'Entertainment',
  'Shopping', 'Bills & Utilities', 'Healthcare', 'Travel',
  'Income', 'Transfer', 'Subscriptions', 'Other'
]

export async function categorizeTransactions(userId: string, limit = 50) {
  // Get user's category rules first
  const rules = await prisma.categoryRule.findMany({
    where: { userId },
    orderBy: { priority: 'desc' },
  })

  const uncategorized = await prisma.transaction.findMany({
    where: { account: { userId }, category: null },
    orderBy: { date: 'desc' },
    take: limit,
  })

  if (!uncategorized.length) return { processed: 0 }

  // Apply rules first
  const needsAI: typeof uncategorized = []
  for (const tx of uncategorized) {
    const rule = rules.find(r => new RegExp(r.pattern, 'i').test(tx.description))
    if (rule) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { category: rule.category },
      })
    } else {
      needsAI.push(tx)
    }
  }

  if (!needsAI.length) return { processed: uncategorized.length - needsAI.length }

  // Batch AI categorization
  const descriptions = needsAI.map((tx, i) => `${i + 1}. "${tx.description}" ($${Math.abs(tx.amount)})`).join('\n')

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Categorize these bank transactions. For each, respond with just the number and category from this list: ${CATEGORIES.join(', ')}.

Transactions:
${descriptions}

Respond as JSON: {"1": "category", "2": "category", ...}`
    }],
  })

  const content = response.content[0]
  if (content.type !== 'text') return { processed: 0 }

  try {
    const result = JSON.parse(content.text.match(/\{[\s\S]+\}/)?.[0] || '{}')
    for (const [idx, category] of Object.entries(result)) {
      const tx = needsAI[parseInt(idx) - 1]
      if (tx && CATEGORIES.includes(category as string)) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { category: category as string },
        })
      }
    }
  } catch (e) {
    console.error('Failed to parse AI categorization response', e)
  }

  return { processed: uncategorized.length }
}
```

## Budget Tracking and Alerts

```typescript
// lib/budgets.ts
export async function updateBudgetSpent(userId: string, monthYear: string) {
  const budgets = await prisma.budget.findMany({
    where: { userId, monthYear },
  })

  const [year, month] = monthYear.split('-').map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59)

  for (const budget of budgets) {
    const result = await prisma.transaction.aggregate({
      where: {
        account: { userId },
        category: budget.category,
        date: { gte: start, lte: end },
        amount: { lt: 0 }, // expenses only
      },
      _sum: { amount: true },
    })

    const spent = Math.abs(result._sum.amount || 0)
    await prisma.budget.update({ where: { id: budget.id }, data: { spent } })

    // Alert if over 90%
    if (spent / budget.limit >= 0.9) {
      console.log(`⚠️ Budget alert: ${budget.category} at ${Math.round(spent / budget.limit * 100)}%`)
      // TODO: send Resend email alert
    }
  }
}
```

## Monthly Report Generator

```typescript
// lib/reports.ts
export async function generateMonthlyReport(userId: string, monthYear: string) {
  const [year, month] = monthYear.split('-').map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59)

  const transactions = await prisma.transaction.findMany({
    where: { account: { userId }, date: { gte: start, lte: end } },
  })

  const income = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const expenses = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)

  const byCategory = transactions
    .filter(t => t.amount < 0)
    .reduce((acc, t) => {
      const cat = t.category || 'Other'
      acc[cat] = (acc[cat] || 0) + Math.abs(t.amount)
      return acc
    }, {} as Record<string, number>)

  const topMerchants = Object.entries(
    transactions.filter(t => t.merchant).reduce((acc, t) => {
      acc[t.merchant!] = (acc[t.merchant!] || 0) + Math.abs(t.amount)
      return acc
    }, {} as Record<string, number>)
  ).sort(([, a], [, b]) => b - a).slice(0, 5)

  return { income, expenses, savings: income - expenses, byCategory, topMerchants, transactionCount: transactions.length }
}
```

## Key Features Summary

- **Deduplication**: SHA-256 hash prevents double-importing CSV files
- **Hybrid categorization**: user rules + Claude AI fallback
- **Budget alerts**: notify when spending crosses 90% of limit
- **Savings goals**: track multiple goals with deadline projections
- **Monthly PDF reports**: exportable spending breakdown

## Extensions to Consider

- **Plaid integration** for live bank sync
- **Net worth tracker** across all accounts
- **Recurring transaction detection** with AI
- **Investment portfolio** view (stocks, crypto)
- **Bill payment reminders** based on recurring patterns
