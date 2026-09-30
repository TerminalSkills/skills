---
title: Automate Browser Interactions with Playwright MCP
slug: automate-browser-interactions-with-playwright-mcp
description: Let an AI agent click through a web app before each release, catch console and API errors, and turn passing flows into Playwright tests, for QA engineers.
skills:
  - playwright-mcp
  - playwright-testing
category: automation
tags:
  - playwright
  - mcp
  - browser-automation
  - release-qa
  - smoke-testing
---

## The Problem

Maya Okafor is the only QA engineer at Brightmoor, a 14-person company that builds a scheduling app for physiotherapy clinics. Before each of the two weekly releases she clicks through nine flows on staging: log in, book an appointment, reschedule it, cancel it, send a reminder, and so on. One pass takes about 2.5 hours, so five hours of every week go to repeating the same clicks.

The scripted end-to-end suite covers only three of the nine flows. The booking screens change most sprints, and nobody has time to write tests for screens that will move again. Meanwhile manual checks miss what the eye cannot see: last month a release shipped with a failing reminder request on the booking page. The page looked fine, the error was only in the console, and clinics noticed two days later when patients stopped getting reminders.

Maya needs the click-through done by something that reads the page the way a user does, looks at the console and network on every screen, and leaves behind tests for the flows that passed.

## The Solution

Use **playwright-mcp** to give the agent a real browser. It works from accessibility snapshots, so it finds "the Save button" by role and name rather than by a CSS class that changes next sprint. Use **playwright-testing** to turn the code that the server generates for each passing step into a spec file that runs in CI.

```bash
npx terminal-skills install playwright-mcp playwright-testing
```

## Step-by-Step Walkthrough

### 1. Add the browser server

```text
Add the Playwright MCP server to this project. I need the assertion tools and saved login state, and the staging password must never appear in this chat.
```

Maya exports `STAGING_PASSWORD` in her own shell (the value comes from the team password manager) and writes it to a file that is already listed in `.gitignore`. The agent registers the server:

```bash
printf 'STAGING_PASSWORD=%s\n' "$STAGING_PASSWORD" > .secrets
claude mcp add playwright -- npx @playwright/mcp@latest --caps=testing,storage --secrets ./.secrets
```

### 2. Log in once and save the session

```text
Open staging, log in as the front-desk test user, and save the session so later runs skip the login form.
```

The agent types the name of the secret; the server substitutes the value in the page and masks it in every response.

```text
→ browser_navigate { url: "https://staging.brightmoor.internal/login" }
  - textbox "Email" [ref=e4]
  - textbox "Password" [ref=e6]
  - button "Sign in" [ref=e8]
→ browser_fill_form { fields: [
    { name: "Email",    target: "e4", type: "textbox", value: "frontdesk.qa@brightmoor.internal" },
    { name: "Password", target: "e6", type: "textbox", value: "STAGING_PASSWORD" } ] }
→ browser_click { target: "e8" }
  - heading "Calendar" [level=1] [ref=e2]
→ browser_storage_state { filename: "auth-state.json" }
  - [Storage state](auth-state.json)
```

### 3. Walk a flow and assert the result

```text
Book a 45-minute appointment for patient Jonas Weber with Dr. Imani Njoroge next Tuesday at 10:30. Then verify it shows up in the day view.
```

```text
→ browser_click { target: "e15" }                      // button "New appointment"
  - dialog "New appointment" [ref=e30]:
    - combobox "Patient" [ref=e32]
    - combobox "Therapist" [ref=e34]
    - textbox "Date" [ref=e36]
    - textbox "Start time" [ref=e38]
    - combobox "Duration" [ref=e40]
    - button "Save" [ref=e44]
→ browser_fill_form { fields: [
    { name: "Patient",    target: "e32", type: "combobox", value: "Jonas Weber" },
    { name: "Therapist",  target: "e34", type: "combobox", value: "Dr. Imani Njoroge" },
    { name: "Date",       target: "e36", type: "textbox",  value: "2026-10-06" },
    { name: "Start time", target: "e38", type: "textbox",  value: "10:30" },
    { name: "Duration",   target: "e40", type: "combobox", value: "45 minutes" } ] }
→ browser_click { target: "e44" }
→ browser_verify_text_visible { text: "Jonas Weber, 10:30–11:15" }
  Done
```

Every response also contains the Playwright code for the action, which step 5 reuses.

### 4. Check what the page does not show

```text
Any errors in the console or failed API calls on this screen?
```

```text
→ browser_console_messages { level: "error" }
  Total messages: 7 (Errors: 1, Warnings: 2)
  Returning 1 messages for level "error"
  [ERROR] Failed to load resource: the server responded with a status of 500 (Internal Server Error)
→ browser_network_requests { filter: "/api/reminders" }
  1. [POST] https://staging.brightmoor.internal/api/reminders/preview => [500] Internal Server Error
→ browser_network_request { index: 1, part: "response-body" }
  {"error":"template_not_found","template":"sms_booking_v3"}
```

The appointment was saved and the screen looked correct, but the reminder preview failed. The agent reports the request, the status and the response body, and takes a screenshot for the ticket:

```text
→ browser_take_screenshot { filename: "qa/booking-reminder-500.png" }
```

### 5. Turn the passing flow into a test

```text
The booking flow itself passed. Write it as a Playwright test that reuses the saved login, and run it.
```

```typescript
// tests/e2e/booking.spec.ts
import { test, expect } from '@playwright/test';

test.use({ storageState: 'auth-state.json' });

test('front desk books a 45-minute appointment', async ({ page }) => {
  await page.goto('https://staging.brightmoor.internal/calendar');
  await page.getByRole('button', { name: 'New appointment' }).click();
  await page.getByLabel('Patient').selectOption({ label: 'Jonas Weber' });
  await page.getByLabel('Therapist').selectOption({ label: 'Dr. Imani Njoroge' });
  await page.getByLabel('Date').fill('2026-10-06');
  await page.getByLabel('Start time').fill('10:30');
  await page.getByLabel('Duration').selectOption({ label: '45 minutes' });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Jonas Weber, 10:30–11:15')).toBeVisible();
});
```

```bash
npx playwright test tests/e2e/booking.spec.ts --project=chromium
```

```text
Running 1 test using 1 worker
  ✓  1 [chromium] › tests/e2e/booking.spec.ts:6:5 › front desk books a 45-minute appointment (3.4s)
  1 passed (4.9s)
```

## Real-World Example

On the first Friday Maya gives the agent her checklist of nine flows and goes through steps 2 to 4 for each. The run takes 25 minutes of agent time; she spends another 20 minutes reading the report and the screenshots. It finds two problems that the manual pass had missed the week before: the failing reminder preview, and a console error on the cancellation screen caused by a missing translation key. Both go to developers with the request, status code and response body attached, and both are fixed before the release.

Over the next three weeks the agent writes spec files for six more flows, so the scripted suite covers all nine. CI runs them in four minutes on every pull request. Maya's release check drops from five hours a week to about 90 minutes, and she uses the agent's browser sessions for what scripts cannot do: exploring the screens that changed in the current sprint.

## Related Skills

- [playwright-mcp](/skills/playwright-mcp) — gives the agent a browser with snapshots, assertions, console and network inspection, and saved login state
- [playwright-testing](/skills/playwright-testing) — turns the flows that passed into spec files that run in CI
