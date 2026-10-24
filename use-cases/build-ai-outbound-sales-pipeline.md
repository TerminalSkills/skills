---
title: Build an AI Outbound Sales Pipeline That Books Meetings on Autopilot
slug: build-ai-outbound-sales-pipeline
description: Build a lawful outbound sales system using Clay for lead enrichment, an LLM for drafting personalized first emails that a human reviews, and Resend for opted-in follow-ups, with opt-outs and sender identification built in.
skills: [clay, resend]
category: business
tags: [outbound-sales, lead-generation, cold-email, personalization, automation, b2b]
---

# Build an AI Outbound Sales Pipeline That Books Meetings on Autopilot

Mila is a solo founder selling a developer tool for API monitoring. She knows her ICP: engineering managers at US B2B SaaS companies with 20-100 employees and a public API. She spends 15 hours a week on manual prospecting (finding companies, researching their stack, writing each email) and books about 3 meetings a month. She wants more meetings without becoming a spammer.

The pipeline automates the research and the first draft, keeps a human in the loop for every first email, and makes opt-outs and sender identification part of the code instead of something she has to remember.

## Ground rules before any code

Cold email is lawful in some places and not in others, and some tools forbid it outright. Three facts shape this design:

- **CAN-SPAM (US)** allows unsolicited commercial email, but each message must identify itself as a solicitation, carry a valid physical postal address, offer a working opt-out, and the sender must stop within 10 business days of an opt-out request (15 U.S.C. 7704, https://www.law.cornell.edu/uscode/text/15/7704). Headers and subject lines must not be deceptive.
- **EU, UK and Canada** have stricter or country-specific rules (GDPR needs a lawful basis for any personal data; several countries want prior consent even for B2B email). Clay's own guidance says to check where recipients are and keep opt-out and consent records (https://university.clay.com/docs/direct-marketing-best-practices). This pipeline contacts US recipients only; widen it only after legal advice.
- **Resend forbids cold outreach.** Its Acceptable Use Policy prohibits "unsolicited messages of any kind, including cold outreach, purchased lists, or scraped contact data", and requires opted-in recipients and a bounce rate under 4% and complaint rate under 0.08% (https://resend.com/legal/acceptable-use). So Resend is used here only for mail to people who already said yes; first-touch emails go from Mila's own mailbox.

Never scrape personal addresses. Use work addresses at the company's own domain, keep the provider each address came from, and check a suppression list before every send.

## Step 1: Find and enrich companies in Clay

Clay is a table where each row is a lead and columns enrich it from many data providers. Mila starts from company domains (a saved search or CSV import), then adds columns for headcount, tech stack, recent news, a decision-maker and a verified work email. Clay's data-provider lineup and plans change often, so check https://www.clay.com/pricing for what a plan includes before committing.

To get rows out of Clay, add an **HTTP API** enrichment column that POSTs each qualified row to Mila's endpoint (https://university.clay.com/docs/http-api-integration-overview). Store the endpoint's bearer token in a Clay "HTTP API (Headers)" account instead of typing it into each column. Clay can also receive rows from your own code through a table webhook with an auth token (https://university.clay.com/docs/webhook-integration-guide); webhook sources are capped at 50,000 submissions.

## Step 2: Gate, draft, and attach the legal footer

The code below validates the row Clay posts, refuses anyone outside the allowed countries, personal mailboxes, addresses not on the company's domain, and anything on the suppression list. The LLM only writes the subject and body. The sender identity, opt-out line and postal address are appended by code so a model can never drop them.

```typescript
import { z } from "zod";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { Resend } from "resend";

// ---- 1. What Clay posts to us (HTTP API column) -----------------------------
export const Lead = z.object({
  company: z.string(),
  domain: z.string(),
  employeeCount: z.number().int(),
  country: z.string().length(2),                      // ISO 3166-1 alpha-2
  techStack: z.array(z.string()).default([]),
  recentNews: z.string().nullable().default(null),
  contactName: z.string(),
  contactTitle: z.string(),
  contactEmail: z.string().email(),                   // a work address at the company domain
  emailSource: z.string(),                            // which provider returned it; kept for opt-out and access requests
});
export type Lead = z.infer<typeof Lead>;

// ---- 2. Who we may contact at all -------------------------------------------
// Start with the US only, where CAN-SPAM allows unsolicited B2B email if the rules below are followed.
// EU, UK and Canada have different consent rules per country: get legal advice before adding any.
const ALLOWED_COUNTRIES = new Set(["US"]);
const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me"]);

export function mayContact(lead: Lead, suppressed: Set<string>): boolean {
  const mailDomain = lead.contactEmail.split("@")[1].toLowerCase();
  return (
    lead.employeeCount >= 20 && lead.employeeCount <= 100 &&
    ALLOWED_COUNTRIES.has(lead.country.toUpperCase()) &&
    !FREE_MAIL.has(mailDomain) &&                     // no personal mailboxes
    mailDomain === lead.domain.toLowerCase() &&       // address belongs to the company
    !suppressed.has(lead.contactEmail.toLowerCase()) &&
    !suppressed.has(`@${mailDomain}`)                 // whole-domain opt-outs
  );
}

// ---- 3. Draft with an LLM; the legal footer is code, never model output ------
const Draft = z.object({ subject: z.string().max(60), body: z.string(), hook: z.string() });

export const SENDER = { name: "Mila Ortega", company: "ApiPulse", address: "ApiPulse, 100 Example Street, Suite 4, Austin, TX 78701, USA", mailbox: "mila@apipulse.dev" };

export const footer = (unsubscribeUrl: string) =>
  `\n\n--\n${SENDER.name}, founder of ${SENDER.company}\nThis is a commercial solicitation for ${SENDER.company}'s API monitoring service. ` +
  `If you don't want to hear from me, reply "stop" or use ${unsubscribeUrl} and I won't write again.\n${SENDER.address}`;

// The first email is reviewed and sent by a human, but the footer is still added by code.
export const composeFirstEmail = (d: { subject: string; body: string }, unsubscribeUrl: string) =>
  ({ subject: d.subject, text: d.body + footer(unsubscribeUrl) });

export async function draftFirstEmail(lead: Lead) {
  const { output } = await generateText({
    model: openai("gpt-4o-mini"),
    output: Output.object({ schema: Draft }),
    prompt: `Write a first cold email, 80-110 words, plain and honest, from ${SENDER.name}, founder of ${SENDER.company} (API monitoring).
Use only these facts; do not invent anything else, and do not claim you saw their post or data unless it is listed:
Company: ${lead.company} (${lead.employeeCount} employees). Stack: ${lead.techStack.join(", ") || "unknown"}. News: ${lead.recentNews ?? "none"}.
Recipient: ${lead.contactName}, ${lead.contactTitle}.
The subject must say what the email is about, no tricks or fake "Re:". End with one question. Do not write a signature or an unsubscribe line.`,
  });
  return output;
}

// ---- 4. Resend: only for people who have said yes ----------------------------
const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendMeetingConfirmation(to: string, name: string, when: string, unsubscribeUrl: string) {
  const { data, error } = await resend.emails.send({
    from: `${SENDER.name} <${SENDER.mailbox}>`,
    to: [to],
    subject: `Confirmed: ${when}`,
    text: `Hi ${name}, confirming our call on ${when}. Reply here to reschedule.${footer(unsubscribeUrl)}`,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  if (error) throw new Error(error.message);
  return data!.id;
}
```

Install: `npm install ai @ai-sdk/openai zod resend` (checked with `ai` 7.0, `@ai-sdk/openai` 4.0, `resend` 6.34, `zod` 4.6). `generateObject` is deprecated in current AI SDK releases; `generateText` with `Output.object` is the replacement used above. Replace the sample sender block with your real name, company and postal address, and set `OPENAI_API_KEY` and `RESEND_API_KEY` in the environment.

## Step 3: Review, send, and honour opt-outs

1. Drafts land in a review queue (a Clay column or a CSV). Mila reads each one, deletes anything that invents a fact, and sends it herself from her own mailbox. Clay also has a native Email Sequencer that sends from your connected mailboxes (https://university.clay.com/docs/email-sequencer), which keeps the sender real and the volume human.
2. Any reply that says stop, unsubscribe or "not interested" adds the address to the suppression set within one business day, well inside the 10-business-day legal limit. Opting out of one person from a company can mean the whole domain (`@acme.io`): the gate above checks both.
3. A prospect who replies with interest and books a call gets the Resend confirmation from `sendMeetingConfirmation`, with a `List-Unsubscribe` header and the same footer. Resend documents the one-click header pair used there (https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails); your unsubscribe URL must also accept a `POST` and answer 200 or 202, as RFC 8058 requires.
4. Keep volume low and steady (a few dozen a day from one mailbox), and stop a sequence for a person after two follow-ups without a reply.

## What was verified

The gate, footer and types were compiled with `tsc --noEmit` (strict) and the gate was run with sample leads: a US lead on the company domain passed; a German lead, a Gmail address, a suppressed address and a suppressed domain were each refused. The OpenAI call, the Resend send and the Clay column setup need live accounts and were checked against the vendors' documentation only.

## Real-World Example

Mila loads 200 US company domains into Clay. After enrichment and the gate, about 60 leads remain. She reviews the drafts in two sittings, sends 15 a day from her own mailbox, and keeps a note of every reply. When one prospect writes "please don't email me again", the address goes on the suppression list the same day and no draft is ever generated for that person again. The numbers are hers to measure: reply rate, meetings booked and complaints per hundred sends, so she can see whether the drafts earn their review time.

## Related Skills

- [clay](/skills/clay) - lead enrichment, HTTP API and webhook columns, email sequencer
- [resend](/skills/resend) - sending to opted-in contacts with one-click unsubscribe headers
