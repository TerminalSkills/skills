---
name: company-values
description: >-
  Guides a founder from real decisions to a short set of written company values
  that people can act on: collects incidents, tests each candidate value, writes
  it as a trade-off with behaviors and a story, and wires it into hiring,
  feedback and promotion. Use when someone asks to "define our company values",
  "write a values document", "our values are generic, fix them", "turn our
  values into interview questions", "what should our culture be before we
  hire", or wants to check whether the team lives the values it has. Produces
  VALUES.md, an evidence log and an interview kit.
license: Apache-2.0
compatibility: "Any agent that can hold a conversation and write Markdown files. Needs no tools; works best with access to the company's handbook, job posts and past decision notes. Sized for founder-led teams of up to about 100 people."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["company-values", "culture", "founders", "hiring", "leadership"]
---

# Company Values

## Overview

A company value is a trade-off the company makes the same way every time, written down so a new hire can predict the decision without asking. Most published values fail that definition. A study of 689 large organizations published in MIT Sloan Management Review found that 82% publish official values and that there is no correlation between the values a company announces and how employees rate it on them; fewer than a quarter explain how the values help the business succeed. Economists who studied the same question (the NBER paper "The Value of Corporate Culture") found that proclaimed values are unrelated to performance, while employees' view of whether managers act with integrity is related to it.

So the work is not choosing nice words. It is finding what the company already does when it costs something, deciding which of those habits to keep, and attaching them to the decisions people watch: who is hired, praised, promoted and let go. This skill runs that process with a founder and produces three files: `VALUES.md`, `values-evidence.md` and `values-interview-kit.md`.

## Instructions

### 1. Establish the situation

Ask before drafting anything:

- How many people, how long together, and why now: first hires, fast growth, a painful departure, a merger, or old values nobody quotes.
- Who decides. Founders or the leadership team decide; the team supplies evidence. A vote produces a list nobody objects to, which is the generic list.
- What already exists: earlier values, handbook, job posts, review forms, incident reviews, notes from hard decisions. Read them if they are in the workspace.
- Where the result will be used first (the next hire, the next review cycle), so step 7 has a deadline.

### 2. Collect incidents, not adjectives

Use the critical incident technique: gather specific past events in which someone's behavior clearly helped or hurt, and work from those. Aim for ten to fifteen incidents. Prompts that surface them:

- A decision from the last year that cost money, time or a customer and that you would make again.
- The last time you were proud of someone here without being asked to be. What exactly did they do?
- Someone whose results were good and whose way of working still was not right. What did they do?
- A time two good things collided: speed and polish, a customer's request and the roadmap, candor and calm. Which won?
- What a new person most often gets wrong in the first month.
- A habit of the founders that would worry you if every new hire copied it.

When the team is larger than about ten, collect incidents from employees in writing as well. Leaders tend to describe what they hope is true; the rest of the team describes what happens. Log each incident in `values-evidence.md`:

```markdown
| # | Situation | What the person did | What it cost | Outcome | Told by |
|---|-----------|---------------------|--------------|---------|---------|
| 4 | Largest customer asked for a custom export two weeks before renewal | Noor declined, offered the standard API and a migration call | Risked a 38,000 EUR renewal | Renewed for one year instead of three | Felix |
```

Refuse to continue on adjectives alone. If the founder says "we value ownership", ask for the last time someone showed it and what it cost.

### 3. Group into candidate values

Sort incidents by the trade-off they show, not by topic. Keep three to five candidates: in the study above nearly three-quarters of companies listed between three and seven values, and a short list is the one people can recite. Each candidate needs at least two incidents behind it. A candidate with no incident is an aspiration: either drop it, or keep it labeled as an aspiration with one concrete commitment and a date.

### 4. Test every candidate

| Test | Question | If it fails |
|---|---|---|
| Opposite | Would a sensible, well-run company choose the opposite? | It is a minimum standard (honesty, respect, safety). Move it to the code of conduct. |
| Cost | What did we give up for this in the last twelve months? | It is not a value yet. Drop it or mark it as an aspiration. |
| Observable | Could two people watch the same event and agree whether it fit? | Rewrite until it names behavior. |
| Decision | Take three decisions pending this month. Does the value change any of them? | It is decoration. Sharpen the trade-off or drop it. |
| Lawful | Does it ask for anything the law forbids or punish anything the law protects? | Rewrite with employment counsel. |

Show the founder the result of each test. Losing a favorite word here is the point of the exercise.

### 5. Write each value in one fixed shape

A name in the team's own words, one sentence stating what is chosen over what, why that choice helps this business, three observable behaviors, the limits (how the value gets misread), and the story:

```markdown
### Say no early

We tell a customer what we will not build before they sign, even when it puts the deal at risk.

**Why it helps us win:** nine people cannot maintain one-off features. Every exception slows the product every other customer pays for.

**What it looks like**
- Sales calls end with a written list of what is out of scope.
- A request outside the roadmap gets an answer within two working days, with the reason.
- Anyone can refuse a custom request without asking a founder first.

**Limits:** this is not a licence to stop listening. Requests are logged, and three customers asking for the same thing reopens the question.

**Story:** in March our largest customer asked for a custom export two weeks before renewal. Noor declined and offered the API and a migration call instead. They renewed for one year, not three. We would do it again.
```

Use the incident as the story, with the person's permission. Write behaviors that start with what someone does, not with what they are.

### 6. Rank them

Values collide. Put them in order and say that the order is a weighting, not an override: a large gain on a lower value can outweigh a small loss on a higher one. Add one worked collision from the evidence log so the ranking is not abstract.

