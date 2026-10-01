---
name: ubiquitous-language
description: >-
  Builds and maintains a ubiquitous language, the shared domain glossary from domain-driven
  design, out of what the team says and what the code names things. Use when someone says
  "define our domain terms", "build a glossary", "we use three words for the same thing",
  "what do we actually mean by booking", "create a ubiquitous language", or starts a DDD or
  domain-modelling effort. Harvests candidate terms from conversation, documents and code,
  resolves synonyms and overloaded words, writes short definitions with examples, tests them
  in spoken scenarios, and saves a glossary file with open questions and a code-rename list.
license: Apache-2.0
compatibility: "Any AI coding agent with file access. The optional code harvest uses grep, awk, sed and sort from a POSIX shell; nothing to install."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["domain-driven-design", "ubiquitous-language", "glossary", "domain-modeling", "naming"]
---

# Ubiquitous Language

## Overview

A ubiquitous language is the vocabulary a team agrees to use everywhere for one part of the business: in conversation with domain experts, in tickets and documents, and in the names of classes, tables and endpoints. The term comes from Eric Evans's *Domain-Driven Design*. Its point is that nobody translates: when the practice manager says "appointment" and the code says `Booking`, every discussion carries a hidden conversion step, and bugs live in that step.

A language is valid inside a bounded context, the part of the system where one model applies. The same word may mean something else in another context, and that is allowed as long as the boundary is written down.

This skill produces one file, the glossary, and keeps it current. It collects the words in use, finds where they collide, proposes one name per concept, writes definitions a newcomer could apply, checks them by speaking scenarios, and lists what in the code no longer matches.

## Instructions

### 1. Fix the context and find the sources

Look in the repository first: an existing glossary (`docs/ubiquitous-language.md`, `GLOSSARY.md`, `docs/glossary.md`, `CONTEXT.md`), domain documents, ticket exports, and the code itself. If a glossary exists, update it in place; do not start a second one.

Ask the user only what the files cannot tell you:

1. Which part of the business is this for? (One bounded context per glossary section: "scheduling", not "the clinic".)
2. Who has the final word on a term: which domain expert, and are they in this conversation?
3. Are there words the team already argues about?

### 2. Harvest candidate terms

From speech and writing (the conversation, meeting notes, tickets, UI copy): collect nouns for things and roles, verbs for what people do, past-tense phrases for things that happened ("checked in", "written off"), and adjectives used as states ("overdue", "on hold"). Keep the speaker with each word; who says it matters later.

From code, count the words inside type names so the dominant vocabulary shows up:

```bash
grep -rhoE "\b(class|interface|type|enum)\s+[A-Z][A-Za-z0-9]+" src --include="*.ts" \
  | awk '{print $2}' | sed -E 's/([a-z0-9])([A-Z])/\1 \2/g' | tr ' ' '\n' \
  | sort | uniq -c | sort -rn | head -40
```

Adapt the pattern to the language (`class` and `def` for Python, `type` and `struct` for Go). Also read the database schema, API routes, enum values and status codes; states often exist only as numbers or one-letter codes there. Ignore framework words (`Service`, `Controller`, `Job`, `Input`).

### 3. Find the collisions

Sort every candidate into concepts and label what you find:

| Finding | How it shows up | What to do |
|---|---|---|
| Synonyms | several words, one concept: "booking", "reservation", "slot" | choose one name (step 4) |
| Overloaded word | one word, several concepts: "visit" as the plan and as what happened | give each concept its own name |
| Different contexts | the word is right in two parts of the business with different meanings | keep both, one per context, and say how they relate |
| Container word | "item", "record", "data", "info", "entry", "manager" | ask "which kind?" until a domain noun appears |
| Technical leak | "row", "payload", "DTO", "flag", "cron job" used in domain talk | replace with the business name; if the business has no name for it, leave it out |
| Unnamed concept | people describe it with a phrase every time | propose a name and mark it as proposed |
| Speech and code disagree | experts say one word, the code another | record under code drift (step 7) |
| Coded state | `status = 3`, `'P'` | name every state and what moves a thing between them |

### 4. Choose the name

When several words compete, prefer them in this order:

1. the word the domain experts use with each other
2. the word in contracts, regulation, or the screens customers see
3. the more specific word over the more general one
4. the word already dominant in the code, as a tiebreaker only

