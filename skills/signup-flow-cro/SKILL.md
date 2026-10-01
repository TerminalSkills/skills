---
name: signup-flow-cro
description: >-
  Audits and improves an account-creation flow so that more of the people who start signing up
  finish: the form fields, markup, sign-in methods, password rules, email verification, error
  handling, and the measurement that proves a change worked. Use when a user asks to "improve
  signup conversion", "reduce registration drop-off", "review our sign-up form", "too many people
  abandon account creation", "should we add Google sign-in", "fix email verification drop-off", or
  wants a signup funnel instrumented or A/B tested. Works from the code of the form and whatever
  funnel numbers exist.
license: Apache-2.0
compatibility: "Any web sign-up flow whose front-end code can be read or edited. Sample-size helper needs Python 3.8+. Analytics examples use GA4 event names."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["signup", "conversion-optimization", "forms", "onboarding", "authentication"]
---

# Signup Flow CRO

## Overview

A signup flow is everything between the click on "Sign up" and the first screen of the product: the form, the choice of sign-in method, verification, and any questions asked on the way. People leave it for a small number of reasons: it asks for more than they are ready to give, the form fights their browser or password manager, an error wipes their input or does not say what to fix, or a verification step sends them away and they never return.

This skill works from evidence. It maps the flow from the code, measures each step, removes or postpones what is not needed, corrects the markup so autofill and assistive technology work, and specifies how the change will be judged. It ends at the first product screen; activation after that is a different job.

## Instructions

### 1. Map the flow from the code

Locate and read: the signup route and form component, the client and server validation rules, the auth provider or library configuration, the email or SMS verification handler, and the redirect after success. Write the flow as numbered steps with, for each step, the fields, which are required, and what a user must do outside the page (open an email, switch app).

Ask the user for what the code cannot show: step-by-step numbers from analytics, the device split, which collected fields are used in the first week and by whom, and any legal or security constraint (age checks, business customers only, mandatory second factor).

### 2. Instrument before changing anything

If step-level numbers do not exist, add events first and collect a baseline. A minimal set:

