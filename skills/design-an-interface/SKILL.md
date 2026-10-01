---
name: design-an-interface
description: >-
  Designs the public interface of a module before any implementation exists: writes the caller
  scenarios first, produces three candidates with genuinely different shapes, type-checks each
  one against the scenarios, scores them on measurable criteria and records the decision. Use
  when someone says "design the API for this module", "what should this signature look like",
  "compare interface options", "this function is awkward to call", "show me alternatives
  before I build it", or is about to add a module, library entry point, endpoint or command
  that other code will depend on.
license: Apache-2.0
compatibility: "Any language. Proofs by type checker use TypeScript 5+ (tsc) or Python 3.10+ (mypy); candidates are drafted in parallel where the agent has sub-agents (Claude Code) and one after another elsewhere."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["api-design", "interface-design", "module-design", "software-architecture", "type-checking"]
---

# Design an Interface

## Overview

An interface is everything a caller must know to use a module: the names, the parameter and result types, the order calls have to happen in, how failures show up, and what is promised to stay stable. It is the part that costs most to change later, because every caller is written against it. This skill explores the alternatives while they are still free: caller scenarios come first, then three candidates of different shape, then a proof that each candidate can express the scenarios, a scored comparison and a short decision record. No implementation is written at any point.

## Instructions

### 1. Collect the facts

Read the project before asking anything:

- **Callers.** Search for existing or future call sites (`grep -rn "sendNotification(" src/`), count them, and note which arguments vary and which are always the same.
- **House conventions.** How do neighbouring modules report errors (exceptions or result values), are they async, how are dependencies passed in, how are things named?
- **Stability promise.** If every caller lives in this repository the interface can change later with one refactoring commit. If it is published (a package, a public HTTP route, a CLI) every incompatible change costs a major version under Semantic Versioning and a migration for people you cannot reach.

Then ask the user only what the code cannot answer: the three to five things callers need to get done, hard constraints (latency, ordering, idempotency, permissions), two changes likely in the next year, and what is out of scope.

### 2. Write the caller scenarios first

Write three to five scenarios, each one a concrete task from a caller's point of view with real inputs and the outcome it expects. Include at least one failure path and one test scenario (how a caller's own test controls or replaces the module). The scenarios are the yardstick for every later step, so get the user to confirm them before drafting signatures.

### 3. Draft three candidates of different shape

Give each candidate one shape from this list, choosing three that could plausibly fit:

| Shape | What calling it feels like | Usually suits |
|---|---|---|
| Plain functions | data in, data out, nothing to hold on to | stateless transformations, one-shot operations |
| Handle object | create once with configuration, then call methods | connections, shared settings, anything with a lifecycle |
| Declarative table | describe the wanted result as data, the module works out the steps | rules, schemas, routing, pipelines |
| Stream or events | iterate or subscribe as results arrive | long-running, large or incremental work |
| Ecosystem mirror | looks like a library the callers already use | cases where familiarity beats invention |

Where sub-agents exist (Claude Code), start all three in one message so they run concurrently and cannot see each other's drafts. Elsewhere, write them one after another, each time starting again from the scenarios. Every drafter receives the facts, the scenarios, its assigned shape and this required output:

1. Declarations only: types and signatures, no bodies.
2. Every scenario written as real calling code against those declarations.
3. What a caller has to know, and what the module keeps to itself.
4. The single channel through which each failure is reported.
5. For each of the two expected changes: does the interface absorb it, grow, or break?

Then run the difference test: put the scenario 1 code of the candidates side by side. If two differ only in names they are the same design; drop one and assign an unused shape.

### 4. Prove each candidate against the scenarios

Put the declarations and the scenario code in a scratch folder and run the type checker. Nothing is implemented; the question is only whether the scenarios can be written and whether wrong calls are rejected.

```bash
mkdir -p design/rate-limit && cd design/rate-limit
cat > tsconfig.json <<'JSON'
{ "compilerOptions": { "strict": true, "noEmit": true, "target": "ES2022", "module": "ESNext",
    "moduleResolution": "Bundler", "skipLibCheck": true, "types": ["node"] }, "include": ["*.ts"] }
JSON
# candidate-a.ts + scenarios-a.ts, candidate-b.ts + scenarios-b.ts, ...
npx -p typescript tsc -p .        # exit 0 = every scenario can be written
```