The other words go in the "Do not say" column, so readers searching for them find the right term. The agent proposes and the expert decides: when the conversation does not settle a choice, write it under open questions with the options and a recommendation. Never record a guess as a definition.

### 5. Write the definitions

- Shape: "A [broader kind] that [what sets it apart]." One or two sentences.
- Use plain words and other glossary terms, capitalised. No implementation words: no "table", "id", "JSON".
- State the edges: when the thing starts to exist, when it stops, and the nearest thing it is not.
- Add one example with real-looking values.
- Give each term a kind, using the standard DDD names where they fit: Entity (has identity over time), Value Object (defined by its values), Domain Event (something that happened), plus Role, Action and State.
- Check: could a new colleague decide, for a real case in front of them, whether it is one or not?

### 6. Test the language by using it

Write three to five scenarios, short stories of the domain told only in glossary terms, and read them back to the expert or the user. Evans's advice is to describe scenarios out loud with the elements of the model. A scenario fails when it needs a word that is not in the glossary, when a term has to be bent to fit, or when the expert says "we would never say it like that". Fix the glossary and repeat.

Also write the rules the scenarios revealed as plain sentences ("An Appointment is for exactly one Patient"). They are the first draft of the model's invariants.

### 7. Write the file

Default path `docs/ubiquitous-language.md`, or the existing glossary. Use this layout:

```markdown
# Ubiquitous Language: Scheduling (Linden Road Veterinary Clinic)

Context: appointments and visits at the front desk. Not covered: billing, pharmacy stock.
Sources: call with Marta Lind (practice manager), 2026-09-24; `src/scheduling/`.
Last reviewed: 2026-10-01 with Marta Lind.

## Terms

| Term | Kind | Meaning | Example | In code | Do not say |
|---|---|---|---|---|---|
| Patient | Entity | An animal registered with the clinic for care. | Biscuit, a 4-year-old beagle | `Patient` | pet, animal |

## Rules
- An Appointment is for exactly one Patient and one Vet.

## Scenarios
1. Dana Okafor, an Owner, books an Appointment for her Patient Biscuit with Dr Imre.

## Decisions
| Date | Question | Decision | Decided by |
|---|---|---|---|

## Open questions
- Can one Patient have two Owners? Recommendation: ask Marta Lind before modelling it.

## Code drift
| Code name | Where | Should be | Status |
|---|---|---|---|
```

A glossary with two contexts gets two `## Context:` sections, each with its own Terms table, and a short "Between contexts" list that says how the terms map ("a Scheduling Owner is a Billing Account Holder").

Then report in chat: number of terms, the decisions made, each open question with your recommendation, and the size of the code drift list.

### 8. Keep it alive

- Add one line to the project's agent instruction file (`CLAUDE.md` or `AGENTS.md`): "Domain terms are defined in `docs/ubiquitous-language.md`. Use them in code, tests and messages; do not introduce synonyms."
- Renaming code to match is a separate change, not part of writing the glossary. Use the language server's rename or a syntax-aware tool, one term per commit, and treat database columns and public API fields as migrations.
- A change in the language is a change in the model: update the file in the same pull request as the rename or the new concept.
- On a later run, edit entries in place, add a dated row to Decisions for every change of meaning or name, and move settled questions out of Open questions.

## Examples

### Example 1: From a discovery conversation

The user pastes notes from a call about a veterinary clinic's scheduling tool and says "turn this into our ubiquitous language". The notes use "client", "owner" and "customer" for the same person; "pet", "animal" and "patient"; and "appointment", "booking" and "visit" loosely. One line reads: "a visit is when they actually show up, walk-ins have no appointment". The agent writes:

