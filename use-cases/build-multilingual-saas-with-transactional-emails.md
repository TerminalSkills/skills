---
title: Build a Multilingual SaaS with Transactional Emails
slug: build-multilingual-saas-with-transactional-emails
description: Add full internationalization to a Next.js SaaS app — locale-aware routing, translated UI, formatted numbers and dates, and localized transactional emails that match each user's language.
skills:
  - next-intl
  - react-email
  - resend
  - nextjs
category: development
tags:
  - i18n
  - localization
  - email
  - saas
  - nextjs
---

# Build a Multilingual SaaS with Transactional Emails

Nadia runs an invoicing SaaS with 2,000 users across Europe. The app is English-only, which limits growth — 62% of European SMBs prefer tools in their native language. She's losing deals in Germany, France, and Spain to local competitors with worse features but localized UIs. She wants to add German, French, Spanish, and Ukrainian, with locale-aware number/date formatting and transactional emails in the user's language.

## Step 1 — Set Up Locale Routing

next-intl integrates with Next.js App Router to add locale-based routing. The `[locale]` segment in the directory structure means `/de/dashboard`, `/fr/dashboard`, and `/en/dashboard` all render the same page with different translations.

```typescript
// src/i18n/config.ts — Internationalization configuration.
// Defines supported locales, default locale, and message loading.

export const locales = ["en", "de", "fr", "es", "uk"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

// Human-readable names for the language picker
export const localeNames: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  uk: "Українська",
};
```

```typescript
// src/i18n/request.ts — Server-side message loading.
// next-intl loads messages per-request, so only the current locale's
// translations are included in the response — no wasted bytes.

import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Validate locale, fall back to default
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Europe/Berlin",
    now: new Date(),
  };
});
```

```typescript
// src/middleware.ts — Locale detection and routing.
// Reads the user's Accept-Language header to auto-detect language.
// Stores preference in a cookie for subsequent visits.

import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all routes except static files and API routes
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
```

## Step 2 — Translate the UI

Translation files use ICU message format — the standard for handling plurals, gender, and formatted values across languages.

```json
// messages/en.json — English translations.
// Nested by feature for maintainability.
// ICU syntax for plurals and formatted values.
{
  "common": {
    "appName": "InvoiceFlow",
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "loading": "Loading...",
    "error": "Something went wrong. Please try again."
  },
  "dashboard": {
    "title": "Dashboard",
    "welcome": "Welcome back, {name}",
    "stats": {
      "revenue": "Revenue this month",
      "invoices": "{count, plural, =0 {No invoices} one {# invoice} other {# invoices}} sent",
      "overdue": "{count, plural, =0 {No overdue invoices} one {# overdue invoice} other {# overdue invoices}}"
    }
  },
  "invoice": {
    "create": "Create Invoice",
    "status": "{status, select, draft {Draft} sent {Sent} paid {Paid} overdue {Overdue} other {Unknown}}",
    "dueDate": "Due {date, date, medium}",
    "total": "Total: {amount, number, ::currency/EUR}",
    "itemCount": "{count, plural, one {# item} other {# items}}"
  }
}
```

```json
// messages/de.json — German translations.
// Same structure as English, different content.
// Note: German pluralization rules differ (e.g., formal "Sie" vs informal "du").
{
  "common": {
    "appName": "InvoiceFlow",
    "save": "Speichern",
    "cancel": "Abbrechen",
    "delete": "Löschen",
    "loading": "Wird geladen...",
    "error": "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut."
  },
  "dashboard": {
    "title": "Dashboard",
    "welcome": "Willkommen zurück, {name}",
    "stats": {
      "revenue": "Umsatz diesen Monat",
      "invoices": "{count, plural, =0 {Keine Rechnungen} one {# Rechnung} other {# Rechnungen}} versendet",
      "overdue": "{count, plural, =0 {Keine überfälligen Rechnungen} one {# überfällige Rechnung} other {# überfällige Rechnungen}}"
    }
  },
  "invoice": {
    "create": "Rechnung erstellen",
    "status": "{status, select, draft {Entwurf} sent {Versendet} paid {Bezahlt} overdue {Überfällig} other {Unbekannt}}",
    "dueDate": "Fällig am {date, date, medium}",
    "total": "Gesamt: {amount, number, ::currency/EUR}",
    "itemCount": "{count, plural, one {# Posten} other {# Posten}}"
  }
}
```

