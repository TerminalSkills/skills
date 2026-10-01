---
name: copy-editing
description: >-
  Edits existing marketing copy in ordered passes (structure, claims,
  sentences, consistency, proof) and returns the edited text with a change log
  and a list of questions for the author. Flags claims that need evidence
  instead of inventing proof, and keeps the writer's voice. Use when someone
  says "edit this copy", "proofread this page", "tighten this", "polish this
  email", "review my landing page copy", "make this clearer", "check this
  before we publish", or asks for copy feedback on a page, ad, email or
  product description.
license: Apache-2.0
compatibility: "Any text the agent can read: Markdown, HTML, JSX strings, localisation JSON, or pasted copy. Python 3.8+ (standard library only) for the optional mechanical check. English-language copy."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["copy-editing", "proofreading", "marketing-copy", "plain-language"]
---

# Copy Editing

## Overview

Editing is not rewriting. The author decided what to say; the editor makes sure a reader can find it, believe it and act on it, and that nothing on the page is wrong. This skill follows the levels professional editors work in — structure, then style, then consistency, then proofreading — and adds one pass that marketing copy needs and a novel does not: checking every claim for evidence.

Three things come back from every edit: the edited copy, a change log that gives a reason for each change, and questions only the author can answer. A change without a reason is a preference, and the author is free to ignore it.

## Instructions

### 1. Settle the brief

Ask only for what the request and the project do not already show:

- **Reader and action.** Who reads this, and the one thing they should do afterwards.
- **Where it appears**, because that sets length limits (table in step 6).
- **What must not change**: legal wording, prices, product and feature names, quotes from customers.
- **House style.** Look for a style guide, a brand voice document or a glossary in the project (`docs/`, `content/`, `README`), and for the same terms in published pages. Without one, follow the usage already dominant in the text.
- **Depth of edit:**

| Depth | What changes | Use when |
|---|---|---|
| Light | Errors and inconsistencies only; no rephrasing | Approved or legal-reviewed copy, a final check before publishing |
| Medium | Light, plus sentence-level clarity and cuts | The default |
| Heavy | Medium, plus reordering, cutting sections, flagging missing content | A rough draft, or "make this better" with no constraints |

If the depth is not stated and the copy is already live or approved, assume light and say so.

### 2. Run the mechanical check

Save the copy to a file and run `copycheck.py`. It finds candidates; judgment comes in the passes that follow.

```python
"""Mechanical checks for marketing copy: long sentences, filler, claims that need proof, reading ease."""
import re, sys

FILLER = r"\b(very|really|truly|simply|just|actually|basically|in order to|seamless(?:ly)?|leverag(?:e|es|ing)|" \
         r"utili[sz](?:e|es|ing)|cutting-edge|robust|world-class|next-generation|game-chang(?:er|ing))\b"
CLAIM = r"\b(best-in-class|best|leading|fastest|cheapest|easiest|only|number one|guarantee[ds]?|proven|" \
        r"trusted by|award-winning|unlimited|free|instant(?:ly)?)\b|#1|\d[\d,.]*\s?(?:%|x\b|times\b)"

def syllables(word):
    groups = re.findall(r"[aeiouy]+", word.lower())
    return max(1, len(groups) - (1 if word.lower().endswith("e") and len(groups) > 1 else 0))

text = open(sys.argv[1], encoding="utf-8").read()
plain = re.sub(r"\[(.*?)\]\(.*?\)", r"\1", re.sub(r"[#*_>`]", "", text))
sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n{2,}", plain) if re.search(r"[A-Za-z]", s)]
words = re.findall(r"[A-Za-z][A-Za-z'’-]*", plain)

for s in sentences:
    if len(s.split()) > 25:
        print(f"LONG    {len(s.split())} words: {s[:60]}...")
for label, pattern in (("FILLER ", FILLER), ("CLAIM  ", CLAIM)):
    for m in re.finditer(pattern, text, flags=re.I):
        line = text.count("\n", 0, m.start()) + 1
        print(f"{label} line {line}: {m.group(0)}")
ease = 206.835 - 1.015 * len(words) / len(sentences) - 84.6 * sum(map(syllables, words)) / len(words)
print(f"{len(words)} words, {len(sentences)} sentences, "
      f"{len(words) / len(sentences):.1f} words per sentence, Flesch reading ease {ease:.0f}")
