---
name: hypothesis
description: >-
  Hypothesis is a Python library for property-based testing: a test states a
  rule that must hold for all inputs, and Hypothesis generates hundreds of
  inputs, including edge cases, then reports the simplest one that breaks the
  rule. Use when a user asks to write property-based tests, fuzz a Python
  function, find edge cases, test a round trip such as encode and decode,
  write stateful tests, reproduce a failing Hypothesis example, or tune
  Hypothesis settings and profiles for pytest and CI.
license: Apache-2.0
compatibility: "Python 3.10+ (CPython or PyPy); runs under pytest or unittest"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["property-based-testing", "python", "testing", "pytest", "fuzzing"]
  repository: https://github.com/HypothesisWorks/hypothesis
---
# Hypothesis — Property-based testing for Python

## Overview

An ordinary test checks a few hand-picked inputs. A Hypothesis test describes the inputs with a strategy and asserts something that must be true for every one of them. Hypothesis runs the test 100 times by default with generated values, remembers failures, and shrinks a failing input to a minimal one. It fits pure functions, parsers, serializers, money and date arithmetic, and any code with an invariant that can be written down.

## Instructions

### Installation

```bash
pip install hypothesis pytest
pip install "hypothesis[cli]"      # adds the `hypothesis` command, including `hypothesis write`
```

Integrations come as extras with their own dependencies, among them `numpy`, `pandas`, `django`, `dateutil`, `pytz`, `lark`, `redis` and `codemods`: for example `pip install "hypothesis[numpy]"`.

### Write a property test

```python
from hypothesis import given, strategies as st

from billing.installments import split_installments


@given(
    total_cents=st.integers(min_value=0, max_value=5_000_000),
    count=st.integers(min_value=1, max_value=36),
)
def test_installments_add_up_to_the_total(total_cents, count):
    parts = split_installments(total_cents, count)
    assert len(parts) == count
    assert sum(parts) == total_cents
```

```bash
pytest tests/test_installments.py
```

The test is a normal function; pytest and unittest collect it as usual. `@given` fills arguments from the right, so a pytest fixture goes first in the signature, or all strategies are passed by keyword as above.

Properties that work well: a round trip returns the original (`decode(encode(x)) == x`), an invariant holds (sum, length, ordering), two implementations agree, an operation applied twice equals applying it once, valid input never raises.

### Choose strategies

| Strategy | Generates |
|---|---|
| `st.integers(min_value=0, max_value=120)` | integers in a range |
| `st.floats(min_value=0, max_value=1e6, allow_nan=False)` | floats; without bounds also `nan` and `inf` |
| `st.decimals(min_value="0.00", max_value="9999.99", places=2)` | `Decimal` values for money |
| `st.text(min_size=1, max_size=40)` | Unicode strings |
| `st.from_regex(r"[A-Z]{3}-[0-9]{4}", fullmatch=True)` | strings that match a pattern |
| `st.lists(st.integers(), min_size=1, unique=True)` | lists; also `st.sets`, `st.tuples`, `st.dictionaries` |
| `st.fixed_dictionaries({"sku": st.text(), "qty": st.integers(1, 20)})` | dictionaries with fixed keys |
| `st.sampled_from(["EUR", "USD", "GBP"])` | one of the given values, or an `Enum` member |
| `st.dates()`, `st.datetimes()`, `st.timedeltas()` | date and time values |
| `st.booleans()`, `st.none()`, `st.uuids()`, `st.emails()` | the named types |
| `st.one_of(st.none(), st.integers())` | a value from any of the strategies |
| `st.builds(Order, sku=st.text(), qty=st.integers(1, 20))` | instances of a class or results of a callable |
| `st.from_type(Order)` | a strategy derived from type annotations |

### Shape and combine inputs

