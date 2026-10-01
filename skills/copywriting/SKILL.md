---
name: copywriting
description: >-
  Writes and rewrites the words on marketing pages: homepage, landing page,
  pricing, feature, product and about pages, including headlines, button text,
  section copy, title tag and meta description. Starts from the reader's own
  language and the proof the business can show, edits copy where it lives in
  the repository, and flags every claim that needs evidence. Use when someone
  says "write copy for this page", "rewrite our homepage", "this page sounds
  generic", "headline ideas", "better CTA", "landing page copy for this ad" or
  "pricing page wording". Email copy belongs to email-sequence, popups to
  popup-cro, and line-editing a finished draft to copy-editing.
license: Apache-2.0
compatibility: >-
  Any agent with file access. The self-check commands use grep and awk, present
  on macOS and Linux.
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["copywriting", "landing-pages", "messaging", "conversion", "headlines"]
---

# Copywriting

## Overview

Page copy has one job: let a particular visitor work out, in the few seconds they give it, what this is, whether it is for them, and what to do next. Usability research has found for decades that most visitors scan a page instead of reading it, and that concise, scannable, plainly worded text is measurably easier to use than promotional prose. So the work is mostly decisions made before any sentence is written: who is reading, what they already know, what can be proved.

The skill returns copy placed where it will live (the component, the Markdown file, the translation file), a short brief that explains the choices, alternatives for the headline and button, and a list of claims the user must confirm before publishing.

## Instructions

### 1. Find the copy and the constraints

Locate the page and any strings it pulls in before asking questions:

```bash
grep -rnE "<h1|<h2|title:|description:" src/app src/pages content 2>/dev/null | head -30
ls locales messages i18n 2>/dev/null
```

Read what is there, including neighbouring pages, so the new text matches the product's existing names for things. Then ask for what is missing:

- **The page and its one action.** What should a visitor do here: start a trial, book a call, buy, join a list?
- **The reader and the door they came through.** A search query, an ad (get the ad text), a link in an email, a referral.
- **The offer in plain terms**: what it does, what it costs, what is free, what happens after clicking.
- **Proof on hand**: customer numbers, measured results, named quotes with permission, awards, certifications.
- **Limits**: brand voice notes, words legal has ruled out, regulated claims (health, finance, security).

### 2. Collect the reader's words

Copy sounds generic when it is written from the product's vocabulary. Ask for, or read in the repository and shared folders, any of these: support tickets, sales-call notes, reviews of this product and of its competitors, cancellation reasons, forum threads where the audience complains about the problem.

Pull four things out of that material and quote them exactly:

1. The situation that sends someone looking ("every Sunday night I rebuild the rota").
2. The words they use for the problem, which are rarely the category name.
3. The result they want, in their terms.
4. What makes them hesitate.

If no such material exists, say so and label the draft as a hypothesis to check against the first five customer conversations.

### 3. Write the brief first

Seven lines, agreed with the user before drafting:

```text
Reader      who, in what role, at what size of company or stage of life
Situation   what just happened that made them look
Wants       the outcome in their words
Offer       the product and the mechanism that produces that outcome
Proof       what can be shown, with its source
Hesitation  the one or two doubts that stop the click
Action      the single thing this page asks for
```

Compress it into one sentence that the whole page defends, shaped like a Jobs to Be Done job story (situation, reader, outcome) with the mechanism added: "When next week's rota is still unfinished on Sunday night, a restaurant manager wants it done and seen by every employee, and Rotaleaf does that by sending a drag-and-drop rota to each phone." A page that cannot be summarised this way is trying to do two jobs; split it.

### 4. Lead with what this visitor needs to hear first

| The visitor arrived by | They already know | Open with |
|---|---|---|
| Searching the category ("staff scheduling app") | They need this kind of product | The category named plainly, then what sets this one apart |
| Searching the problem ("staff keep missing shifts") | The pain, not the product type | The problem in their words, then the outcome |
| Clicking an ad | Only the ad's promise | The same promise, in nearly the same words, as the headline |
| An email or a referral | The brand, maybe the product | The specific news or offer |
| Comparing shortlisted vendors | The alternatives | The concrete differences and the proof |

### 5. Build the page as answers, in the order questions arise