```tsx
// src/app/[locale]/dashboard/page.tsx — Localized dashboard.
// Server Component: translations are resolved on the server.
// No translation JSON is sent to the client browser.

import { getTranslations, getFormatter } from "next-intl/server";

interface DashboardStats {
  monthlyRevenue: number;
  invoicesSent: number;
  overdueCount: number;
}

async function getStats(userId: string): Promise<DashboardStats> {
  // ... fetch from database
  return { monthlyRevenue: 12450.80, invoicesSent: 47, overdueCount: 3 };
}

export async function generateMetadata({ params }: { params: { locale: string } }) {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const format = await getFormatter();
  const stats = await getStats("user-123");

  return (
    <div className="space-y-8 p-8">
      <h1 className="text-2xl font-bold">
        {t("welcome", { name: "Nadia" })}
      </h1>

      <div className="grid grid-cols-3 gap-6">
        {/* Revenue — formatted with locale-aware currency */}
        <div className="rounded-lg border p-6">
          <p className="text-sm text-gray-500">{t("stats.revenue")}</p>
          <p className="mt-1 text-3xl font-bold">
            {format.number(stats.monthlyRevenue, {
              style: "currency",
              currency: "EUR",
            })}
            {/* en: €12,450.80 | de: 12.450,80 € | fr: 12 450,80 € */}
          </p>
        </div>

        {/* Invoices — pluralized correctly per language */}
        <div className="rounded-lg border p-6">
          <p className="text-3xl font-bold">
            {t("stats.invoices", { count: stats.invoicesSent })}
          </p>
        </div>

        {/* Overdue */}
        <div className="rounded-lg border p-6">
          <p className="text-3xl font-bold text-red-600">
            {t("stats.overdue", { count: stats.overdueCount })}
          </p>
        </div>
      </div>
    </div>
  );
}
```

## Step 3 — Build Localized Transactional Emails

React Email templates accept the user's locale as a prop and render fully localized content — including currency formatting, date formatting, and translated copy.

```tsx
// emails/invoice-sent.tsx — Invoice notification email.
// Accepts locale prop to render in the recipient's language.
// React Email components compile to cross-client HTML.

import {
  Html, Head, Body, Container, Section, Text, Button,
  Heading, Hr, Preview, Row, Column, Img,
} from "@react-email/components";
import { Tailwind } from "@react-email/tailwind";

// Inline translations for emails (separate from app translations).
// Email copy is often different from UI copy — more personal, more context.
const translations = {
  en: {
    preview: (name: string) => `Invoice #${name} has been sent`,
    greeting: (name: string) => `Hi ${name},`,
    body: "Your invoice has been sent to the client. Here are the details:",
    invoiceNumber: "Invoice Number",
    client: "Client",
    amount: "Amount",
    dueDate: "Due Date",
    viewInvoice: "View Invoice",
    footer: "Questions? Reply to this email — we're here to help.",
  },
  de: {
    preview: (num: string) => `Rechnung #${num} wurde versendet`,
    greeting: (name: string) => `Hallo ${name},`,
    body: "Ihre Rechnung wurde an den Kunden gesendet. Hier sind die Details:",
    invoiceNumber: "Rechnungsnummer",
    client: "Kunde",
    amount: "Betrag",
    dueDate: "Fälligkeitsdatum",
    viewInvoice: "Rechnung ansehen",
    footer: "Fragen? Antworten Sie auf diese E-Mail — wir helfen gerne.",
  },
  fr: {
    preview: (num: string) => `Facture #${num} envoyée`,
    greeting: (name: string) => `Bonjour ${name},`,
    body: "Votre facture a été envoyée au client. Voici les détails :",
    invoiceNumber: "Numéro de facture",
    client: "Client",
    amount: "Montant",
    dueDate: "Date d'échéance",
    viewInvoice: "Voir la facture",
    footer: "Des questions ? Répondez à cet e-mail — nous sommes là pour vous aider.",
  },
} as const;

type Locale = keyof typeof translations;

interface InvoiceSentEmailProps {
  locale: Locale;
  userName: string;
  invoiceNumber: string;
  clientName: string;
  amount: number;
  currency: string;
  dueDate: Date;
  invoiceUrl: string;
}

