---
title: "Build an Email Deliverability Monitoring Tool"
description: "Create a comprehensive email deliverability platform with SPF/DKIM/DMARC validation, blacklist monitoring across 50+ providers, inbox placement testing, and spam score analysis."
skills: [resend, prisma]
difficulty: intermediate
time_estimate: "10 hours"
tags: [email, deliverability, dns, blacklist, spam, monitoring]
---

# Build an Email Deliverability Monitoring Tool

## The Problem

Your email campaigns are getting 15% open rates when they should be hitting 35%. Half the problem is deliverability — your domain might be on a blacklist, your DMARC policy might be misconfigured, or your content is triggering spam filters. Tools like MXToolbox and GlockApps charge $100-500/month. The DNS checks are just API calls. The blacklist checks are public. You can build this.

## Who This Is For

**Persona:** An email marketing manager sending 500,000 emails/month across 10 client domains. You live in fear of a domain getting blacklisted overnight and not knowing until open rates crash 3 days later. You want continuous monitoring, instant alerts, and a clear dashboard to show clients.

## What You'll Build

- SPF, DKIM, and DMARC record validation with fix recommendations
- Blacklist monitoring across 50+ providers (Spamhaus, Barracuda, SORBS, etc.)
- Inbox placement testing (send to seed addresses, report inbox vs spam)
- Spam score analysis (content scoring via SpamAssassin-compatible rules)
- Instant alert emails when domain gets blacklisted
- Daily health score per domain

---

## Architecture

```
Dashboard (Next.js)
├── /domains/[id]        — Domain health overview
├── /domains/[id]/tests  — Inbox placement test results
└── /api/check/[domain]  — On-demand check endpoint

Cron Workers (every 6 hours)
├── DNS Record Validator   — SPF, DKIM, DMARC
├── Blacklist Checker      — 50+ DNSBL queries
└── Alert Engine           — Compare vs last check, send alerts

Prisma: domains, check results, blacklist events
Resend: alert and report emails
```

---

## Step 1: Data Schema

```prisma
// schema.prisma
model Domain {
  id            String   @id @default(cuid())
  domain        String   @unique
  email         String   // alert recipient
  dkimSelector  String?  // e.g. "google", "mail", "s1"
  healthScore   Int      @default(100)
  checks        DomainCheck[]
  blacklistEvents BlacklistEvent[]
  createdAt     DateTime @default(now())
}

model DomainCheck {
  id          String   @id @default(cuid())
  domainId    String
  domain      Domain   @relation(fields: [domainId], references: [id], onDelete: Cascade)
  checkedAt   DateTime @default(now())
  spfRecord   String?
  spfValid    Boolean  @default(false)
  dkimRecord  String?
  dkimValid   Boolean  @default(false)
  dmarcRecord String?
  dmarcPolicy String?  // none | quarantine | reject
  dmarcValid  Boolean  @default(false)
  blacklists  Json     @default("{}") // { "spamhaus.org": false, "barracuda.com": true }
  blacklistCount Int   @default(0)
  healthScore Int      @default(100)
}

model BlacklistEvent {
  id         String   @id @default(cuid())
  domainId   String
  domain     Domain   @relation(fields: [domainId], references: [id], onDelete: Cascade)
  provider   String   // e.g. "Spamhaus ZEN"
  listed     Boolean  // true = new listing, false = delisted
  detectedAt DateTime @default(now())
  alertSent  Boolean  @default(false)
}
```

---

## Step 2: DNS Record Validator

```typescript
// lib/dnsChecker.ts
import dns from 'dns/promises'

export async function checkSPF(domain: string): Promise<{ record: string | null; valid: boolean; issues: string[] }> {
  const issues: string[] = []
  try {
    const records = await dns.resolveTxt(domain)
    const spf = records.flat().find(r => r.startsWith('v=spf1'))

    if (!spf) return { record: null, valid: false, issues: ['No SPF record found'] }

    if (!spf.includes('-all') && !spf.includes('~all')) {
      issues.push('SPF policy is missing -all or ~all. Add "~all" at minimum.')
    }
    if (spf.includes('+all')) {
      issues.push('CRITICAL: SPF policy uses +all — allows any server to send!')
    }
    if ((spf.match(/include:/g) || []).length > 10) {
      issues.push('Too many includes (>10) — may exceed DNS lookup limit')
    }

    return { record: spf, valid: issues.length === 0, issues }
  } catch {
    return { record: null, valid: false, issues: ['DNS lookup failed'] }
  }
}

export async function checkDMARC(domain: string): Promise<{ record: string | null; policy: string | null; valid: boolean; issues: string[] }> {
  const issues: string[] = []
  try {
    const records = await dns.resolveTxt(`_dmarc.${domain}`)
    const dmarc = records.flat().find(r => r.startsWith('v=DMARC1'))

    if (!dmarc) return { record: null, policy: null, valid: false, issues: ['No DMARC record found'] }

    const policyMatch = dmarc.match(/p=(\w+)/)
    const policy = policyMatch?.[1] ?? 'none'

    if (policy === 'none') {
      issues.push('DMARC policy is "none" — no enforcement. Upgrade to "quarantine" or "reject".')
    }
    if (!dmarc.includes('rua=')) {
      issues.push('No aggregate report address (rua) — you won\'t receive DMARC reports.')
    }

    return { record: dmarc, policy, valid: policy !== 'none' && issues.length === 0, issues }
  } catch {
    return { record: null, policy: null, valid: false, issues: ['DNS lookup failed'] }
  }
}

export async function checkDKIM(domain: string, selector: string): Promise<{ record: string | null; valid: boolean }> {
  try {
    const records = await dns.resolveTxt(`${selector}._domainkey.${domain}`)
    const dkim = records.flat().find(r => r.includes('v=DKIM1'))
    return { record: dkim ?? null, valid: !!dkim }
  } catch {
    return { record: null, valid: false }
  }
}
```

