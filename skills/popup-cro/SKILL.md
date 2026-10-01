---
name: popup-cro
description: >-
  Specifies, builds and audits website popups: modal dialogs, slide-ins, sticky bars and exit prompts
  that collect an email, show an offer or make an announcement. Picks the format and trigger, keeps
  the overlay inside Google's intrusive-interstitial guidance, makes the dialog accessible, caps how
  often it appears and defines how to measure its net effect. Use when someone asks to "add an email
  popup", "design an exit-intent popup", "our popup converts badly", "is this popup hurting SEO",
  "make the modal accessible", "announcement bar", or "newsletter slide-in". For a form that sits in
  the page use form-cro; for upgrade prompts inside a product use paywall-upgrade-cro.
license: Apache-2.0
compatibility: >-
  Any website. Code samples use the native HTML dialog element (Chrome 37+, Firefox 98+, Safari 15.4+)
  and plain JavaScript, no library. Works with any analytics tool that accepts custom events.
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["popups", "conversion", "lead-capture", "accessibility", "seo"]
---

# Popup CRO

## Overview

A popup interrupts a visitor to ask for something. It earns its place only when the visitor gets a
fair trade at a moment that does not block what they came for. This skill produces a popup
specification (format, trigger, audience, cap, copy, events) and, when asked, the markup and script.
Every recommendation has to pass three checks: Google's guidance on intrusive interstitials and
dialogs; the modal dialog pattern of the WAI-ARIA Authoring Practices with the WCAG 2.2 criteria an
overlay can break; and restraint, meaning one overlay at a time and a memory of who already answered.

## Instructions

### 1. Collect the facts

Read `.claude/product-marketing-context.md` if the project has one. Then look in the code before
asking anything:

```bash
grep -rnEi "showModal|<dialog|role=\"dialog\"|aria-modal|exit.?intent|popup|slide-?in|mouseleave" src/ app/ components/ 2>/dev/null
```

Note every overlay that already exists (consent banner, chat widget, promo bar, tag-manager
popups); the new one competes with them. Ask the user only for what the code cannot show:

1. What the visitor is asked for and what they receive in return, in one sentence.
2. Which pages it should cover and what share of those sessions arrives from organic search on a phone.
3. Current numbers, if a popup exists: views, submissions, dismissals, complaints.
4. Where the address or lead goes (email platform, CRM) and what consent wording legal has approved.

### 2. Choose the format

Start from the least interruptive format that can do the job; move down the table only with a reason.

| Format | Blocks the page | Suits | Search risk |
|---|---|---|---|
| Block inside the content | No | Newsletter and lead offers on articles | None |
| Top or bottom bar | No | Shipping thresholds, dates, one-line notices | None when it takes a small fraction of the screen |
| Corner slide-in (non-modal) | No | Newsletter, related offer, feedback | Low |
| Modal dialog opened by a click | Yes, on request | "Get the template", "See the size chart" | None, the visitor asked |
| Modal dialog opened automatically | Yes | A high-value offer after clear engagement | High when it meets a visitor arriving from search |
| Full-page interstitial | Yes | Legally required gates only | Exempt when mandatory, otherwise avoid |

### 3. Choose the trigger

| Trigger | Signal it reads | Notes |
|---|---|---|
| Click | Explicit request | Never capped, never suppressed |
| Scroll depth | Reading | Begin at half the page and tune from data |
| Time on page | Dwell | Weak signal by itself; combine with scroll or page count |
| Second or later pageview | Research | Safe default for automatic modals |
| Pointer leaves through the top edge | Leaving, desktop only | There is no pointer on touch screens; use the bar or slide-in there |
| Cart or form state | Intent | Never interrupt a checkout or a form that is being filled in |

Thresholds are starting points for a test. Never quote a "typical popup conversion rate" as fact;
the site's own baseline is the only benchmark that counts.

### 4. Stay inside Google's interstitial guidance

Search Central's page "Avoid intrusive interstitials and dialogs" asks for two things: do not
obscure the entire page with an interstitial, and do not redirect the visitor to a separate page
for consent or input. It recommends banners that take only a small fraction of the screen. The
announcement of the original ranking signal lists what counts against a page: a popup covering the
main content right after arrival from search results or while reading, a standalone interstitial to
dismiss before the content, and a layout whose first screen imitates one. Not counted: overlays
required by law (cookie consent, age verification), login walls on content that is not publicly
indexable, and banners of reasonable size that are easy to dismiss. Working rules:

- The first pageview of a session shows no automatic overlay that covers content. Use a bar, a
  slide-in or the in-content block there; automatic modals wait for the second pageview or a real
  engagement signal.
