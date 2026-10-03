---
name: pytest
description: >-
  pytest is the standard Python test framework: plain assert statements,
  fixtures for setup and teardown, parametrized tests and a large plugin
  ecosystem. Use when a user asks to write unit tests, set up test fixtures,
  mock dependencies, run async tests, measure coverage, run tests in
  parallel, or practice test-driven development in Python.
license: Apache-2.0
compatibility: 'Python 3.10+ (pytest 9); pytest-asyncio, pytest-cov, pytest-mock and pytest-xdist are optional plugins'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/pytest-dev/pytest
  tags:
    - pytest
    - testing
    - python
    - tdd
    - fixtures
---

# pytest

## Overview

pytest collects functions named `test_*` in files named `test_*.py` (or `*_test.py`), runs them, and rewrites plain `assert` statements so a failure shows both sides of the comparison. Fixtures provide setup and teardown, `parametrize` runs one test over many inputs, and plugins add async support, coverage, mocking and parallel runs. This skill targets pytest 9.x (checked against 9.1) with pytest-asyncio 1.x.

## Instructions

### Step 1: Install and configure

```bash
python -m venv .venv && source .venv/bin/activate
pip install pytest pytest-asyncio pytest-cov pytest-mock pytest-xdist
```

Put configuration in `pyproject.toml` (`[tool.pytest.ini_options]`) or, since pytest 9, in a native `pytest.toml`:

```toml
# pytest.toml
[pytest]
pythonpath = ["."]            # lets tests import top-level modules such as `app`
testpaths = ["tests"]
asyncio_mode = "auto"         # pytest-asyncio: no @pytest.mark.asyncio on every test
markers = ["slow: tests that take more than a second"]
strict = true                 # unknown markers and options become errors
```

Without `pythonpath` (or an installed package), `from app import ...` fails with `ModuleNotFoundError` when pytest is run from the project root.

### Step 2: Basic tests

```python
# tests/test_users.py
import pytest
from app.services.users import create_user, validate_email

def test_create_user_returns_user_object():
    user = create_user(name="Priya Nair", email="priya@acme.io")
    assert user.name == "Priya Nair"
    assert user.id is not None

def test_validate_email_rejects_invalid():
    assert validate_email("not-an-email") is False
    assert validate_email("user@") is False

class TestUserService:
    """A class only groups tests; no base class or self.assert* methods needed."""

    def test_duplicate_email_raises(self):
        create_user(name="Priya Nair", email="priya@acme.io")
        with pytest.raises(ValueError, match="Email already exists"):
            create_user(name="Tom Berg", email="priya@acme.io")
```

### Step 3: Fixtures

```python
# tests/conftest.py — shared by every test in this directory and below
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.models import Base, User

@pytest_asyncio.fixture          # async fixtures need this decorator in strict mode
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session            # code after yield is the teardown
    await engine.dispose()

@pytest_asyncio.fixture
async def sample_user(db):
    user = User(name="Priya Nair", email="priya@acme.io", role="member")
    db.add(user)
    await db.commit()
    return user

@pytest.fixture
def api_client(db):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.dependencies import get_db

    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()
```

That example needs `pip install "sqlalchemy[asyncio]" aiosqlite`. Built-in fixtures worth knowing: `tmp_path` (a fresh directory per test), `monkeypatch` (set env vars and attributes, undone automatically), `capsys` and `caplog` (captured output and log records). A fixture's `scope` can be `function` (default), `class`, `module`, `package` or `session`; widen it only for expensive, read-only resources.

### Step 4: Parametrize

```python
@pytest.mark.parametrize(
    "plan,expected_price",
    [("free", 0), ("starter", 29), ("pro", 79), pytest.param("enterprise", 199, id="enterprise-list-price")],
)
def test_calculate_price(plan, expected_price):
    assert calculate_price(plan) == expected_price
```

pytest 9 also ships subtests (a `subtests` fixture) for looping over cases inside one test without stopping at the first failure:

```python
def test_slugify_variants(subtests):
    for raw, slug in [("Hello World", "hello-world"), ("  Spaces  ", "spaces")]:
        with subtests.test(raw=raw):
            assert slugify(raw) == slug
```

### Step 5: Mocking

```python
# tests/test_notifications.py — pytest-mock provides the `mocker` fixture
from unittest.mock import AsyncMock

async def test_send_welcome_email(mocker, sample_user):
    send = mocker.patch("app.services.email.send_email", new_callable=AsyncMock,
                        return_value={"id": "msg_8841"})

    result = await send_welcome_email(sample_user.id)

    send.assert_awaited_once_with(to="priya@acme.io", subject="Welcome!", template="welcome")
    assert result["id"] == "msg_8841"
```

Patch the name where it is looked up (`app.services.notifications.send_email`, if that module did `from ... import send_email`), not where it is defined.

### Step 6: Run

```bash
pytest                                  # everything under testpaths
pytest tests/test_users.py::test_validate_email_rejects_invalid   # one test
pytest -x --lf                          # stop at first failure; rerun last failures
pytest -k "create and not duplicate"    # select by expression
pytest -m "not slow"                    # select by marker
pytest --cov=app --cov-report=term-missing   # coverage (pytest-cov)
pytest -n auto                          # parallel workers (pytest-xdist)
pytest -ra                              # summary of skipped/xfailed reasons
```

## Examples

### Example 1: Add tests for a pricing function

User request: "Write pytest tests for calculate_discount in app/pricing.py, including bad input."

```python
# tests/test_pricing.py
import pytest
from app.pricing import calculate_discount

@pytest.mark.parametrize("total,code,expected", [(100.0, "SPRING10", 90.0), (100.0, None, 100.0), (0.0, "SPRING10", 0.0)])
def test_discount_applies(total, code, expected):
    assert calculate_discount(total, code) == pytest.approx(expected)

def test_unknown_code_raises():
    with pytest.raises(ValueError, match="Unknown discount code"):
        calculate_discount(50.0, "NOPE")
```

Run `pytest tests/test_pricing.py -q`; expect `4 passed` (three parametrized cases plus the error test).

### Example 2: Fix "async def functions are not natively supported"

User request: "My async tests fail with 'async def functions are not natively supported'."

pytest does not run coroutines on its own. Install the plugin and set the mode:

```bash
pip install pytest-asyncio
```

Add `asyncio_mode = "auto"` to `pytest.toml`, or keep the default strict mode and decorate each test with `@pytest.mark.asyncio` and each async fixture with `@pytest_asyncio.fixture`. Re-run `pytest -q`: the tests now pass.

## Guidelines

- Use plain `assert`; use `pytest.approx` for floats and `pytest.raises(..., match=...)` for exceptions.
- In strict asyncio mode (the default), an async fixture declared with plain `@pytest.fixture` errors with "requested an async fixture ... no plugin or hook that handled it"; use `@pytest_asyncio.fixture` or switch to `asyncio_mode = "auto"`.
- Fixtures with `yield` clean up even when the test fails; no try/finally needed.
- Keep tests independent: no reliance on order, shared mutable module state or a leftover database. In-memory SQLite suits unit tests; use the real database engine for integration tests.
- Register custom markers in configuration; with `strict = true` (or `--strict-markers`) a typo fails at collection instead of silently deselecting tests.
- Parallel runs (`-n auto`) need tests that do not share files, ports or database rows.
- Do not mock what you own and can run cheaply; mock network calls, clocks and paid APIs.
- `unittest.TestCase` classes also run under pytest, but fixtures and parametrize do not apply to their methods.