---

## Step 3: Blacklist Checker

```typescript
// lib/blacklistChecker.ts
import dns from 'dns/promises'

const BLACKLISTS = [
  'zen.spamhaus.org',
  'b.barracudacentral.org',
  'bl.spamcop.net',
  'dnsbl.sorbs.net',
  'spam.dnsbl.sorbs.net',
  'dul.dnsbl.sorbs.net',
  'combined.njabl.org',
  'psbl.surriel.com',
  'dnsbl-1.uceprotect.net',
  'dnsbl-2.uceprotect.net',
  'truncate.gbudb.net',
  'bl.mailspike.net',
  'hostkarma.junkemailfilter.com',
  // ... add all 50+
]

export async function checkBlacklists(ip: string): Promise<Record<string, boolean>> {
  const reversedIp = ip.split('.').reverse().join('.')
  const results: Record<string, boolean> = {}

  await Promise.allSettled(
    BLACKLISTS.map(async (bl) => {
      try {
        await dns.resolve4(`${reversedIp}.${bl}`)
        results[bl] = true // Listed (bad)
      } catch {
        results[bl] = false // Not listed (good)
      }
    })
  )

  return results
}

export async function getDomainIPs(domain: string): Promise<string[]> {
  try {
    const mx = await dns.resolveMx(domain)
    const ips = await Promise.all(
      mx.slice(0, 3).map(r => dns.resolve4(r.exchange).catch(() => [] as string[]))
    )
    return ips.flat()
  } catch {
    return []
  }
}
```

---

## Step 4: Alert Engine

```typescript
// workers/alertEngine.ts
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { checkBlacklists, getDomainIPs } from '@/lib/blacklistChecker'
import { checkSPF, checkDMARC, checkDKIM } from '@/lib/dnsChecker'

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function runDomainCheck(domainId: string) {
  const domain = await prisma.domain.findUniqueOrThrow({ where: { id: domainId } })

  const [spf, dmarc, dkim] = await Promise.all([
    checkSPF(domain.domain),
    checkDMARC(domain.domain),
    domain.dkimSelector ? checkDKIM(domain.domain, domain.dkimSelector) : Promise.resolve({ record: null, valid: false })
  ])

  const ips = await getDomainIPs(domain.domain)
  const allBlacklists: Record<string, boolean> = {}

  for (const ip of ips) {
    const results = await checkBlacklists(ip)
    Object.assign(allBlacklists, results)
  }

  const blacklistCount = Object.values(allBlacklists).filter(v => v).length

  // Calculate health score
  let healthScore = 100
  if (!spf.valid) healthScore -= 20
  if (!dmarc.valid) healthScore -= 25
  if (!dkim.valid) healthScore -= 15
  healthScore -= Math.min(blacklistCount * 10, 40)

  const check = await prisma.domainCheck.create({
    data: {
      domainId,
      spfRecord: spf.record,
      spfValid: spf.valid,
      dkimRecord: dkim.record,
      dkimValid: dkim.valid,
      dmarcRecord: dmarc.record,
      dmarcPolicy: dmarc.policy,
      dmarcValid: dmarc.valid,
      blacklists: allBlacklists,
      blacklistCount,
      healthScore
    }
  })

  // Detect new blacklist listings
  await detectAndAlertNewListings(domain, allBlacklists)

  return check
}

async function detectAndAlertNewListings(domain: any, currentBlacklists: Record<string, boolean>) {
  const listed = Object.entries(currentBlacklists)
    .filter(([, isListed]) => isListed)
    .map(([provider]) => provider)

  if (listed.length === 0) return

  // Check if this is new (not already alerted)
  const existingEvents = await prisma.blacklistEvent.findMany({
    where: { domainId: domain.id, listed: true, alertSent: false }
  })
  const alreadyKnown = new Set(existingEvents.map(e => e.provider))

  const newListings = listed.filter(p => !alreadyKnown.has(p))

  for (const provider of newListings) {
    await prisma.blacklistEvent.create({
      data: { domainId: domain.id, provider, listed: true }
    })
  }

  if (newListings.length > 0) {
    await sendBlacklistAlert(domain, newListings)
    await prisma.blacklistEvent.updateMany({
      where: { domainId: domain.id, provider: { in: newListings }, alertSent: false },
      data: { alertSent: true }
    })
  }
}

async function sendBlacklistAlert(domain: any, newListings: string[]) {
  await resend.emails.send({
    from: 'alerts@yourdeliverability.com',
    to: domain.email,
    subject: `🚨 ${domain.domain} is blacklisted on ${newListings.length} provider(s)`,
    html: `
      <h2>Blacklist Alert for ${domain.domain}</h2>
      <p>Your domain was found on the following blacklists:</p>
      <ul>${newListings.map(p => `<li><strong>${p}</strong></li>`).join('')}</ul>
      <p>Take action immediately to request delisting from each provider.</p>
      <a href="https://yourdeliverability.com/domains/${domain.id}">View Full Report</a>
    `
  })
}
```

---

## Health Score Breakdown

| Issue | Score Impact |
|-------|-------------|
| No SPF record | -20 |
| SPF +all policy | -30 |
| No DMARC record | -25 |
| DMARC policy=none | -15 |
| No DKIM | -15 |
| Each blacklist listing | -10 |

---

## Next Steps

1. Add inbox placement testing via seed email addresses
2. Build a SpamAssassin wrapper for content scoring
3. Create a weekly PDF report for each domain
4. Add MX record health and TLS/STARTTLS checks
5. Implement delisting request automation for major providers
