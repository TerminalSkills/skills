---
name: form-cro
description: >-
  Audits and rebuilds web forms so that more people finish them: lead, contact,
  demo-request, quote, checkout and survey forms. Produces a field-by-field
  triage, standards-based markup (labels, autocomplete tokens, error handling
  per the HTML spec and WCAG 2.2), funnel tracking and a test plan. Use when
  someone says "our form isn't converting", "too many form fields", "people
  abandon the contact form", "fix the demo request form", "form completion
  rate", "form validation errors" or "make this form accessible". Account
  sign-up flows belong to signup-flow-cro and forms inside popups to popup-cro.
license: Apache-2.0
compatibility: >-
  Any agent that can read HTML, JSX or template files. Markup targets current
  evergreen browsers; tracking examples assume Google Analytics 4 (gtag.js).
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["forms", "conversion", "accessibility", "lead-generation", "wcag"]
---

# Form CRO

## Overview

A form loses people for three reasons: it asks for more than the visitor thinks the reward is worth, it is physically awkward to fill in (wrong keyboard, no autofill, tiny targets), or it rejects an answer without saying how to fix it. This skill works through all three and hands back four things: a measured funnel, a decision for every field, replacement markup that follows the HTML specification and WCAG 2.2, and a test plan sized to the traffic the form really gets.

Accessibility is treated as part of conversion, not a separate chore. A visitor who cannot hear which field is wrong, or whose password manager cannot recognise the email box, is an abandoned submission like any other.

## Instructions

### 1. Collect the form and the facts around it

Read the form before asking anything. In a repository, find it and its handler:

```bash
grep -rnE "<form|onSubmit=|action=" --include="*.html" --include="*.tsx" --include="*.jsx" --include="*.vue" src/ | head -40
```

For a live page, fetch the HTML and note every `input`, `select` and `textarea` with its `type`, `name`, `autocomplete`, `required` and associated `label`. Then ask the user only for what the code cannot show:

- What happens to a submission, and which fields does the next person or system actually use (routing, CRM, quoting)?
- Monthly numbers: page views, people who started typing, successful submissions, split by phone and desktop.
- Legal constraints: marketing consent, regulated data, age checks.
- Whether engineering can change the backend or only the front end.

### 2. Measure the funnel before changing anything

Four counts describe a form: views, starts, submit attempts, successes. Start rate (starts ÷ views) is a page problem: the offer, the placement, the perceived length. Completion rate (successes ÷ starts) is a form problem. Attempts minus successes are validation failures.

GA4 enhanced measurement already emits `form_start` (first interaction with a form in a session) and `form_submit`, carrying `form_id`, `form_name` and `form_destination`; those parameters only show up in reports after they are registered as custom dimensions. `form_submit` fires on the submit event, so it also counts attempts the server rejects. Send the recommended `generate_lead` event from the confirmation step instead and treat that as the conversion. For the field where people give up, record the last field focused when the page is hidden (see Example 2).

### 3. Decide the fate of every field

Give each field one of five verdicts and write the reason beside it.

| Verdict | When it applies |
|---|---|
| Keep, required | Nobody can act on the submission without it |
| Keep, optional | Helps some visitors, and its label says "(optional)" |
| Derive | Obtainable from another answer: company from the email domain, city and state from the postal code, country from locale |
| Defer | Useful later: ask on the confirmation page, in the follow-up email or on the call |
| Delete | No named person or system reads it |

Removing fields usually raises completion, but it is a trade: a qualifying question dropped from a sales form can fill the calendar with poor-fit calls. State that trade to the user and let a test settle it rather than quoting a universal percentage.

### 4. Write the markup to the standard

Every control gets these, in this order of importance:

1. **A visible `label` tied by `for`/`id`.** Placeholder text is not a label: it vanishes on input and assistive technology does not treat it as one (WCAG 3.3.2, Level A). Put an example in a hint paragraph linked by `aria-describedby`.
2. **The right `type`**: `email`, `tel`, `url`, `date`. For digits that are not quantities (postal code, card number, one-time code) use `type="text"` with `inputmode="numeric"`; `inputmode` only chooses the on-screen keyboard and validates nothing.
3. **An `autocomplete` token** from the HTML autofill list, so browsers and password managers fill the field (WCAG 1.3.5, Level AA, for data about the user).
4. **`required` on mandatory fields**, and the word "(optional)" in the label of the others. Mark whichever group is smaller.

| Field | `autocomplete` | Notes |
|---|---|---|
| Full name | `name` | One box unless a downstream system needs the parts (`given-name`, `family-name`) |
| Email | `email` | `type="email"`, `spellcheck="false"` |
| Phone | `tel` | `type="tel"`; accept spaces, dashes and a leading plus sign |
| Company / job title | `organization` / `organization-title` | |
| Street | `address-line1`, `address-line2` | Prefix with `shipping` or `billing` at checkout |
| City / state or region | `address-level2` / `address-level1` | |
| Postal code | `postal-code` | `inputmode="numeric"` only where codes are all digits |
| Country | `country` (code) or `country-name` | |
| Card | `cc-name`, `cc-number`, `cc-exp`, `cc-csc` | |
| SMS or email code | `one-time-code` | `inputmode="numeric"` |