```markdown
## Terms

| Term | Kind | Meaning | Example | In code | Do not say |
|---|---|---|---|---|---|
| Patient | Entity | An animal registered with the clinic for care. | Biscuit, a 4-year-old beagle | `Patient` | pet, animal |
| Owner | Role | The person responsible for a Patient and for paying for its care. | Dana Okafor, Owner of Biscuit | `Client` | client, customer |
| Appointment | Entity | A reserved time for one Patient with one Vet. Exists from booking until it is checked in, cancelled or missed. | 14 Oct 09:30, Biscuit with Dr Imre | `Booking` | booking, slot |
| Visit | Entity | What happened when a Patient was seen. Starts at Check-in, ends at discharge. | Biscuit's Visit on 14 Oct, 09:41 to 10:05 | `Visit` | appointment |
| Walk-in | State | A Visit that began without an Appointment. | | `Visit.appointmentId = null` | drop-in |
| Check-in | Action | The front desk confirms the Patient has arrived; this starts the Visit. | | `startVisit()` | arrival |
| No-show | Domain Event | An Appointment whose Patient was not checked in by the cut-off. | | `AppointmentMissed` | DNA, missed |

## Rules
- A Visit exists only after Check-in. A Walk-in has a Visit and no Appointment.
- An Appointment leads to at most one Visit.

## Scenarios
1. Dana Okafor, an Owner, makes an Appointment for her Patient Biscuit with Dr Imre on 14 Oct at 09:30.
2. At 09:41 the front desk does the Check-in; Biscuit's Visit begins.
3. Dana's other Patient, Miso, comes along unannounced and is seen as a Walk-in: a Visit, no Appointment.
4. Biscuit does not arrive for a later Appointment; after the cut-off it becomes a No-show.

## Open questions
- How long after the start time does an Appointment become a No-show? The notes say "about fifteen minutes". Recommendation: fix one number with Marta Lind.
- Can one Patient have two Owners (a couple)? The notes do not say. Recommendation: ask before modelling Owner as a single field.

## Code drift
| Code name | Where | Should be | Status |
|---|---|---|---|
| `Client` | `src/scheduling/client.ts`, table `clients` | `Owner` | to rename; table needs a migration |
| `Booking` | `src/scheduling/booking.ts` | `Appointment` | to rename |
```

Chat summary: "7 terms, 2 rules, 4 scenarios. Chose Owner over client and customer (Marta's word; 'client' is also used for the desktop app). Two questions need Marta. Two code names differ from the language."

### Example 2: From an existing codebase

Request: "Nobody agrees what a booking is. Build the glossary from the code." The harvest over a tool-rental service prints:

```text
      5 Booking
      4 Service
      3 Rental
      3 Item
      2 Reservation
      2 Job
      2 Customer
      1 User
```

Further down, `Hire`, `Equipment` and `Asset` appear once each. Reading the files shows that `ReservationHold` is a 15-minute lock created during checkout, `Booking` is the confirmed order, `Rental*` types exist only in billing, and `BookingStatus` is `1` to `5`. The agent asks the user two questions (what the shop staff say at the counter, and whether a hold is visible to customers), then writes a glossary in which:

- Booking, Rental and Hire turn out to be one concept at different stages. The staff word is Rental, so the term is **Rental** with named states: Requested, Confirmed, Out, Returned, Cancelled, replacing the numbers 1 to 5.
- **Hold** stays a separate term: a temporary lock on a Tool while a customer checks out, never shown as a Rental.
- Item, Equipment and Asset become **Tool** (an individual, serial-numbered piece) and **Tool Type** (the catalogue entry with a day rate). This split was the hidden cause of the argument: `Item` meant both.
- The code drift table lists 13 type names in three folders, with `Booking` to `Rental` first because it touches the public API and needs a versioned change.

## Guidelines

- Fewer, sharper terms beat coverage. When the list for one context runs into the hundreds, generic programming words got in or several contexts are mixed.
- Only domain words belong. "Endpoint", "array" and "cache" stay out unless the business itself uses them.
- Do not settle a real disagreement between experts by picking a side. Record both positions under Open questions and name who should decide.
- One word may legitimately differ between contexts. Forcing a single company-wide definition of "customer" or "product" usually produces a definition nobody can use; split by context instead.
- A glossary nobody speaks is documentation, not a language. The test is whether the terms show up in the next conversation, ticket and pull request.
- Translate carefully in multilingual teams: keep the experts' own word as the term, give the English code name beside it, and do not invent an English word the experts never use.
- Do not rename code silently while writing the glossary, and never rename persisted or public names (columns, event types, API fields) without a migration plan.
- Not the right tool: a general technical glossary for onboarding, an API reference, or a data dictionary of every column. Those describe the implementation; this describes the business.
