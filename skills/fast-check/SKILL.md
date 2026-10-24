---
name: fast-check
description: >-
  Find edge-case bugs with property-based testing using fast-check — generate
  thousands of random inputs automatically. Use when someone asks to "find
  edge cases", "fast-check", "property-based testing", "fuzz testing in
  TypeScript", "generate random test data", "QuickCheck for JavaScript",
  or "test with random inputs". Covers property definitions, arbitraries,
  shrinking, model-based testing, and integration with Vitest/Jest.
license: Apache-2.0
compatibility: "Node.js 12.17+ (fast-check 4.x). Works with Vitest, Jest, Mocha, or standalone."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/dubzzz/fast-check"
  category: development
  tags: ["testing", "property-based", "fast-check", "fuzzing", "edge-cases"]
---

# fast-check

## Overview

fast-check is a property-based testing framework — instead of writing specific test cases, you describe properties that should always hold, and fast-check generates thousands of random inputs to try to break them. When it finds a failing input, it automatically shrinks it to the minimal reproducing case. Catches edge cases you'd never think to test: empty strings, negative numbers, Unicode, massive arrays, boundary values.

## When to Use

- Functions with many possible inputs (parsers, validators, serializers)
- Finding edge cases in business logic (pricing, permissions, date handling)
- Testing serialization/deserialization roundtrips (encode → decode = original)
- Verifying mathematical properties (commutativity, associativity)
- Replacing hand-written test cases with generated ones

## Instructions

### Setup

```bash
npm install -D fast-check
# optional: test.prop / it.prop helpers for the test runner
npm install -D @fast-check/vitest    # Vitest 4 or 5
npm install -D @fast-check/jest      # Jest
```

fast-check 4.x is the current major (4.10 at the time of writing). It is runner-agnostic: `fc.assert` throws when a property fails, so any runner reports it as a failed test. A property passes when its predicate returns `true` or returns nothing, and fails when it returns `false` or throws.

### Basic Properties

```typescript
// math.test.ts — Property-based testing for math functions
import fc from "fast-check";
import { describe, it, expect } from "vitest";

describe("sort", () => {
  it("should produce an array of same length", () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        const sorted = [...arr].sort((a, b) => a - b);
        return sorted.length === arr.length;
      })
    );
  });

  it("should produce ordered output", () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        const sorted = [...arr].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i]).toBeGreaterThanOrEqual(sorted[i - 1]);
        }
      })
    );
  });

  it("should contain the same elements", () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        const sorted = [...arr].sort((a, b) => a - b);
        expect(sorted).toEqual(expect.arrayContaining(arr));
        expect(arr).toEqual(expect.arrayContaining(sorted));
      })
    );
  });
});
```

With `@fast-check/vitest` the same property reads as one test, and Vitest names the failing case for you:

```typescript
import fc from "fast-check";
import { expect } from "vitest";
import { test } from "@fast-check/vitest";

test.prop([fc.array(fc.integer())])("sorted copy keeps the length", (arr) => {
  expect([...arr].sort((a, b) => a - b)).toHaveLength(arr.length);
});

test.prop({ a: fc.integer(), b: fc.integer() })("addition commutes", ({ a, b }) => {
  expect(a + b).toBe(b + a);
});
```

### Roundtrip Testing

```typescript
// serialization.test.ts — Encode/decode roundtrips
import fc from "fast-check";
import { encode, decode } from "./my-codec";

it("decode(encode(x)) === x for any string", () => {
  fc.assert(
    fc.property(fc.string(), (original) => {
      const encoded = encode(original);
      const decoded = decode(encoded);
      expect(decoded).toEqual(original);
    })
  );
});

it("JSON roundtrip preserves data", () => {
  fc.assert(
    fc.property(fc.jsonValue(), (value) => {
      const json = JSON.stringify(value);
      // compare serialized forms: jsonValue can yield -0, which JSON turns into 0
      // and toEqual treats as different
      expect(JSON.stringify(JSON.parse(json))).toBe(json);
    })
  );
});
```

### Custom Arbitraries

```typescript
// business.test.ts — Custom data generators for domain objects
import fc from "fast-check";

// Generate realistic user objects
const userArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  email: fc.emailAddress(),
  age: fc.integer({ min: 13, max: 120 }),
  role: fc.constantFrom("admin", "user", "viewer"),
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date(), noInvalidDate: true }),
});

// Generate realistic money amounts
const moneyArbitrary = fc.record({
  amount: fc.integer({ min: 0, max: 1_000_000 }),  // Cents
  currency: fc.constantFrom("USD", "EUR", "GBP"),
});

it("discount should never result in negative price", () => {
  fc.assert(
    fc.property(
      moneyArbitrary,
      fc.integer({ min: 0, max: 100 }),  // Discount percentage
      (price, discountPercent) => {
        const discounted = applyDiscount(price, discountPercent);
        expect(discounted.amount).toBeGreaterThanOrEqual(0);
      }
    )
  );
});

it("total should equal sum of line items", () => {
  fc.assert(
    fc.property(
      fc.array(moneyArbitrary, { minLength: 1, maxLength: 50 }),
      (items) => {
        const total = calculateTotal(items);
        const expected = items.reduce((sum, item) => sum + item.amount, 0);
        expect(total).toBe(expected);
      }
    )
  );
});
```