Layout rules that hold up: one column; a label above its field; radio buttons for two to five choices and a `select` beyond that; inputs sized to hint at the expected length; text at 16px or larger so iOS Safari does not zoom the page on focus; every tap target at least 24 by 24 CSS pixels (WCAG 2.5.8, Level AA), with 44 by 44 as the comfortable goal for the submit button and radio rows. Never block paste, and never switch autofill off for personal data.

### 5. Handle errors so they can be fixed

- Validate on the server every time. Client-side checks are a courtesy.
- Check on submit. After a field has failed once, re-check it as the visitor edits so the message clears the moment it is fixed. Do not flag an empty field the visitor has not reached.
- Add `novalidate` to the form when the page supplies its own messages; native browser bubbles cannot be styled, vanish after a few seconds and show one field at a time.
- Each message says what to enter, in the words of the label: "Enter a phone number with area code", not "Invalid input". Identify the field in text (WCAG 3.3.1) and suggest the fix when it is known (3.3.3).
- Set `aria-invalid="true"` on the control and connect the message with `aria-describedby`.
- With several failures, show a summary above the form in a `role="alert"` container, move focus to it, and link each line to its field. Prefix the page title with "Error:".
- Keep everything the visitor typed. Colour alone must not carry the error state (1.4.1).

### 6. Split into steps only when it helps

Use steps when the form has distinct topics (property, usage, contact) or branches. Each step gets a heading that states the position ("Step 2 of 3: your energy use"), a Back control that restores earlier answers, and no question repeated from an earlier step (WCAG 3.3.7). Put contact details last, and say up front how many steps there are.

### 7. Finish the submission properly

The button names the result ("Book my demo", "Send my quote request"). Leave it enabled; a greyed-out button gives no clue about what is missing. After the first click, block double submission and show progress. Confirm on a new page or in a `role="status"` region with what happens next and when ("Priya from our team will email you by 5pm tomorrow"). A pre-ticked marketing checkbox is not valid consent under GDPR and UK GDPR, so consent boxes start unticked and stay separate from the terms. Prefer a honeypot field plus server rate limiting to a puzzle CAPTCHA.

### 8. Deliver in this shape

1. **Funnel**: views, starts, attempts, successes and the two rates, per device where known.
2. **Findings table**: finding, evidence (line of markup or a number), fix, standard or source, effort (S/M/L), priority.
3. **Field triage table** from step 3.
4. **Replacement markup**, complete and ready to paste, plus any script.
5. **Test plan**: one hypothesis per change set, the primary metric, and the sample needed. For two variants at 80% power and 5% significance, each arm needs about `16 × p × (1 − p) ÷ d²` starts, where `p` is the average of the two completion rates and `d` the absolute lift worth detecting. If that takes longer than about eight weeks, ship the fixes and compare before and after.

## Examples

### Example 1: A demo-request form cut from eleven fields to five

**Request:** "Tallybridge sells payroll software to restaurants. Our demo form has 11 fields and 4.1% of the people who open the page submit it. The file is `src/pages/demo.html`."

The agent reads the file and reports: no `autocomplete` on any field, placeholders used as labels, phone required, errors shown one at a time by the browser. Triage:

| Field | Verdict | Reason |
|---|---|---|
| Full name, work email, company | Keep, required | Sales cannot reply or prepare without them |
| Number of locations | Keep, optional | Routes groups of six or more to the enterprise rep |
| Phone | Keep, optional | 1 in 5 booked demos happens by phone |
| Job title, payroll provider, message | Defer | Asked in the calendar invite |
| Country, state | Derive | The product is US-only, and the rep reads the state from the company's address |
| "How did you hear about us?" | Delete | Nobody has opened that report since 2024 |

Replacement markup (three required fields, two optional):

```html
<div id="error-summary" role="alert" tabindex="-1" hidden>
  <h2>Fix these answers to continue</h2>
  <ul></ul>
</div>

<form id="demo-request" action="/demo-request" method="post" novalidate>
  <div class="field">
    <label for="name">Full name</label>
    <p id="name-error" class="error" hidden></p>
    <input id="name" name="name" type="text" autocomplete="name"
           aria-describedby="name-error" required>
  </div>
  <div class="field">
    <label for="email">Work email</label>
    <p id="email-error" class="error" hidden></p>
    <input id="email" name="email" type="email" autocomplete="email"
           spellcheck="false" aria-describedby="email-error" required>
  </div>
  <div class="field">
    <label for="company">Restaurant or group name</label>
    <p id="company-error" class="error" hidden></p>
    <input id="company" name="company" type="text" autocomplete="organization"
           aria-describedby="company-error" required>
  </div>
  <fieldset>
    <legend>How many locations do you run payroll for? (optional)</legend>
    <label><input type="radio" name="locations" value="1"> 1</label>
    <label><input type="radio" name="locations" value="2-5"> 2 to 5</label>
    <label><input type="radio" name="locations" value="6+"> 6 or more</label>
  </fieldset>
  <div class="field">
    <label for="phone">Phone (optional)</label>
    <p id="phone-hint" class="hint">Only if you would rather get a call than an email.</p>
    <input id="phone" name="phone" type="tel" autocomplete="tel"
           aria-describedby="phone-hint">
  </div>
  <button type="submit">Book my demo</button>
  <p>We use these details only to arrange your demo. <a href="/privacy">Privacy notice</a></p>
</form>
```