| Visitor's question | Section | What goes in it |
|---|---|---|
| What is this and is it for me? | Headline, subheadline, primary button | Outcome or category, who it is for, the next step |
| Can I believe it? | Proof, straight after the opening block | A number with its unit and date, logos with permission, one named quote |
| What do I actually get? | Three to five benefit blocks | Heading states the result; body states how the product delivers it |
| How hard is it? | Steps | What the first ten minutes look like, numbered |
| What does it cost? | Price or pointer to pricing | The number, the unit, what is included, what is not |
| What if it goes wrong? | Objections, as questions | The real hesitations from the brief, answered without hedging |
| What now? | Closing block | The offer restated in one line, the same button |

Page types change the emphasis, not the logic. A **homepage** serves several kinds of visitor, so its headline is the broadest true statement and its sections route people onward. A **landing page** has one audience and one action: remove navigation and every sentence that does not serve that action. A **pricing page** answers "which plan is mine" (name the customer each plan fits) and "what will I really pay". A **feature page** starts from the task the feature completes. An **about page** explains why the company's history makes it a safe choice and still ends with a next step.

### 6. Write the lines

- **Headline**: a visitor who reads only this line should know what is offered or what they will be able to do. Test: could a company in another industry use the same sentence? If yes, it says nothing.
- **Subheadline**: adds the mechanism and the audience. One or two sentences.
- **Headings**: each must make sense read alone, top to bottom, as a summary of the page.
- **Numbers**: give the figure, the unit and the comparison ("payroll export in 4 minutes, down from an afternoon"). Round numbers read as invented; use the measured one.
- **Words**: the reader's nouns, active verbs, "you" more often than "we". Cut intensifiers and any adjective the reader would not say aloud.
- **Buttons**: say what happens on click ("Start 30-day trial", "See pricing"), and put the reassurance beside it in small text ("No card needed").
- **Link text** describes its destination; "click here" fails both scanners and screen-reader users.

### 7. Keep every claim provable

Advertising law in the US requires that claims be truthful and that the advertiser hold evidence before publishing them; that covers what a sentence implies as well as what it states. In practice:

- Every number carries a source the user can produce. Mark anything unverified as `[CONFIRM: what is needed]` in the draft.
- Testimonials are real, attributed and used with permission. An exceptional result may not be presented as what customers generally get.
- "Free" comes with its conditions next to it. Comparisons with competitors must be accurate on the day of publishing.
- Drop "best", "leading", "#1" and "guaranteed" unless there is a document behind them.
- No invented scarcity or countdowns, and no button text that shames the person who declines.

### 8. Write the search snippet

Give each page a unique title element and meta description. Google states no length limit for either and truncates to fit the device, so put the distinguishing words first and the brand last; as a rule of thumb, about 60 characters for a title and 150 for a description usually survive. The description is one or two sentences a person would want to click, not a keyword list. Google may show different text, so the visible headline has to work alone.

### 9. Check the draft

```bash
# stock phrases that carry no information
grep -nEio "seamless(ly)?|cutting-edge|world-class|revolutionary|next-generation|best-in-class|robust|leverag[a-z]*|unlock[a-z]*|supercharg[a-z]*|game-chang[a-z]*|empower[a-z]*|innovative|solutions?" content/home.md

# sentences longer than 25 words
grep -vE "^(#|[[:space:]]*$)" content/home.md | grep -oE "[^.!?]+[.!?]" | awk 'NF > 25 { print NF " words:" $0 }'
```

Then read the headings alone, read the page aloud once, and confirm each line of the brief appears on the page.

### 10. Deliver

1. The agreed brief.
2. The copy, applied to the files (show the diff), or as a labelled document when no code exists: title tag, meta description, H1, subheadline, button, button note, then each section.
3. Two alternative headlines and one alternative button, each with the angle it takes and when to prefer it.
4. The `[CONFIRM]` list: every claim awaiting evidence.
5. What to test first, if the page has the traffic for a test.

## Examples

### Example 1: Landing page for a search ad

**Request:** "Write the landing page for our ad group 'restaurant staff scheduling app'. Rotaleaf, $3 per active employee a month, 30-day trial with no card. Three customer reviews attached."

