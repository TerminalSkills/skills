---
title: Generate Property-Based Tests for Python Code with Hypothesis
slug: generate-property-based-tests-with-hypothesis
description: Find the edge cases hand-written tests miss in Python billing code, pin them as regression tests, and run hundreds of generated inputs per test in CI.
skills:
  - hypothesis
  - pytest
category: development
tags:
  - property-based-testing
  - hypothesis
  - pytest
  - python
  - edge-cases
---

## The Problem

Marta Kowalczyk is one of three backend engineers at Ledgerline, a nine-person company that runs subscription billing for gyms and yoga studios. Last month a studio owner reported that a member on a three-part payment plan for 100.00 euros had been charged 99.99 in total. The cause was `split_installments` in `billing/installments.py`, which had eleven unit tests, all passing.

Every one of those tests used an amount that divides evenly: 120.00 in 12 parts, 90.00 in 3. An export showed 1,912 payment plans short by one to eleven cents over eight months. The total was only 94.37 euros, but each plan needed a manual correction and an apology, about 26 hours of support work.

Marta does not trust herself to think of the next awkward input either. She wants tests that state the rule, "the parts always add up to the total", and a machine that goes looking for the input that breaks it.

## The Solution

The agent uses the **hypothesis** skill to draft, write and tune property-based tests, and to turn the failing input into a permanent regression case. It uses the **pytest** skill to run them, to place shared settings in `conftest.py`, and to wire the profile into the existing test command.

## Step-by-Step Walkthrough

### 1. Install Hypothesis next to pytest

**Prompt:** "Add Hypothesis to the billing service. We already use pytest."

```bash
pip install hypothesis pytest "hypothesis[cli]"
```

The `cli` extra adds the `hypothesis` command used in the next step. The project runs Python 3.12; Hypothesis needs 3.10 or later.

### 2. Get a first draft from the ghostwriter

**Prompt:** "Draft a test for split_installments so I can see what Hypothesis would feed it."

```bash
hypothesis write billing.installments.split_installments
```

```python
import billing.installments
from hypothesis import given, strategies as st


@given(total_cents=st.integers(), count=st.integers())
def test_fuzz_split_installments(total_cents: int, count: int) -> None:
    billing.installments.split_installments(total_cents=total_cents, count=count)
```

The draft only checks that the function does not crash, and it allows negative totals and a count of zero. It is a starting point, not a test worth keeping.

### 3. State the real properties

**Prompt:** "Make it check the business rules: the parts add up to the total, and no part differs from another by more than one cent. Totals up to 50,000 euros, 1 to 36 installments."

The agent writes `tests/test_installments.py`:

```python
from hypothesis import given, strategies as st

from billing.installments import split_installments

totals = st.integers(min_value=0, max_value=5_000_000)
counts = st.integers(min_value=1, max_value=36)


@given(total_cents=totals, count=counts)
def test_installments_add_up_to_the_total(total_cents, count):
    parts = split_installments(total_cents, count)
    assert len(parts) == count
    assert sum(parts) == total_cents


@given(total_cents=totals, count=counts)
def test_installments_differ_by_at_most_one_cent(total_cents, count):
    parts = split_installments(total_cents, count)
    assert max(parts) - min(parts) <= 1
```

### 4. Run the tests and read the failure

**Prompt:** "Run them."

```bash
pytest tests/test_installments.py -q
```

```text
>       assert sum(parts) == total_cents
E       assert 0 == 1
E        +  where 0 = sum([0, 0])
E       Failing test case: test_installments_add_up_to_the_total(
E           total_cents=1,
E           count=2,
E       )
1 failed, 1 passed in 0.13s
```

Hypothesis found a failing input and shrank it to the smallest one: one cent in two parts. The function returns `[total_cents // count] * count`, which drops the remainder. The second test passes, because equal parts never differ.

### 5. Fix the function and pin the case

**Prompt:** "Fix it, and make sure this exact case and the customer's case are tested forever."

The agent changes the last line of `split_installments`:

```python
    base, remainder = divmod(total_cents, count)
    return [base + 1] * remainder + [base] * (count - remainder)
```

and adds two explicit inputs above the first test:

```python
@example(total_cents=1, count=2)
@example(total_cents=10_000, count=3)
@given(total_cents=totals, count=counts)
def test_installments_add_up_to_the_total(total_cents, count):
```

`example` is imported from `hypothesis` alongside `given`. Both explicit inputs run on every run, before the generated ones. `pytest tests/test_installments.py -q` now ends with `2 passed`, and 100.00 euros in three parts gives `[3334, 3333, 3333]`.

### 6. Run more inputs in CI than on a laptop

**Prompt:** "Keep local runs quick, but make CI try a lot more."

The agent adds to `tests/conftest.py`:

```python
import os

from hypothesis import settings

settings.register_profile("dev", max_examples=25)
settings.register_profile("ci", settings.get_profile("ci"), max_examples=500)
settings.load_profile(os.getenv("HYPOTHESIS_PROFILE", "dev"))
```

and changes the CI test command to:

```bash
pytest --hypothesis-profile ci --hypothesis-show-statistics
```

```text
tests/test_installments.py::test_installments_add_up_to_the_total:

  - during generate phase (0.13 seconds):
    - Typical runtimes: < 1ms, of which < 1ms in data generation
    - 500 passing, 0 failing, and 0 invalid test cases

  - Stopped because settings.max_examples=500
```

## Real-World Example

The first property test took Marta and the agent about twenty minutes, and it reproduced the eight-month-old production bug in 0.13 seconds with the input `total_cents=1, count=2`. None of the eleven existing unit tests could have caught it.

Over the following two weeks the team wrote 14 more property tests for proration, tax rounding and the money parser. Three of them failed on first run. The most serious one was a float conversion in `parse_money` that turned `0.57` into 56 cents. It had not reached customers yet, because the import feature that used it was still behind a flag.

Local runs use 25 inputs per test and add under two seconds to the suite. CI runs 500 per test, 7,500 generated cases across the 15 property tests, in about four seconds. In the three months since, support has not had a single rounding ticket, compared with the 26 hours spent on corrections before.

## Related Skills

- [hypothesis](/skills/hypothesis) — drafts the test with the ghostwriter, defines strategies and properties, shrinks the failure, pins it with `@example` and sets the profiles
- [pytest](/skills/pytest) — runs the tests, hosts the shared settings in `conftest.py` and passes the profile and statistics options on the command line