Note `noInvalidDate: true` above: in fast-check 4, `fc.date()` can produce `new Date(NaN)` unless you set it. `fc.string()` already yields printable characters; pass `{ unit: "grapheme" }` or `{ unit: "binary" }` for emoji and arbitrary code points.

### Shrinking (Automatic Minimal Reproduction)

When a property fails, fast-check shrinks the input to the smallest value that still fails and prints it with the seed:

```typescript
it("integers stay below 100", () => {
  fc.assert(fc.property(fc.integer(), (n) => n < 100));
});
```

```console
Error: Property failed after 10 tests
{ seed: -140117601, path: "9:1:0:0:...:2:0:0", endOnFailure: true }
Counterexample: [100]
Shrunk 27 time(s)
```

Replay exactly that case by passing the printed values back: `fc.assert(prop, { seed: -140117601, path: "9:1:0:0:...:2:0:0" })`. The path jumps straight to the shrunk counterexample.

### Model-Based Testing

For stateful code, generate random sequences of commands and run them against both the real object and a simple model:

```typescript
import fc from "fast-check";
import { it, expect } from "vitest";

class Counter { n = 0; inc() { this.n++; } dec() { if (this.n > 0) this.n--; } }
type Model = { count: number };

class IncCommand implements fc.Command<Model, Counter> {
  check() { return true; }
  run(m: Model, r: Counter) { m.count++; r.inc(); expect(r.n).toBe(m.count); }
  toString() { return "inc"; }
}
class DecCommand implements fc.Command<Model, Counter> {
  check(m: Readonly<Model>) { return m.count > 0; }  // only run when valid
  run(m: Model, r: Counter) { m.count--; r.dec(); expect(r.n).toBe(m.count); }
  toString() { return "dec"; }
}

it("counter behaves like its model", () => {
  const commands = fc.commands(
    [fc.constant(new IncCommand()), fc.constant(new DecCommand())],
    { maxCommands: 50 }
  );
  fc.assert(
    fc.property(commands, (cmds) => {
      fc.modelRun(() => ({ model: { count: 0 }, real: new Counter() }), cmds);
    })
  );
});
```

If the real object diverges from the model, the counterexample lists the shortest command sequence that exposes it (each command's `toString()`). Use `fc.asyncModelRun` with `fc.asyncProperty` when commands are async.

### Async Code

```typescript
it("fetchUser never throws for valid ids", async () => {
  await fc.assert(
    fc.asyncProperty(fc.uuid(), async (id) => {
      const user = await fetchUser(id);
      expect(user.id).toBe(id);
    })
  );
});
```

Always `await` `fc.assert` for async properties, otherwise the test passes before the property runs.

## Examples

### Example 1: Test a parser for edge cases

**User prompt:** "My CSV parser breaks on weird inputs. Find all the edge cases."

The agent will write properties like "parse(serialize(data)) === data", generate random CSV data with edge cases (commas in fields, newlines, empty cells, Unicode), and identify failing inputs.

### Example 2: Verify pricing logic

**User prompt:** "Test our discount calculation to make sure it never produces negative prices or rounding errors."

The agent will generate random prices, discount percentages, and coupon combinations, then verify invariants (non-negative, correct rounding, order doesn't matter).

## Guidelines

- **Think in properties, not examples** — "sorted output is ordered" not "sort([3,1,2]) = [1,2,3]"
- **Roundtrip is the easiest property** — `decode(encode(x)) === x`
- **`fc.assert` runs 100 iterations by default** — increase with `{ numRuns: 1000 }`
- **Array `.sort()` without a comparator sorts as strings** — `[1000000000, 2].sort()` puts 2 last; fast-check finds this in a few runs, so give numeric sorts `(a, b) => a - b`
- **`fc.sample(arbitrary, 3)` prints example values** — use it to see what an arbitrary generates before relying on it
- **Shrinking is automatic** — failed inputs are minimized to the simplest case
- **Built-in arbitraries cover most needs** — `string`, `integer`, `array`, `record`, `date`, `uuid`, `emailAddress`
- **`constantFrom` for enums** — `fc.constantFrom("a", "b", "c")`
- **`fc.pre(condition)` for preconditions** — skip inputs that don't meet criteria
- **Combine with example-based tests** — properties find unknowns, examples verify knowns
- **Seed for reproducibility** — failed runs print `seed` and `path`; pass both to `fc.assert` to replay the shrunk failure, and add `verbose: 2` to log every tried value
- **Make properties deterministic** — no `Date.now()` or `Math.random()` inside a property, or a replayed seed will not reproduce