### 7. Wire them into decisions

A value that no decision depends on will not survive. For each place below, write what changes, who owns it and by when:

```markdown
| Where | What changes | Owner | By |
|---|---|---|---|
| Hiring | One behavioral question per value, asked of every candidate, scored 1-3 against written anchors by two interviewers separately | Felix | 14 Nov |
| Feedback | Praise and criticism name the behavior and the value, never a trait | All leads | now |
| Promotion and pay | The written case cites two incidents per value | Noor | Q1 review |
| Decisions | A decision that trades one value against another records which one won | Whoever decides | now |
| Onboarding | New hires hear the stories from the people in them, in week one | Noor | next hire |
```

For hiring, `values-interview-kit.md` holds, for each value, a question about past behavior, follow-up probes on situation, action and outcome, and a three-level scale:

```markdown
### Say no early
Question: Tell me about a time you turned down a request from a customer or a senior colleague. What was at stake and what did you do?
Probes: What led up to it? What exactly did you say? What happened afterwards? What would you do differently?
3 - Refused early and directly, explained the reason, offered an alternative, and can describe the cost.
2 - Refused, but late or through someone else; the cost is vague.
1 - Has no example, or agreed and let it fail quietly.
```

Score the answer, not the likeness to the current team. "Fit" judged by feel selects for similarity and is where unstructured interviews go wrong.

### 8. Check and revise

Six months after publishing, and yearly after that, ask everyone one question per value: "In the last month I saw this happen" (yes, no, not sure), with room for an example. Compare founders' answers with everyone else's. Add at least one new incident per value to the evidence log each quarter; a value with no fresh incident is going stale. Change behaviors before changing names, remove what no longer drives a decision, and date every version.

## Examples

### Example 1: First values before a hiring round

Noor Haddad and Felix Brandt run Lanternfish Analytics: nine people who build energy-monitoring dashboards for factories, about to hire four more. They ask for "five values, something like ownership, excellence, customer focus".

The agent asks for incidents instead and logs twelve. Grouping gives five candidates (incidents 10 and 12 fit no pattern and stay in the log), and the tests change the list:

```markdown
| Candidate | Incidents | Opposite | Cost | Verdict |
|---|---|---|---|---|
| Customer focus | 2, 4, 9 | fails: nobody chooses to ignore customers | - | Dropped as worded; all three incidents are about refusing custom work, so it becomes "Say no early" |
| Excellence | none | fails | none named | Dropped; the founders could not name an incident |
| Measure before arguing | 3, 5, 11 | passes: many good teams decide on experience | A pricing change waited three weeks for usage data | Kept |
| Never touch a running line | 1, 6, 7 | passes: most software firms deploy in working hours | Releases go out at shift change, twice a month on a Sunday evening, repaid in time off | Kept, ranked first |
| Honesty | 8 | fails | - | Moved to the code of conduct |
```

`VALUES.md` ends with three values in ranked order: Never touch a running line, Say no early, Measure before arguing, each in the shape from step 5. The collision example comes from incident 7: a fix for a wrong consumption figure was ready at 14:00 and still waited for the 22:00 shift change, because a customer's production line outranks the wish to correct a number fast. The interview kit has three questions, and the hiring leads for the four open roles get it before the first interview on 14 November.

### Example 2: Replacing poster values at a forty-person company

Ostrava Bread Co. has 41 staff across a bakery and three shops. The wall says "Excellence, Teamwork, Passion". Owner Tereza Malikova says nobody could tell her what they mean.

All three fail the opposite test, and no one can name a cost for any of them. The agent has the owner and the two shift leads each bring five incidents, and collects 23 more from staff on paper. Two patterns dominate: bakers throwing out a batch that was merely acceptable (six incidents, about 300 EUR of flour and labor each time), and shop staff closing a till ten minutes late so that a regular can collect an order (five incidents, unpaid in three of them).

The first becomes "Bin it if you would not buy it", with the cost stated. The second exposes a problem before it can become a value: the behavior is admired, but working unpaid is a wage-law problem, so it fails the lawful test as it stands. The agent flags it, the owner changes the rota so closing staff are paid until the last order is collected, and the value is written as "The regular gets their order", with "this never means working unpaid" under its limits.

Six months later the check from step 8 comes back: for "Bin it if you would not buy it", 36 of 41 saw it happen in the last month; for "The regular gets their order", 19 of 41, nearly all of them shop staff. The agent recommends keeping the wording and adding a bakery behavior to the second value, not a new slogan.

## Guidelines

- Never draft values from a brainstorm of adjectives. With no incidents the honest output is a list of questions for the founder, not a document.
- Keep legal and ethical minimums out of the values. They belong in a code of conduct that applies whether or not anyone finds them inspiring.
- Label aspirations as aspirations. The gap between what is announced and what is lived is what employees notice first, and it turns the whole document into a joke.
- Founders are the evidence. If the founders' own incidents contradict a value, say so plainly; people judge the values by what leaders do, and the research above says that is what counts.
- Use values to describe behavior, not character. "You refused the request late and through a colleague" is feedback; "you lack ownership" is a verdict.
- Have counsel read anything that touches pay, working time or what employees may say. In the United States, for example, a value that discourages staff from discussing pay conflicts with labor law for most private-sector employees.
- Do not use this skill for a solo founder with no team: there is no behavior to observe yet. Write working principles for yourself and return after the first five hires.
- Do not use it to respond to misconduct. That needs an investigation and consequences first; a values workshop in its place reads as avoidance.
- Above roughly 100 people the founders' incidents stop being representative. Add a survey and group interviews, or bring in someone who does organizational research.
