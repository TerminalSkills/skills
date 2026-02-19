---
name: react-email
description: >-
  Assists with building responsive, cross-client email templates using React Email components.
  Use when creating transactional emails (welcome, receipts, password reset) that render
  correctly in Gmail, Outlook, Apple Mail, and mobile clients. Trigger words: react email,
  email template, transactional email, email components, email rendering.
license: Apache-2.0
compatibility: "Requires React 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: ["react-email", "email", "transactional", "templates", "rendering"]
---

# React Email

## Overview

React Email is a library for building responsive, cross-client email templates using React components. It provides pre-built components (Container, Section, Button, Text, Img) that compile to inline-styled, table-based HTML compatible with Gmail, Outlook, and mobile clients, with a local dev server for previewing templates and integration with any email sending service.

## Instructions

- When building templates, use React Email components (`<Html>`, `<Container>`, `<Section>`, `<Text>`, `<Button>`, `<Img>`) with props for personalization, keeping the container max-width at 600px for email client compatibility.
- When styling, use the `<Tailwind>` wrapper for utility classes that compile to inline styles, or use React `style` props directly since email clients strip `<style>` tags.
- When rendering, use `render(element)` to produce HTML strings and `render(element, { plainText: true })` for plain text versions, compatible with Resend, SendGrid, Nodemailer, or any email service.
- When previewing, use `email dev` for a local preview server with hot reload and test email sending.
- When adding inbox preview text, include `<Preview>` on every email to control the 40-90 character preview shown in inbox listings.
- When handling dynamic content, pass data as typed props to email components for type-safe personalization (name, order details, links).

## Examples

### Example 1: Build a welcome email with CTA button

**User request:** "Create a welcome email template for new user signups"

**Actions:**
1. Create `emails/welcome.tsx` with `<Html>`, `<Head>`, `<Preview>`, `<Body>`, and `<Container>`
2. Add a logo with `<Img>`, personalized greeting with `<Text>`, and onboarding CTA with `<Button>`
3. Wrap with `<Tailwind>` for responsive styling and dark mode support
4. Render with `render(<WelcomeEmail name={user.name} />)` and send via Resend

**Output:** A responsive welcome email with personalized content that renders correctly across all major email clients.

### Example 2: Build a receipt email with order details

**User request:** "Create an order receipt email with line items and totals"

**Actions:**
1. Define a typed props interface for order data (items, prices, shipping, total)
2. Use `<Section>` for header, order summary, and footer sections
3. Build line items table with `<Row>` and `<Column>` for responsive grid layout
4. Add formatted prices and order number, with a "View Order" `<Button>` linking to the dashboard

**Output:** A receipt email with dynamic line items, formatted prices, and responsive layout for mobile.

## Guidelines

- Use `<Preview>` on every email to control inbox preview text (40-90 characters).
- Use the `<Tailwind>` wrapper for styling since utilities compile to inline styles that email clients understand.
- Always include a plain text version with `render(template, { plainText: true })` since spam filters penalize HTML-only emails.
- Test in Litmus or Email on Acid before deploying since Outlook renders differently from other clients.
- Keep emails under 102KB of HTML since Gmail clips emails above this threshold.
- Use `<Container maxWidth={600}>` since 600px is the safe width for all email clients.
