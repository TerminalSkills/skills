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
compatibility: "TypeScript/JavaScript. Vitest, Jest, Mocha, or standalone."
metadata:
  author: terminal-skills
  version: "1.0.0"
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
```

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
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(value);
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
  createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date() }),
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

### Shrinking (Automatic Minimal Reproduction)

```typescript
// When a property fails, fast-check automatically finds the SMALLEST failing input

it("handles edge cases in URL parsing", () => {
  fc.assert(
    fc.property(fc.webUrl(), (url) => {
      const parsed = parseUrl(url);
      expect(parsed.protocol).toBeTruthy();
      // If this fails on a complex URL, fast-check shrinks it to
      // the simplest URL that still fails, e.g., "http://a"
    })
  );
});
```

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
- **Shrinking is automatic** — failed inputs are minimized to the simplest case
- **Built-in arbitraries cover most needs** — `string`, `integer`, `array`, `record`, `date`, `uuid`, `emailAddress`
- **`constantFrom` for enums** — `fc.constantFrom("a", "b", "c")`
- **`fc.pre(condition)` for preconditions** — skip inputs that don't meet criteria
- **Combine with example-based tests** — properties find unknowns, examples verify knowns
- **Seed for reproducibility** — failed runs print a seed; re-run with same seed to reproduce