| Event | When | Parameters |
|---|---|---|
| `signup_view` | The form is rendered | `variant` |
| `signup_start` | First interaction with any field or sign-in button | `method` |
| `signup_error` | A validation or server error is shown | `field`, `reason`, `method` |
| `sign_up` | The account exists (GA4's recommended event name) | `method` |
| `signup_verified` | Email or phone confirmed | `method`, `minutes_to_verify` |

```js
// fire once, on the user's first focus or click inside the form
gtag("event", "signup_start", { method: "email" });
// fire from the success handler, never on button click
gtag("event", "sign_up", { method: "google" });
```

Report three rates, split by device and by method: start rate (`signup_start` / `signup_view`), completion rate (`sign_up` / `signup_start`), verified rate (`signup_verified` / `sign_up`). Never put an email address or other personal data in an event parameter.

### 3. Decide every field's fate

Go through the fields one by one and assign exactly one outcome:

| Outcome | Test | Typical cases |
|---|---|---|
| Keep | The account cannot be created or used without it | Email or phone, a credential, legally required consent |
| Infer | It can be derived without asking | Country from locale, company from email domain, name from the identity provider |
| Postpone | It is useful, but only after the user has seen the product | Role, team size, use case, phone number, avatar |
| Drop | Nobody can name the report or feature that uses it | Second address line, "how did you hear about us" when attribution already exists |

Postponed questions move to the first product screens, where they can be skipped. If sales insists on a qualifying field, keep one, make it a choice rather than free text, and put it after the credential fields.

### 4. Correct the markup

The reference below is the target shape for an email-and-password form. Adapt names to the project's components but keep the attributes.

```html
<form id="signup" method="post" action="/signup" novalidate>
  <label for="email">Work email</label>
  <input id="email" name="email" type="email" autocomplete="email"
         spellcheck="false" required aria-describedby="email-error">
  <p id="email-error" role="alert" hidden></p>

  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="new-password"
         minlength="15" maxlength="128" required aria-describedby="password-hint password-error">
  <button type="button" id="toggle-password" aria-controls="password" aria-pressed="false">Show password</button>
  <p id="password-hint">At least 15 characters. A phrase of several words works well.</p>
  <p id="password-error" role="alert" hidden></p>

  <button type="submit">Create account</button>
  <p>By creating an account you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>
</form>
```

Checks that apply to any stack:

- Every input has a visible `label`; placeholder text is not a label and disappears on typing.
- `autocomplete` tokens are exact: `email`, `username`, `new-password` on signup (`current-password` only on sign-in), `name` or `given-name` and `family-name`, `organization`, `tel`, `one-time-code` for emailed or texted codes.
- `type="email"` and `type="tel"` bring up the right mobile keyboard; a numeric code field uses `type="text"` with `inputmode="numeric"`, not `type="number"`.
- No second "confirm email" or "confirm password" box; a show-password toggle does that job without doubling the typing.
- Nothing blocks paste, autofill or a password manager's generated password.
- Text in inputs is at least 16 px (smaller text makes iOS Safari zoom the page on focus), targets are at least 24 by 24 CSS pixels with a full-width submit button on small screens, and the layout is a single column.
- The browser's own email check accepts addresses without a dot in the domain, and constraint attributes can be bypassed, so the server validates everything again.

### 5. Choose sign-in methods and password rules

- Offer the identity providers the audience already uses: Google for most products, Microsoft for business software, Apple for consumer apps on Apple devices, GitHub for developer tools. Two or three buttons above the email form; more than that reads as clutter. Each provider gets its own `method` value so its completion rate is visible.
- Email link or emailed code instead of a password removes a field but adds a trip to the inbox. Use it when the audience signs in rarely; measure verified rate before and after.
- Offer passkey creation once the account exists rather than as an extra step in the form.
- Password policy follows NIST SP 800-63B-4: a length minimum (15 characters when the password is the only factor, 8 when a second factor is required), at least 64 characters allowed, no composition rules such as "one uppercase and one symbol", a check against a list of breached and common passwords, no forced periodic change. State the single rule under the field before the user types.

### 6. Handle errors without losing work

- Validate a field when the user leaves it, not on every keystroke, and re-validate on input once an error is showing.
- The message says what to do ("Enter an email address with an @"), sits next to the field, is linked with `aria-describedby`, and sets `aria-invalid="true"`.
- A failed submit keeps every value, including the password, and moves focus to the first field with an error.
- "Email already registered" is the most common server error on a signup form. Offer the way forward in the message: a sign-in link and a password reset link. Where revealing that an account exists is a risk, show the same neutral confirmation for new and existing addresses and send the existing user an email instead.
- Disable the submit button only while the request is in flight, and show that it is working.

### 7. Verification and the screen after submit

- Decide what verification protects. If it only confirms the address for later email, let the user into the product at once and ask for confirmation in a banner; gate the specific actions that need a confirmed address (inviting others, sending email, paid features).
- When a gate is required, prefer a six-digit code typed into the page the user is already on over a link that opens a new tab or another device. Say which address the message went to, and offer "resend" (rate-limited) and "change address" in place.
- The post-signup redirect lands on something usable, not on a second form.

### 8. Bots, consent and legal lines

- Start with defences nobody sees: rate limits per address and network, a hidden honeypot field, and an invisible challenge. Add a visible puzzle only when abuse persists; puzzles cost completions and need an alternative for people who cannot solve them (WCAG 2.2 criterion 3.3.8).
- Marketing consent is a separate, unticked checkbox; a pre-ticked box is not consent under the GDPR.
- Acceptance of terms can usually be a sentence above the button rather than a checkbox; confirm with the user's counsel for regulated products.

### 9. Test and judge

Ship plain defect fixes (broken autofill, lost input, missing labels) without an experiment and compare the three rates before and after. Run an A/B test for changes with a real trade-off: removing a qualifying field, changing the method on offer, moving verification.

```python
from statistics import NormalDist

def sample_size_per_variant(baseline, relative_lift, alpha=0.05, power=0.8):
    """Visitors who start the form, per variant, for a two-sided test of two proportions."""
    p1, p2 = baseline, baseline * (1 + relative_lift)
    z = NormalDist().inv_cdf(1 - alpha / 2) + NormalDist().inv_cdf(power)
    return round(z ** 2 * (p1 * (1 - p1) + p2 * (1 - p2)) / (p2 - p1) ** 2)
```

Divide the result by weekly form starts per variant to get the duration; if that exceeds about six weeks, test a bolder change or accept a before-and-after comparison. Judge on completion and on a downstream measure (verified accounts, accounts active after seven days, qualified leads), because a shorter form can raise sign-ups and lower their quality.

### 10. Deliverable

1. Flow map: steps, fields, off-page actions.
2. Audit table: `step | observation | evidence (code location or metric) | change | metric it should move | effort`.
3. The code change, as a diff to the form and validation.
4. Event specification and the three baseline rates.
5. Test plan: hypothesis, primary and guardrail metric, sample size, duration.

## Examples

### Example 1: A seven-field business signup

**Request:** "Nimble Trellis is a project planning tool. Our signup at `app/signup/page.tsx` has seven fields and 31% of people who start it finish; on phones it is 19%. About 2,400 people start it each week. Improve it."

Flow map: one step, seven required fields (first name, last name, work email, password, confirm password, company, team size), then an email link that must be clicked before the first sign-in.

| Step | Observation | Evidence | Change | Metric | Effort |
|---|---|---|---|---|---|
| Form | Password rule demands upper case, digit and symbol and is shown only after submit; 22% of submits fail on it | `lib/validation.ts` regex; `signup_error` by field | One rule (15+ characters) shown under the field, breached-password check on the server | Completion | S |
| Form | Password input uses `autocomplete="off"`; generated passwords are rejected | `SignupForm.tsx` line 48 | `autocomplete="new-password"`, remove the confirm field, add a show toggle | Completion, mobile | S |
| Form | Company and team size are asked before the account exists | Used only by the sales dashboard | Company inferred from the email domain; team size moved to the first project screen, skippable | Completion | M |
| Form | No identity-provider option although 64% of addresses are Google Workspace | Email domain MX sample | Add Google and Microsoft buttons above the form | Start and completion | M |
| After submit | Product is locked until the email link is clicked | `middleware.ts` redirect | Let users in; require confirmation before inviting teammates | Verified rate, 7-day active | M |

The first two rows are defects and ship immediately. The field removal and the verification change are tested together against the corrected form:

```text
>>> sample_size_per_variant(0.31, 0.15)
1609
```

With 1,200 starts per variant per week the test needs about ten days; it runs two full weeks to cover weekday patterns. Primary metric: completion rate. Guardrail: share of new accounts that create a project within seven days must not fall.

### Example 2: Verification that loses half the sign-ups

**Request:** "Shiftloom is a rota app for cafés; almost all signups are on phones. 1,000 people a week enter their email, but only 540 ever confirm it and get in. What should we change?"

Flow map: (1) email only, (2) "check your inbox" page, (3) link opens the default browser, (4) set password, (5) business name and number of staff.

Findings: the loss sits between steps 2 and 3, a verified rate of 54%. The address field has `type="text"`, so phones show a letter keyboard without "@" and offer no autofill, and mistyped addresses never receive the message. The link opens outside the in-app browser many visitors arrive in from social apps, which starts a new session with no record of the signup. There is no resend or change-address control.

Changes, in order:

1. Step 1 input becomes `type="email"` with `autocomplete="email"`; the server rejects domains without a mail server and the page suggests a correction for common misspellings.
2. Replace the link with a six-digit code entered on the same page: `type="text"`, `inputmode="numeric"`, `autocomplete="one-time-code"`, with "Resend code" after 30 seconds and "Use a different email".
3. Ask for the business name before verification, so the code step is the last one and the user arrives in a named workspace.
4. Password creation is dropped from signup; returning users sign in with a code and can add a passkey from settings.
5. Events: `signup_error` with `reason` values `code_wrong`, `code_expired`, `email_bounced`; `signup_verified` with `minutes_to_verify`.

The verification change alters behaviour enough to judge without a split test at this volume: compare verified rate for two weeks before and after, with the target set at 75%, and watch seven-day retention as the guardrail.

## Guidelines

- No field count is correct in the abstract. A form with one unnecessary field is too long, and a business product may be right to keep a qualifying question; decide from what the data is used for.
- Do not quote conversion benchmarks or promise a percentage lift. Give the mechanism, the metric it should move, and the test that will show it.
- Security requirements outrank conversion. Do not weaken password checks, remove rate limits or skip verification that protects other users or payments in order to raise a rate.
- An identity-provider button is a dependency and a data-sharing decision: confirm the user accepts the provider's terms and has a recovery path for accounts when a provider is unavailable.
- Client-side validation is a convenience. Every rule also runs on the server, and server errors must map back to the right field.
- Test the changed form with a password manager, with browser autofill, on a small phone, with the keyboard only and with a screen reader before measuring anything.
- Accessibility items here follow WCAG 2.2 (1.3.5, 2.5.8, 3.3.1, 3.3.3, 3.3.7, 3.3.8); they are requirements in many jurisdictions, not optional polish.
- Lead-capture, checkout and newsletter forms have different goals; use this skill only where an account is being created.