```js
const form = document.querySelector('#demo-request');
const summary = document.querySelector('#error-summary');
const messages = {
  name: 'Enter your full name',
  email: 'Enter an email address like dana@harborgrill.co',
  company: 'Enter the name of your restaurant or group',
};

function check(input) {
  const error = document.getElementById(`${input.id}-error`);
  const bad = !input.checkValidity();
  input.setAttribute('aria-invalid', String(bad));
  error.textContent = bad ? messages[input.name] : '';
  error.hidden = !bad;
  return bad ? input : null;
}

form.addEventListener('submit', (event) => {
  const failed = [...form.querySelectorAll('input[required]')].map(check).filter(Boolean);
  if (!failed.length) return; // the server validates again
  event.preventDefault();
  summary.querySelector('ul').innerHTML = failed
    .map((input) => `<li><a href="#${input.id}">${messages[input.name]}</a></li>`)
    .join('');
  summary.hidden = false;
  summary.focus();
  document.title = `Error: ${document.title.replace(/^Error: /, '')}`;
});

form.addEventListener('input', (event) => {
  if (event.target.getAttribute('aria-invalid') === 'true') check(event.target);
});
```

Submitting this form empty lists three linked messages, moves focus to the summary and marks each control `aria-invalid="true"`; correcting a field clears its message as the visitor types. The agent closes with the trade to watch: lead volume should rise, so track the share of demos that sales marks as qualified for four weeks alongside the completion rate.

### Example 2: Finding where a three-step quote form loses people

**Request:** "Brightfield Solar's quote form: 9,400 views a month, 2,350 starts, 310 quote requests. Where do we lose them and what should we test?"

The agent computes a 25% start rate and a 13.2% completion rate (310 ÷ 2,350), notes that 87% of starters leave somewhere inside the form, and adds tracking to learn where:

```js
const quote = document.querySelector('#quote');
let lastField = '';

quote.addEventListener('focusin', (event) => {
  if (event.target.name) lastField = event.target.name;
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && lastField && !quote.dataset.sent) {
    gtag('event', 'form_abandon', { form_id: quote.id, last_field: lastField });
  }
});

// on the confirmation step, after the server accepts the request
quote.dataset.sent = 'true';
gtag('event', 'generate_lead', { currency: 'USD', value: 40 });
```

The event also fires when someone only switches tabs, so the agent reads it as a ranking of fields, not an exact count. Two weeks of data show 41% of these events with `last_field` equal to `bill_upload`, a required utility-bill upload on step 2. The agent proposes replacing it with one typed number and moving the upload to the confirmation page:

```html
<h2>Step 2 of 3: your energy use</h2>
<div class="field">
  <label for="bill">Average monthly electric bill, in dollars</label>
  <p id="bill-hint" class="hint">A rough figure is fine, for example 180.</p>
  <input id="bill" name="bill" type="text" inputmode="decimal"
         autocomplete="off" aria-describedby="bill-hint" required>
</div>
```

Test plan: hypothesis "typing a number instead of uploading a bill lifts completion from 13.2% to 17.2%". With `p` = 0.152 and `d` = 0.04, each arm needs 16 × 0.152 × 0.848 ÷ 0.0016 ≈ 1,290 starts. At 2,350 starts a month split two ways, that is about five weeks. Guardrail metric: the share of quotes that survey engineers accept without asking for the bill again.

## Guidelines

- Never promise a lift. Field-count studies disagree with each other and none of them describes this form; report the baseline, the change and the measured result.
- Do not validate on every keystroke or on leaving an untouched field; an error shown before the visitor has finished typing reads as an accusation.
- `autocomplete="off"` is for values that are not about the person (a bill amount, a one-off reference). On name, email, phone and address it only makes the form slower.
- Do not split one value across several boxes, such as three boxes for a phone number; accept the formats people type and normalise on the server. A date the visitor knows by heart, like a date of birth, is the exception: separate day, month and year fields work well there.
- A `select` with two hundred countries is slower than a text box with `autocomplete="country-name"`. Reach for a custom combobox only if it is fully keyboard operable.
- The markup here is tested with an automated accessibility checker, which cannot judge contrast, focus visibility or wording. Check text contrast of 4.5:1 and field borders of 3:1, then tab through the form with a keyboard and once with a screen reader.
- Low traffic means no A/B test. Under roughly a thousand starts a month, fix the clear defects (missing labels, no autofill, lost input on error) and compare periods, saying plainly that seasonality may explain part of the change.
- Not the right skill for account creation and login (signup-flow-cro), popups and slide-ins (popup-cro), or the page around the form when the start rate, not the completion rate, is the weak number (page-cro).