- Write the declarations in ordinary `.ts` files (`export declare function …`), not `.d.ts`: `skipLibCheck` skips every `.d.ts`, so a misspelled type in a candidate would pass unnoticed.
- Mark each wrong call that must be rejected with `// @ts-expect-error`. The compiler then fails with error TS2578 if the interface accepts the call after all.
- Python: declare the interface as a `typing.Protocol` plus dataclasses, write the scenarios as functions, run `mypy --strict notifier_draft.py scenarios.py`. A deliberate misuse carries `# type: ignore[arg-type]`; strict mode reports an unused ignore, so an interface that accepts the misuse fails the check.
- Go and Rust: an interface or trait in a scratch package, scenario functions next to it, `go vet ./...` or `cargo check`.
- HTTP and CLI surfaces have no type checker. The declarations are the route or command table with request and response bodies, and each scenario is the exact request or command line a client would send.

### 5. Score on evidence

| Measure | How to get it |
|---|---|
| Scenario fit | scenarios that needed no workaround, out of all scenarios |
| Surface | names a caller must learn for the main scenario, and in total |
| Call-site cost | lines of caller code in the most frequent scenario |
| Misuse | wrong calls that still type-check; list each one |
| Leaks | implementation facts visible in the signatures: storage, vendor, internal ids, call order |
| Change tolerance | each expected change: no change, additive or breaking |
| Test seam | can a caller's test substitute a hand-written fake that satisfies the type? |
| Failure channel | does every failure have exactly one way to surface? |

Scenario fit is a gate: a candidate that cannot express a scenario is repaired or dropped. After that, weigh fewer misuse paths and fewer leaks above shorter call sites, and when two candidates are level take the smaller surface, since a name can be exported later but never taken back without breaking someone. A hybrid is allowed only if it goes through step 4 again.

### 6. Record the decision and stop

Write the result where the project keeps design notes (an existing `docs/adr/` or `docs/design/` folder; otherwise propose `docs/design/`):

```markdown
# Rate limiter interface
Status: accepted 2026-10-01. Callers: API gateway, login route, webhook worker.
## Scenarios
## Chosen interface      (the declarations, copied from the file that passed step 4)
## Comparison            (the score table)
## Why not the others    (one paragraph each, naming the measure that decided it)
## Compatibility         (stability promise; how the two expected changes will land)
## Open questions
```

Hand the scenario file over as the first tests of the future implementation. Building the module is a separate task.

### 7. When the interface already has callers

- Group the existing call sites by argument pattern. The combinations really in use are the scenarios; the unused ones are the first things to remove.
- Plan the change in three phases: add the new interface beside the old one, move the callers in batches while the old entry point forwards to the new one and emits a deprecation warning, then delete the old entry point once a search finds no callers.
- For a published package the deprecation ships in a minor release and the removal waits for the next major.

## Examples

### Example 1: a new rate limiter (TypeScript)

Harbor Lane runs an invoicing API on Express with Redis. Facts from the code: errors are thrown, everything is async, three places need limiting. Expected changes: a token bucket instead of a fixed window, and limits that depend on the customer's plan.

Scenarios: S1 the gateway allows 120 requests a minute per API key and answers 429 with `Retry-After`; S2 login allows 5 attempts per 15 minutes per email and a successful login clears the count; S3 the webhook worker sends at most 10 deliveries a second per endpoint and waits instead of failing; S4 a test moves time forward without sleeping.

Candidates: A plain functions `hit(store, key, rule, now?)` and `reset(store, key)`; C a declarative table `defineLimits({...})` returning Express middleware; B a handle with named policies:

```ts
// candidate-b.ts
export type Span = `${number}${'s' | 'm' | 'h'}`
export type Verdict = { allowed: true; remaining: number } | { allowed: false; retryAfterMs: number }
export interface Policy {
  take(key: string): Promise<Verdict>
  forgive(key: string): Promise<void>
  waitFor(key: string, opts?: { signal?: AbortSignal }): Promise<void>
}
export interface LimiterOptions { store?: 'memory' | { redisUrl: string }; clock?: () => number }
export declare function createLimiter(options?: LimiterOptions): {
  policy(name: string, rule: { limit: number; per: Span }): Policy
}
```

```ts
// scenarios-b.ts (excerpt)
import { createLimiter } from './candidate-b'
const limiter = createLimiter({ store: { redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379' } })
const api = limiter.policy('api', { limit: 120, per: '1m' })
export async function guard(apiKey: string) {                      // S1
  const verdict = await api.take(apiKey)
  return verdict.allowed ? { status: 200 } : { status: 429, retryAfter: Math.ceil(verdict.retryAfterMs / 1000) }
}
// @ts-expect-error per must be a span such as '15m', not a bare number
limiter.policy('bad', { limit: 5, per: 900 })
```