- Render the offer over the content, on the same URL. Never send visitors to an intermediate page.
- This is one signal among many, and Google states that relevant content can still rank. Do not
  promise a ranking gain from removing a popup; promise that the page stops carrying the risk.

### 5. Cap and suppress

- One overlay at a time. Priority: legally required notice, then anything the visitor opened by
  click, then at most one promotional overlay per pageview.
- Never show to someone who already did the thing: subscribers, logged-in customers, arrivals from
  the newsletter. After a dismissal stay silent for at least two weeks; after a submission, for good.
- Storage reality: Safari's tracking prevention deletes cookies written by script, and all other
  script-writable storage, after seven days without interaction on the site. A "30-day" cap kept in
  `localStorage` is forgotten after a week away. For longer memory set a cookie from the server
  response, or key suppression to the subscriber or account record.

### 6. Build it accessibly

A modal overlay must behave like the APG modal dialog; a bar or slide-in must not pretend to be one.

| Requirement | How | Reference |
|---|---|---|
| Has a name | `aria-labelledby` pointing at the visible heading | APG dialog (modal) |
| Focus moves in, stays in, returns | `showModal()` does all three; restore manually only if the opener is gone | APG; WCAG 2.4.3 |
| Escape closes | Default for `showModal()`; never cancel it | APG; WCAG 2.1.2 |
| A visible close control in the tab order | A real `button`, at least 24 by 24 CSS pixels | WCAG 2.5.8 |
| Page behind is inert | Automatic with `showModal()` | APG |
| Sticky bar does not hide the focused element | `scroll-padding` equal to the bar height | WCAG 2.4.11 |
| Result is announced | `role="status"` on the confirmation text | WCAG 4.1.3 |
| No self-closing timer; animation can be switched off | No auto-dismiss; honour `prefers-reduced-motion` | WCAG 2.2.1, 2.3.3 |

Non-modal formats (bar, slide-in) are a labelled `aside`; they do not take focus or set `aria-modal`.

```html
<dialog id="offer" closedby="any" aria-labelledby="offer-title">
  <div class="offer-body">
    <h2 id="offer-title">The month-end close checklist</h2>
    <p>One page, 14 steps. You also get one email a week; every one has an unsubscribe link.</p>
    <form id="offer-form">
      <label for="offer-email">Work email</label>
      <input id="offer-email" name="email" type="email" autocomplete="email" required>
      <button type="submit">Send me the checklist</button>
    </form>
    <p id="offer-status" role="status"></p>
    <button type="button" id="offer-close">Not now</button>
  </div>
</dialog>
```

```js
const KEY = 'offer-checklist', DAY = 86400000;
const dialog = document.getElementById('offer');
const closeBtn = document.getElementById('offer-close');
const status = document.getElementById('offer-status');
function mayShow(now = Date.now()) {
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(KEY)); } catch { /* storage blocked */ }
  return !seen || (!seen.done && now - seen.at > 14 * DAY);
}
function remember(done) {
  try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), done })); } catch {}
}
function openOffer(trigger) {
  if (document.querySelector('dialog[open]')) return;      // one overlay at a time
  dialog.showModal();   // focus moves inside, the page behind turns inert, Esc closes
  window.dataLayer?.push({ event: 'popup_view', popup_id: KEY, trigger });
}
closeBtn.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => {
  if (dialog.dataset.done) return;
  remember(false);
  window.dataLayer?.push({ event: 'popup_dismiss', popup_id: KEY });
});
document.getElementById('offer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch('/api/subscribe', { method: 'POST', body: new FormData(e.target) });
  if (!res.ok) { status.textContent = 'That did not go through. Please try again.'; return; }
  dialog.dataset.done = '1';
  remember(true);
  e.target.hidden = true;
  status.textContent = 'Sent. The checklist is on its way to your inbox.';
  closeBtn.textContent = 'Close';
  closeBtn.focus();
  window.dataLayer?.push({ event: 'popup_submit', popup_id: KEY });
});
document.querySelector('[data-open-offer]')?.addEventListener('click', () => openOffer('click'));
if (mayShow()) {
  const onScroll = () => {
    if ((scrollY + innerHeight) / document.documentElement.scrollHeight < 0.5) return;
    removeEventListener('scroll', onScroll);
    openOffer('scroll_50');
  };
  addEventListener('scroll', onScroll, { passive: true });
}
```

`closedby="any"` lets a click outside close the dialog in Chrome 134+ and Firefox 141+. Safari has
not shipped it in a stable release, so the `click` listener on the dialog does that job there. Set
`padding: 0` on the dialog and pad `.offer-body`; otherwise a click on the dialog's own padding
counts as a click outside.

### 7. Write the copy