The agent quotes the reviews ("I was rebuilding the rota in Excel every Sunday night"; "swaps happen in the group chat and I find out when someone doesn't show") and agrees this brief:

```text
Reader      Owner or manager of an independent restaurant, 8 to 40 staff, builds the rota personally
Situation   Sunday night, redoing next week's rota in a spreadsheet
Wants       A rota finished quickly that staff really see, and no surprise gaps
Offer       Rotaleaf: drag-and-drop rota sent to staff by text link, optional app, swaps the manager approves
Proof       212 restaurants (company figure, June 2026); quote from Inés Calloway, Brasa & Vine
Hesitation  "My staff won't install another app"; "I have no time to set this up"
Action      Start the 30-day trial
```

```markdown
Title tag:    Restaurant staff scheduling app | Rotaleaf
Description:  Build next week's rota from last week's, send it to every phone and approve shift swaps yourself. $3 per active employee. 30-day trial, no card.

# Restaurant staff scheduling without the Sunday-night spreadsheet

Build next week's rota, send it to every phone, and approve shift swaps before they turn into no-shows.

[Start 30-day trial]   No card needed. $3 per active employee after that.

Used by 212 restaurants (June 2026).

## Swaps you approve, not swaps you discover
Staff request a swap in the app. You get one notification, tap yes or no, and the rota updates for everyone.

## Next week's rota from last week's
Copy any week, drag the changes, publish. [CONFIRM: median time to publish a rota, from product analytics]

## "My staff won't install another app"
They do not have to. Everyone gets the rota by text message with a link; the app is optional.

> "I get my Sunday evenings back." Inés Calloway, owner, Brasa & Vine [CONFIRM: written permission]
```

Alternatives offered: "Stop rebuilding the rota every Sunday night" (leads with the pain; prefer for the problem-worded ad group) and "The rota your staff actually read" (leads with the result for managers whose trouble is no-shows).

### Example 2: Replacing a hero that says nothing

**Request:** "Our homepage hero feels empty. File is `src/components/Hero.tsx`. Driftwatch watches Postgres schemas."

The check from step 9 finds five stock phrases in two sentences. The user confirms the facts: comparison runs every 60 seconds, alerts go to Slack, one database is free and needs no card. The agent edits the component and leaves the markup and class names alone:

```diff
@@ -3,7 +3,9 @@
     <section className="hero">
-      <h1>The next-generation platform to supercharge your database workflows</h1>
+      <h1>Know within a minute when production stops matching your migrations</h1>
       <p className="sub">
-        Driftwatch empowers engineering teams to seamlessly unlock visibility into their schema.
+        Driftwatch compares your live Postgres schema with the migrations in your repository
+        every 60 seconds and posts the exact difference to Slack.
       </p>
-      <a className="btn" href="/signup">Get started</a>
+      <a className="btn" href="/signup">Watch my first database</a>
+      <p className="note">Free for one database. No card needed.</p>
     </section>
```

It reports why: the old headline could sit on any software site; the new one names the event the reader fears and the time to detection, the subheadline gives the mechanism, and the button describes the first step. It adds a title tag ("Postgres schema drift monitoring | Driftwatch", 45 characters) and notes one item to confirm: that "within a minute" holds for the largest customer schema.

## Guidelines

- Do not draft before the action and the reader are known. Copy written for "everyone" has to be rewritten.
- Never fabricate proof, and never soften an invented number into "up to". A gap in the evidence is reported, not papered over.
- Changing words in code means changing only words: keep element structure, translation keys and variables intact, and update every locale file or flag the ones left untranslated.
- Clever headlines cost comprehension. Wordplay is acceptable only when the literal meaning is still obvious to someone skimming.
- A headline test needs traffic. On a page with a few hundred visitors a month, choose by the brief and by showing two versions to five people from the audience.
- Length follows the decision: an expensive or unfamiliar product needs more answered questions, a free tool needs fewer. Cut sections, not clarity.
- The legal notes describe US advertising rules in outline; regulated sectors and other countries need review by someone qualified.
- Use a different skill for email sequences (email-sequence), popups (popup-cro), polishing existing text line by line (copy-editing), and diagnosing why a page underperforms beyond its wording (page-cro).