`npx -p typescript tsc -p .` exits 0 for all three candidates. Scores:

| Measure | A functions | B policies | C table |
|---|---|---|---|
| Scenario fit | 3 of 4: S3 needs a sleep loop in the caller | 4 of 4 | 2 of 4: no reset, nothing outside HTTP |
| Surface, main / total | 4 / 5 | 4 / 9 | 2 / 2 |
| Call-site lines, S1 | 3 | 2 | 1 |
| Misuse that compiles | 3: rules can differ per call site, `now` usable in production, hand-built keys collide | 1: same policy name declared twice | 0 |
| Leaks | store type, window algorithm (`windowMs`) | Redis URL | Express request type |
| Token bucket later | breaking | no change | no change |
| Per-plan limits later | no change | additive: `limit` may become a function | additive |
| Test seam | yes, via `now` | yes, via `clock` | only through HTTP |

Decision: B. It is the only candidate that passes the gate. C's one-line middleware is kept as a possible helper built on top of B, and the Redis URL in the options is logged as an open question.

### Example 2: reshaping a function with 23 callers (Python)

A dental clinic's booking backend has `send_notification(patient_id, kind, title, body, urgent=False, email=True, sms=False, push=False, retries=3)`. Grouping the 23 call sites shows three patterns only: 14 reminders (email and SMS), 6 cancellations (all channels, urgent), 3 recalls (email). No caller ever picks channels freely, and nine files assemble the same wording by hand. The chosen candidate lets callers name the event and moves channels, wording and retries inside:

```python
# notifier_draft.py: declarations only
from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum
from typing import Protocol

class Channel(Enum):
    EMAIL = "email"
    SMS = "sms"
    PUSH = "push"

@dataclass(frozen=True)
class Reminder:
    appointment_id: int
    starts_at: datetime

@dataclass(frozen=True)
class Cancellation:
    appointment_id: int
    reason: str

@dataclass(frozen=True)
class Recall:
    due_on: date

@dataclass(frozen=True)
class Receipt:
    delivered: frozenset[Channel]
    failed: dict[Channel, str]

class Notifier(Protocol):
    def notify(self, patient_id: int, event: Reminder | Cancellation | Recall) -> Receipt: ...
```

The scenario file holds a reminder, a cancellation, a recall, a `RecordingNotifier` fake used by a caller's test, and one misuse: `fake.notify(4012, "reminder")  # type: ignore[arg-type]`.

```text
$ mypy --strict notifier_draft.py scenarios.py
Success: no issues found in 2 source files
```

Rejected: keyword-only arguments on the old function (still nine files of duplicated wording) and a message object with explicit channels (keeps a choice no caller needs). Migration: the first pull request adds `Notifier` and turns `send_notification` into a forwarding wrapper that emits a `DeprecationWarning`; the next two move the 14 reminder call sites and then the other 9; the last deletes the wrapper when `grep -rn "send_notification(" app/` returns nothing.

## Guidelines

- Three candidates that share one shape are one candidate with three spellings. The assigned shapes and the difference test exist to prevent that.
- Do not score what was not proven. "Easier to use" needs the scenario code beside it; "more flexible" needs a scenario or an expected change that requires the flexibility.
- A short call site bought by hiding a required decision in a default is a misuse path. Count it.
- Flag these in any candidate: positional booleans, a parameter that is only passed through to another layer, methods that must be called in a fixed order, a result that mixes data with an error code, storage or vendor names in signatures.
- Keep the implementation's convenience out of the comparison. How hard a candidate is to build matters only when it changes what callers experience, such as latency.
- `npx tsc` without TypeScript installed runs an unrelated package named `tsc`; use `npx -p typescript tsc`. From TypeScript 6 on, passing file names next to a `tsconfig.json` is an error (hence `-p`), and `@types` packages load only when listed in `types`. The `"types": ["node"]` entry needs `@types/node` installed in the project the scratch folder sits in; where it is missing tsc stops with TS2688, so remove the entry and keep Node globals such as `process` out of the scenarios.
- A type check proves the scenarios can be written, not that the design is right. Behaviour that types cannot express (ordering, idempotency, time limits) belongs in the scenario text and the decision record.
- Skip the full procedure for a private helper with one caller: write it, and reshape it when a second caller arrives. Use it when at least two callers, a published surface or a costly migration are in play.