- Heading: the thing they receive, in the visitor's words. Body: one sentence on what happens next.
- One field. Each extra field needs a reason the visitor would accept.
- Button label names the action ("Send me the checklist"). The way out is neutral ("Not now"); it
  never makes the visitor insult themselves.
- Consent: say what will be sent and how often, and link the privacy notice. Under GDPR consent
  needs a clear affirmative act, so no pre-ticked boxes and no consent buried in the terms.
- Deadlines, stock counts and subscriber counts must be true. A countdown that restarts on reload
  is deception, and US rule 16 CFR 465 prohibits fabricated testimonials.

### 8. Measure the net effect

Send `popup_view`, `popup_submit` and `popup_dismiss` with `popup_id` and `trigger`, then report:

- Submit rate = submissions / views. View rate = views / eligible sessions.
- **Net lift:** keep 10% of eligible visitors as a holdout that never sees the overlay and compare
  total signups per session, including the in-page form. Popups often move signups from one place
  to another; only the holdout shows what was added.
- Guardrails on the same split: bounce rate, pages per session, checkout completion, and
  unsubscribes or spam complaints from the addresses collected.

### 9. Deliver the specification

Hand over one plain-text block per popup with these lines, in this order: Popup (id), Goal (with
the current baseline), Format, Trigger, Audience, Cap, Copy (heading, sentence, field label,
button, way out, consent line), Events, Measure. Example 1 shows the block filled in. With several
popups, add the priority order between them. Code follows the block only when the user asked for it.

## Examples

### Example 1: newsletter popup for a bookkeeping blog

Request: "Pennybriar gets 38,000 blog sessions a month and about 340 signups from the footer
form. Add a popup, but 71% of our traffic is organic and mostly on phones." Result:

```text
Popup: month-end-checklist
Format: phones - slide-in from the bottom, non-modal, 30% of the viewport at most;
        desktop - modal dialog
Trigger: phones - 50% scroll, any pageview (it covers no content);
         desktop - 50% scroll from the second pageview on; "Get the checklist" link always opens it
Audience: no subscriber cookie, utm_source is not "newsletter"
Cap: 1 per session, 14 days after dismissal, never after signup (server-set cookie, 180 days)
Copy: "The month-end close checklist" / "One page, 14 steps. Plus one email a week." /
      "Work email" / "Send me the checklist" / "Not now"
Measure: 10% holdout for 4 weeks; primary metric signups per session;
         guardrails: pages per session, organic entrances to the blog
```

After four weeks the holdout shows 0.9% signups per session and the exposed group 2.1%, pages per
session unchanged. The popup stays; the next test changes only the trigger.

### Example 2: audit of a welcome discount on a shop

Request: "Our tea shop Larch & Kettle shows a 10% welcome popup on every page load. Mobile revenue
from Google dropped. Is the popup the reason?"

The agent reads the theme code, finds a full-screen overlay opened by a 0-second timer, and reports:

| Finding | Evidence | Fix |
|---|---|---|
| Covers the whole page on the first pageview, including arrivals from search | `setTimeout(open, 0)` in `theme.js`; overlay is 100vw by 100vh | Bottom bar "10% off your first order" on the first pageview; modal only on click |
| No Escape handling, focus stays behind the overlay | `div.overlay` without dialog semantics | Rebuild on `dialog` with `showModal()` |
| Close icon is 14 by 14 pixels | Computed style | Text button "Not now", 44 pixels tall |
| Shown again on every page | No stored state | 14-day silence after dismissal, none for customers |
| Timer says "offer ends in 10:00" and restarts on reload | `startCountdown(600)` on load | Remove; the code has no deadline |

It adds a caveat: the overlay breaks Google's guidance and gets fixed regardless, but the revenue
drop is not proven to come from it; seo-audit should check rankings for the same dates first.

## Guidelines

- Prefer a trigger the visitor controls. A click-opened dialog needs no cap and carries no search risk.
- Do not build exit prompts for phones from back-button traps or history manipulation. Google's
  spam policies name back button hijacking as a malicious practice.
- Do not hide the popup from Googlebot while visitors get it; showing crawlers and people different
  pages is what the cloaking policy covers. The one documented allowance is letting verified
  Googlebot past a mandatory age gate.
- A consent banner is not marketing. Never stack a promotion over or behind it; wait for the answer.
- Inserting a bar above the content after load shifts the layout and counts toward Cumulative
  Layout Shift (good is 0.1 or lower). Reserve its height or overlay it at the bottom.
- Do not use a popup when the offer is weak, on checkout, signup, login and payment pages, or when
  the same ask already sits visibly in the page. Upgrade prompts in a product: paywall-upgrade-cro.
- Test the finished overlay with a keyboard only and with a screen reader before it ships: open,
  Tab through, submit, Escape, and check where focus lands.