export default function InvoiceSentEmail({
  locale = "en",
  userName,
  invoiceNumber,
  clientName,
  amount,
  currency,
  dueDate,
  invoiceUrl,
}: InvoiceSentEmailProps) {
  const t = translations[locale] || translations.en;

  // Format currency and date according to locale
  const formattedAmount = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount);

  const formattedDate = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
  }).format(dueDate);

  return (
    <Html lang={locale}>
      <Head />
      <Preview>{t.preview(invoiceNumber)}</Preview>
      <Tailwind>
        <Body className="bg-gray-50 font-sans">
          <Container className="mx-auto max-w-[600px] p-4">
            {/* Logo */}
            <Section className="py-6 text-center">
              <Img
                src="https://invoiceflow.app/logo.png"
                alt="InvoiceFlow"
                width={140}
                className="mx-auto"
              />
            </Section>

            {/* Main content */}
            <Section className="rounded-lg bg-white p-8 shadow-sm">
              <Heading className="text-xl font-bold text-gray-900">
                {t.greeting(userName)}
              </Heading>

              <Text className="text-gray-600">{t.body}</Text>

              {/* Invoice details */}
              <Section className="my-6 rounded-lg bg-gray-50 p-6">
                <Row>
                  <Column className="w-1/2">
                    <Text className="text-sm text-gray-500">{t.invoiceNumber}</Text>
                    <Text className="font-semibold">{invoiceNumber}</Text>
                  </Column>
                  <Column className="w-1/2">
                    <Text className="text-sm text-gray-500">{t.client}</Text>
                    <Text className="font-semibold">{clientName}</Text>
                  </Column>
                </Row>
                <Hr className="my-4" />
                <Row>
                  <Column className="w-1/2">
                    <Text className="text-sm text-gray-500">{t.amount}</Text>
                    <Text className="text-2xl font-bold text-gray-900">
                      {formattedAmount}
                    </Text>
                  </Column>
                  <Column className="w-1/2">
                    <Text className="text-sm text-gray-500">{t.dueDate}</Text>
                    <Text className="font-semibold">{formattedDate}</Text>
                  </Column>
                </Row>
              </Section>

              {/* CTA Button */}
              <Section className="text-center">
                <Button
                  href={invoiceUrl}
                  className="rounded-lg bg-blue-600 px-8 py-3 text-white"
                >
                  {t.viewInvoice}
                </Button>
              </Section>
            </Section>

            {/* Footer */}
            <Section className="py-6 text-center">
              <Text className="text-sm text-gray-400">{t.footer}</Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
```

## Step 4 — Send Localized Emails

```typescript
// src/lib/email.ts — Email sending with locale awareness.
// Renders React Email templates with the user's locale
// and sends via Resend (or any provider that accepts HTML).

import { Resend } from "resend";
import { render } from "@react-email/render";
import InvoiceSentEmail from "../../emails/invoice-sent";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendInvoiceEmailParams {
  to: string;
  locale: string;
  userName: string;
  invoiceNumber: string;
  clientName: string;
  amount: number;
  currency: string;
  dueDate: Date;
  invoiceUrl: string;
}

export async function sendInvoiceEmail(params: SendInvoiceEmailParams) {
  const { to, locale, ...props } = params;

  // Localized subject lines
  const subjects: Record<string, string> = {
    en: `Invoice #${props.invoiceNumber} sent to ${props.clientName}`,
    de: `Rechnung #${props.invoiceNumber} an ${props.clientName} versendet`,
    fr: `Facture #${props.invoiceNumber} envoyée à ${props.clientName}`,
    es: `Factura #${props.invoiceNumber} enviada a ${props.clientName}`,
    uk: `Рахунок #${props.invoiceNumber} надіслано ${props.clientName}`,
  };

  const element = InvoiceSentEmail({ locale: locale as any, ...props });

  // Render both HTML and plain text versions
  const html = await render(element);
  const text = await render(element, { plainText: true });

  const { data, error } = await resend.emails.send({
    from: "InvoiceFlow <invoices@invoiceflow.app>",
    to,
    subject: subjects[locale] || subjects.en,
    html,
    text,                // Plain text fallback
    headers: {
      "X-Entity-Ref-ID": props.invoiceNumber,  // Prevent Gmail threading issues
    },
  });

  if (error) throw new Error(`Email failed: ${error.message}`);
  return data;
}
```

## Results

Nadia launched five languages over two weeks. The localization rollout had immediate measurable impact:

- **German market conversion: +34%** — landing page and product in German. Free trial signups from DACH region increased from 45/month to 142/month within 6 weeks.
- **French market conversion: +28%** — similar pattern. French SMBs who previously bounced on the English pricing page now convert at 4.7% (vs 1.8% before).
- **Email open rates: +12%** — localized subject lines and preview text. German users open rate went from 38% to 52%. People trust emails in their native language.
- **Support tickets: -18%** — users understand the UI without guessing. Most "how do I...?" tickets came from non-English users navigating an English interface.
- **Zero client-side translation bundle** — next-intl with Server Components means translation JSON stays on the server. No JavaScript payload increase for the end user. Page size unchanged.
- **Currency/date formatting correct everywhere** — `€12.450,80` in German, `12 450,80 €` in French, `€12,450.80` in English. `Intl.NumberFormat` handles the nuances that developers get wrong manually.
- **Translation workflow**: messages exported to Crowdin, professional translators update JSON files, PRs auto-created. Time from English copy to 4 languages: 48 hours.