```python
from hypothesis import assume, given, strategies as st

even_numbers = st.integers().map(lambda n: n * 2)
nonzero = st.integers().filter(lambda n: n != 0)


@st.composite
def date_ranges(draw):
    start = draw(st.dates())
    end = draw(st.dates(min_value=start))
    return (start, end)


@given(date_ranges())
def test_range_is_ordered(date_range):
    start, end = date_range
    assert start <= end


@given(st.integers(), st.integers())
def test_remainder_is_smaller_than_divisor(a, b):
    assume(b != 0)
    assert abs(a % b) < abs(b)
```

`.map` transforms values, `.filter` rejects values of one strategy, and `assume` rejects a whole test case. `@st.composite` builds inputs that depend on each other. When values must be drawn in the middle of a test, take `st.data()` as an argument and call `data.draw(strategy)`.

### Keep failures reproducible

```python
from hypothesis import example, given, strategies as st

from billing.installments import split_installments


@example(total_cents=1, count=2)
@given(total_cents=st.integers(0, 5_000_000), count=st.integers(1, 36))
def test_installments_add_up_to_the_total(total_cents, count):
    assert sum(split_installments(total_cents, count)) == total_cents
```

`@example` runs that exact input on every run, before the generated ones. Failures are also stored in the `.hypothesis/` directory and replayed first on the next run. To replay a CI failure locally, copy the `@reproduce_failure(...)` line from the CI output onto the test for the duration of the debugging session, or run `pytest --hypothesis-seed=20260914` with the seed you want.

### Settings and profiles

```python
import os

from hypothesis import Verbosity, settings

settings.register_profile("dev", max_examples=25)
settings.register_profile("ci", settings.get_profile("ci"), max_examples=500)
settings.register_profile("debug", max_examples=10, verbosity=Verbosity.verbose)
settings.load_profile(os.getenv("HYPOTHESIS_PROFILE", "dev"))
```

This belongs in `tests/conftest.py`. `HYPOTHESIS_PROFILE` is a variable this snippet reads; Hypothesis does not read it by itself. A single test is tuned with a decorator such as `@settings(max_examples=1000, deadline=None)`, placed above or below `@given`.

Two profiles are built in. `default` uses `max_examples=100` and a `deadline` of 200 milliseconds per test case. `ci` is selected automatically when the `CI` environment variable is set and adds `derandomize=True`, `deadline=None`, `database=None` and `print_blob=True`.

```bash
pytest --hypothesis-profile ci
pytest --hypothesis-show-statistics
pytest --hypothesis-verbosity=verbose
pytest --hypothesis-explain
```

### Stateful tests

```python
import hypothesis.strategies as st
from hypothesis import settings
from hypothesis.stateful import RuleBasedStateMachine, invariant, precondition, rule

from shop.cart import Cart


class CartMachine(RuleBasedStateMachine):
    def __init__(self):
        super().__init__()
        self.cart = Cart()
        self.model = {}

    @rule(sku=st.sampled_from(["MUG-11OZ", "TEE-M-BLK", "CAP-GRY"]), qty=st.integers(1, 20))
    def add(self, sku, qty):
        self.cart.add(sku, qty)
        self.model[sku] = self.model.get(sku, 0) + qty

    @precondition(lambda self: self.model)
    @rule(data=st.data())
    def remove(self, data):
        sku = data.draw(st.sampled_from(sorted(self.model)))
        self.cart.remove(sku)
        del self.model[sku]

    @invariant()
    def totals_match(self):
        assert self.cart.total_items() == sum(self.model.values())


TestCart = CartMachine.TestCase
TestCart.settings = settings(max_examples=50, stateful_step_count=30)
```

Hypothesis chooses sequences of rules, checks every invariant after each step, and prints a failing sequence as a short program. The pattern is to compare the real object with a simple model.

### Draft tests with the ghostwriter

```bash
hypothesis write billing.installments.split_installments
hypothesis write --roundtrip json.dumps json.loads
hypothesis write --equivalent billing.legacy.prorate billing.proration.prorate
```