```

Reading ease of 60–70 is the band Flesch labelled plain English. Treat the score as a thermometer: copy for specialists can sit lower, but a consumer page at 35 has a problem the passes below will find.

### 3. Pass one — structure (heavy edits only)

Read the whole piece once as the reader would, scanning. Most web readers scan before they read, so check what the scan delivers:

- Do the headline and first two lines say what this is, who it is for, and what the reader gets?
- Is there one main action, named the same way everywhere it appears?
- Does each heading carry information on its own ("Export to your accountant in one click"), or is it a label ("Features")?
- Is anything present for the company's benefit only (history, mission, internal names)? Propose cutting it.
- Is something the reader needs missing: price, what happens after the click, who it is not for? That becomes an author query, not invented text.

Propose reordering as a list of moves and wait for agreement before applying it to copy that is already approved.

### 4. Pass two — claims

List every statement a reader could take as fact, including implied ones, and sort them:

| Kind of claim | Example | Action |
|---|---|---|
| Objective and backed by something in the project | "Exports to CSV and PDF" | Keep; note the source |
| Objective, no evidence visible | "Cuts invoicing time by 40%", "trusted by thousands" | Query the author for the figure and its source; offer a wording that needs no proof |
| Comparative or superlative | "the fastest", "#1", "unlike other tools" | Query: compared with what, measured how, on what date? Otherwise cut |
| Testimonial or result | "I doubled my revenue" | Query: real, named, permission given, typical of what customers achieve? |
| Offer terms | "free", "guaranteed", "cancel anytime" | Check that conditions are stated next to the claim |
| Opinion or obvious exaggeration | "You'll love it" | Leave, unless it crowds out a fact |

Advertising rules in the US require a reasonable basis for objective claims before they are published, count what a reader would infer as well as what is literally said, and expect testimonials to reflect what customers generally experience. The editor's job is to surface these; deciding whether the evidence is good enough belongs to the author. Never supply a number, a customer name or a quote that was not provided.

### 5. Pass three — sentences (medium and heavy)

Work through the copy in order, changing the least that fixes the problem:

- Split sentences over about 25 words. One idea each.
- Put the actor first and use a verb: "Greyfinch sorts every entry" instead of "entries are sorted". Keep the passive when the actor is unknown or irrelevant.
- Turn noun phrases back into verbs: "provides automation of" becomes "automates".
- Replace long or formal words with the short ones the reader uses: buy, help, about, use, start.
- Delete intensifiers and filler the check found, unless removing one changes the meaning.
- Address the reader as "you". Count "we" and "our" against "you" and "your"; a page that is mostly "we" is about the wrong party.
- Explain a specialist term at first use, or swap it for the customer's word.
- Keep list items parallel: all verbs or all nouns, same tense.

Preserve the author's rhythm and vocabulary where they work. If a sentence is clear and correct, leave it alone even if you would have written it differently.

### 6. Pass four — consistency, then proof

Build a small style sheet as you go and apply it everywhere: spelling variant (US or UK), capitalisation of product and feature names, heading case, numerals and units, date and currency formats, serial comma, and the label of each button or link (one action, one label).

Then proofread the edited text, not the original:

- Spelling, doubled words, missing words, apostrophes (its/it's, your/you're), stray spaces, quotation marks.
- Every number agrees with every other mention of it: price, discount, limits, dates, counts.
- Links point where the text says they do; no leftover notes, TODOs or template text.
- Variables, placeholders, HTML tags and Markdown syntax survive untouched.
- Length limits for the destination:

| Where | Limit |
|---|---|
| Page title shown in search results | About 65 characters before it is cut off |
| Meta description | The first 160 characters carry the message |
| Google responsive search ad | Headline 30 characters, description 90, path 15 |
| Email subject line | Must match what the email contains; a misleading subject breaks the US CAN-SPAM rules |

### 7. Deliver

1. **Edited copy**, complete and ready to paste. In a repository, edit the files in place and touch only the text.
2. **Change log**: number, location, before, after, pass, reason. Group repeated changes ("serial comma added, 6 places") into one row.
3. **Author queries**: numbered, each tied to a location, each answerable in a sentence.
4. **Left as is**: anything that looked wrong but was kept on purpose, with the reason.
5. Rerun the check on the edited text and report the before and after figures.

## Examples

### Example 1: Medium edit of a landing-page hero

Prompt: "Tighten the hero copy in `hero.md` for Greyfinch, our time tracker for agencies."

```markdown
# The world's leading time tracking platform for agencies

Greyfinch empowers agencies to seamlessly leverage powerful insights in order to drive profitability. Our best-in-class solution is trusted by thousands of teams and has been designed to be very easy to use.

Time entries are automatically categorised by our AI, which means that the hours that were previously lost by your team can be recovered and billed to the clients they were worked for.

