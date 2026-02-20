---
name: pytest
description: >-
  Test Python code with pytest. Use when a user asks to write unit tests,
  set up test fixtures, mock dependencies, run async tests, measure coverage,
  or implement test-driven development in Python.
license: Apache-2.0
compatibility: 'Python 3.8+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: testing
  tags:
    - pytest
    - testing
    - python
    - tdd
    - fixtures
---

# pytest

## Overview

pytest is the standard Python testing framework. It uses plain assert statements (no self.assertEqual), fixtures for setup/teardown, parametrize for data-driven tests, and plugins for async, coverage, and mocking.

## Instructions

### Step 1: Basic Tests

```python
# tests/test_users.py — Simple test functions
from app.services.users import create_user, validate_email

def test_create_user_returns_user_object():
    user = create_user(name="Alice", email="alice@example.com")
    assert user.name == "Alice"
    assert user.email == "alice@example.com"
    assert user.id is not None

def test_validate_email_rejects_invalid():
    assert validate_email("not-an-email") is False
    assert validate_email("") is False
    assert validate_email("user@") is False

def test_validate_email_accepts_valid():
    assert validate_email("user@example.com") is True
    assert validate_email("user+tag@example.co.uk") is True

class TestUserService:
    """Group related tests in a class."""

    def test_duplicate_email_raises(self):
        create_user(name="Alice", email="alice@example.com")
        with pytest.raises(ValueError, match="Email already exists"):
            create_user(name="Bob", email="alice@example.com")
```

### Step 2: Fixtures

```python
# conftest.py — Shared fixtures
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.models import Base

@pytest.fixture
async def db():
    """Fresh database for each test."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    async with session_maker() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.fixture
def sample_user(db):
    """Pre-created user for tests that need one."""
    user = User(name="Test User", email="test@example.com", role="member")
    db.add(user)
    db.commit()
    return user

@pytest.fixture
def api_client(db):
    """FastAPI test client with database override."""
    from fastapi.testclient import TestClient
    from app.main import app
    from app.dependencies import get_db

    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()
```

### Step 3: Parametrize

```python
# tests/test_pricing.py — Data-driven tests
import pytest

@pytest.mark.parametrize("plan,users,expected_price", [
    ("free", 1, 0),
    ("free", 5, 0),
    ("starter", 1, 29),
    ("starter", 10, 29),
    ("pro", 1, 79),
    ("pro", 50, 79),
    ("enterprise", 100, 199),
])
def test_calculate_price(plan, users, expected_price):
    assert calculate_price(plan, users) == expected_price

@pytest.mark.parametrize("input_text,expected_slug", [
    ("Hello World", "hello-world"),
    ("  Spaces  Everywhere  ", "spaces-everywhere"),
    ("Special!@#$Characters", "specialcharacters"),
    ("Already-a-slug", "already-a-slug"),
    ("UPPERCASE", "uppercase"),
])
def test_slugify(input_text, expected_slug):
    assert slugify(input_text) == expected_slug
```

### Step 4: Mocking

```python
# tests/test_notifications.py — Mock external services
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_send_welcome_email(db, sample_user):
    with patch("app.services.email.send_email", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = {"id": "msg_123"}

        result = await send_welcome_email(sample_user.id)

        mock_send.assert_called_once_with(
            to=sample_user.email,
            subject="Welcome!",
            template="welcome",
        )
        assert result["id"] == "msg_123"

@pytest.mark.asyncio
async def test_payment_webhook_handles_failure(api_client):
    with patch("app.services.stripe.verify_signature", return_value=True):
        response = api_client.post("/webhooks/stripe", json={
            "type": "payment_intent.failed",
            "data": {"object": {"id": "pi_123"}},
        })
        assert response.status_code == 200
```

### Step 5: Run

```bash
pytest                           # run all tests
pytest -x                        # stop on first failure
pytest -k "test_create"          # run tests matching pattern
pytest --cov=app --cov-report=html  # coverage report
pytest -n auto                   # parallel execution (pytest-xdist)
```

## Guidelines

- Use plain `assert` — pytest rewrites assertions to show detailed failure info.
- Fixtures with `yield` handle cleanup automatically — no try/finally needed.
- `conftest.py` fixtures are available to all tests in the directory and below.
- Use `@pytest.mark.asyncio` for async tests (requires `pytest-asyncio` plugin).
- Aim for fast tests: in-memory SQLite for unit tests, real database for integration tests.