The command prints test code to standard output. It takes dotted module or function names, not file paths. Treat the result as a first draft: narrow the strategies and add real assertions.

## Examples

### Example 1: A rounding bug in installment splitting

**Request:** "Write property tests for `split_installments(total_cents, count)` in `billing/installments.py`. The parts must always add up to the total."

The agent writes the test from "Write a property test" into `tests/test_installments.py` and runs it:

```bash
pytest tests/test_installments.py -q
```

**Result:**

```text
>       assert sum(parts) == total_cents
E       assert 0 == 1
E        +  where 0 = sum([0, 0])
E       Failing test case: test_installments_add_up_to_the_total(
E           total_cents=1,
E           count=2,
E       )
1 failed in 0.34s
```

One cent split in two loses the cent: the function returns `[total_cents // count] * count`. The agent distributes the remainder with `divmod`, pins the case with `@example(total_cents=1, count=2)`, and the run ends with `1 passed`.

### Example 2: A round trip between formatting and parsing

**Request:** "Check that `parse_money(format_money(cents))` always gives back the same amount."

```python
from hypothesis import given, strategies as st

from billing.money import format_money, parse_money


@given(st.integers(min_value=0, max_value=1_000_000_000))
def test_format_then_parse_returns_the_same_amount(cents):
    assert parse_money(format_money(cents)) == cents
```

**Result:**

```text
E       AssertionError: assert 56 == 57
E        +  where 56 = parse_money('0.57')
E        +    where '0.57' = format_money(57)
E       Failing test case: test_format_then_parse_returns_the_same_amount(
E           cents=57,
E       )
```

`parse_money` multiplies a float by 100 and truncates. The reported value differs between runs (57, 201, 431 and 7035 all fail), because not every amount is affected; every one of them points to the same defect. Parsing with `Decimal` fixes it.

## Guidelines

- **Assert a property, not a copy of the implementation.** A test that recomputes the result with the same formula passes even when the formula is wrong.
- **Never return early to skip an input.** `if b == 0: return` counts as a passing case and hides that nothing was checked. Use `assume` or a narrower strategy.
- **Prefer building valid inputs to filtering.** Heavy use of `.filter` or `assume` raises the `filter_too_much` health check and slows the run. Bounds, `.map` and `@st.composite` avoid it.
- **`\d` and `\w` in `st.from_regex` match all Unicode digits and letters.** Write `[0-9]` and `[A-Za-z]`, or pass `alphabet=st.characters(codec="ascii")`.
- **Floats include `nan` and infinity unless excluded.** `nan != nan` breaks equality assertions.
- **Function-scoped pytest fixtures run once per test, not once per generated input.** Hypothesis raises the `function_scoped_fixture` health check; create per-input state inside the test.
- **Tests must behave the same when replayed.** Global state, clocks, unseeded randomness and leftover files cause `FlakyFailure`.
- **The deadline is per test case.** Slow code fails with `DeadlineExceeded` at 200 ms; set `deadline=None` for tests that do real I/O rather than raising the limit blindly.
- **Do not leave `@reproduce_failure` in the code.** Its blob is tied to one Hypothesis version. Keep the input permanently with `@example`.
- **`.hypothesis/` is a local cache.** Hypothesis puts its own `.gitignore` inside, and entries can become invalid after an upgrade or a change to the test.
- **Keep generated inputs away from real systems.** Every test body runs at least 100 times: no production databases, payment calls, e-mail or file deletion driven by generated data. Use fakes or in-memory objects.
- **`hypothesis write` imports the target module**, which executes its top-level code. Run it only on code you trust.
- **Suppress health checks one at a time**, for example `@settings(suppress_health_check=[HealthCheck.too_slow])`, never with a blanket list.
- **When not to use it:** when no general rule can be stated (exact expected output for one specific input), for slow end-to-end tests, and for checking text or layout snapshots. Plain example-based tests are the better tool there.