Start you're free trial today. No credit card required!
```

```text
$ python3 copycheck.py hero.md
LONG    32 words: Time entries are automatically categorised by our AI, which ...
FILLER  line 3: seamlessly
FILLER  line 3: leverage
FILLER  line 3: in order to
FILLER  line 3: very
CLAIM   line 1: leading
CLAIM   line 3: best-in-class
CLAIM   line 3: trusted by
CLAIM   line 7: free
81 words, 6 sentences, 13.5 words per sentence, Flesch reading ease 52
```

The edited copy the agent returns:

```markdown
# Time tracking that finds your agency's unbilled hours

Greyfinch records your team's time and sorts every entry automatically. Hours that used to go unrecorded show up on the invoice.

Start your free trial today. No credit card required.
```

| # | Where | Before | After | Pass | Why |
|---|---|---|---|---|---|
| 1 | Headline | "The world's leading time tracking platform" | "Time tracking that finds your agency's unbilled hours" | Claims | "Leading" has no stated basis; the new line says what the reader gets, taken from paragraph 2 |
| 2 | Para 1 | "empowers agencies to seamlessly leverage powerful insights in order to drive profitability" | "records your team's time and sorts every entry automatically" | Sentences | The original names no action the product performs |
| 3 | Para 1 | "best-in-class solution … trusted by thousands of teams … very easy to use" | removed, see queries 1 and 2 | Claims | Three unsupported claims |
| 4 | Para 2 | 32-word passive sentence | "Hours that used to go unrecorded show up on the invoice." | Sentences | Actor first, one idea |
| 5 | Call to action | "Start you're free trial" | "Start your free trial" | Proof | Wrong word |

Author queries: (1) How many agencies use Greyfinch today, and can two be named? With a figure, a proof line can go back under the headline. (2) What makes setup easy: is there a typical setup time? (3) Is there a measured figure for recovered hours? If so it belongs in the headline. (4) Does the trial really need no card in every country?

After the edit: 38 words, 7.6 words per sentence, reading ease 61.

### Example 2: Light edit of a promotional email

Prompt: "Quick proofread before this goes out to the Otter Creek Pottery list." The subject is "50% OFF EVERYTHING!!! Don't miss out"; the body says seconds are "up to 50% off" until Sunday, mentions free shipping over $60 in the first paragraph and over $50 in the footer, and ends "Its our biggest sale of the year".

The agent keeps the wording and reports four items. The subject promises half off everything while the body offers up to half off seconds only: it must match the offer, so the agent suggests "Up to 50% off seconds, this weekend only" (40 characters) and marks it as a required fix. The shipping threshold appears as both $60 and $50: query which is right. "Its" becomes "It's". "Until Sunday" gets its date. Nothing else is touched, and the log says so.

### Example 3: Interface strings in a repository

Prompt: "Clean up the checkout strings in `locales/en.json`."

```diff
-  "cart.empty": "You're cart is currently empty at this time.",
-  "cart.items": "{count, plural, one {# item} other {# items}} in you're basket",
-  "checkout.cta": "Proceed To Checkout Now",
-  "checkout.shipping": "Free Shipping on orders over {threshold}!!"
+  "cart.empty": "Your cart is empty.",
+  "cart.items": "{count, plural, one {# item} other {# items}} in your cart",
+  "checkout.cta": "Go to checkout",
+  "checkout.shipping": "Free shipping on orders over {threshold}"
```

Keys, the plural rule and both placeholders are unchanged; "basket" became "cart" because the other strings and the URL use "cart". The agent notes that other locale files now differ in meaning from the English and need the same review by someone who reads those languages.

## Guidelines

- Do not add facts. Numbers, customer names, awards, guarantees and deadlines come from the author or stay out.
- Do not flatten the voice. Humour, a regional spelling, a deliberate fragment: if it is consistent and the reader will understand it, it is style, not error.
- A readability score rewards short words and short sentences, not sense. Never trade accuracy for a better number, and do not split a sentence that is long because it is a list.
- Shorter is not always better. If cutting removes the answer to a question the reader has (price, terms, what happens next), the edit made the page worse.
- Read the final version from the top once more. Edits in one pass create errors in another: a cut sentence leaves a dangling "this", a renamed button no longer matches the text below it.
- Legal text, regulated claims (health, finance, environmental) and terms of an offer get flagged, not rewritten. Send them to whoever approves such wording.
- For copy in other languages, limit the edit to what you can verify and say so; idiom and tone need a native reader.
- Not for writing from a blank page or for deciding positioning. If the copy has nothing true and specific to say, the finding is that the page needs content, and no edit will supply it.
