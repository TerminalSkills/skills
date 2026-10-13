---
name: test-generator
description: >-
  Generate unit, integration, and end-to-end tests for existing code. Use when
  a user asks to write tests, add test coverage, create unit tests, generate
  integration tests, build e2e tests, improve code coverage, write specs, or
  add testing to a project. Supports Jest, Vitest, Pytest, Playwright,
  React Testing Library, and Cypress. Analyzes code to produce meaningful
  assertions, edge cases, and mock setups.
license: Apache-2.0
compatibility: "Requires Node.js 18+ (Jest/Vitest/Playwright) or Python 3.9+ (Pytest)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["testing", "unit-tests", "e2e", "jest", "pytest"]
---

# Test Generator

## Overview

Automatically generate comprehensive tests for existing source code. This skill analyzes functions, classes, and modules to produce well-structured test suites with meaningful assertions, edge case coverage, and proper mocking. It supports multiple frameworks and test types (unit, integration, e2e).

## Instructions

When a user asks you to generate tests for their code, follow these steps:

### Step 1: Analyze the target code

Read the source file(s) and identify:
- **Functions/methods** to test, their signatures, parameters, and return types
- **Dependencies** that need mocking (database calls, API requests, file I/O)
- **Edge cases** — null inputs, empty arrays, boundary values, error paths
- **Side effects** — state mutations, event emissions, DOM changes

### Step 2: Detect the testing framework

Check the project for existing test setup:

```bash
# Check package.json for JS/TS projects
cat package.json | grep -E "jest|vitest|playwright|cypress|mocha|testing-library"

# Check for Python test frameworks
cat requirements.txt pyproject.toml setup.cfg 2>/dev/null | grep -E "pytest|unittest|hypothesis"

# Check for existing test config
ls jest.config* vitest.config* pytest.ini conftest.py .pytest.ini setup.cfg 2>/dev/null
```

If no framework is detected, recommend based on the project:
- **React/Next.js**: Vitest + React Testing Library
- **Node.js/Express**: Jest or Vitest
- **Python**: Pytest
- **E2E/browser**: Playwright

### Step 3: Generate the test file

Create tests following the framework conventions:

**Naming**: Place test files next to source files or in a `__tests__`/`tests` directory matching the project convention. Use `*.test.ts`, `*.spec.ts`, `test_*.py`, or `*_test.py`.

**Structure each test with:**
1. **Arrange** — set up inputs, mocks, and preconditions
2. **Act** — call the function or perform the action
3. **Assert** — verify the output, side effects, or state changes

**For each function, generate tests covering:**
- Happy path with typical inputs
- Edge cases (empty input, null, zero, max values)
- Error handling (invalid input, thrown exceptions)
- Boundary conditions

### Step 4: Set up mocks and fixtures

Mock external dependencies to isolate the unit under test:

**JavaScript/TypeScript (Jest/Vitest):**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processOrder } from './order-service';
import { db } from './database';
import { sendEmail } from './email-service';

vi.mock('./database');
vi.mock('./email-service');

describe('processOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should save the order and send confirmation email', async () => {
    const mockOrder = { id: 'ord_123', items: [{ sku: 'WIDGET-A', qty: 2 }], total: 49.98 };
    vi.mocked(db.orders.create).mockResolvedValue(mockOrder);
    vi.mocked(sendEmail).mockResolvedValue({ delivered: true });

    const result = await processOrder({ items: [{ sku: 'WIDGET-A', qty: 2 }] });

    expect(db.orders.create).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'ord_123' }));
    expect(result.id).toBe('ord_123');
  });
});
```

**Python (Pytest):**
```python
import pytest
from unittest.mock import patch, MagicMock
from order_service import process_order

@pytest.fixture
def mock_db():
    with patch('order_service.db') as mock:
        mock.orders.create.return_value = {"id": "ord_123", "total": 49.98}
        yield mock

def test_process_order_saves_and_sends_email(mock_db):
    result = process_order(items=[{"sku": "WIDGET-A", "qty": 2}])
    mock_db.orders.create.assert_called_once()
    assert result["id"] == "ord_123"

def test_process_order_rejects_empty_items():
    with pytest.raises(ValueError, match="at least one item"):
        process_order(items=[])
```

### Step 5: Add integration and e2e tests if requested

**Integration tests** — test multiple modules together with real (or test) databases:
- Use test containers or in-memory databases
- Test API routes end-to-end through the HTTP layer
- Verify database state after operations

**E2E tests (Playwright):**
```typescript
import { test, expect } from '@playwright/test';

test('user can add item to cart and checkout', async ({ page }) => {
  await page.goto('/products');
  await page.getByTestId('product-widget-a').click();
  await page.getByRole('button', { name: 'Add to Cart' }).click();

  await page.goto('/cart');
  await expect(page.getByTestId('cart-item')).toHaveCount(1);
  await expect(page.getByTestId('cart-total')).toContainText('$24.99');

  await page.getByRole('button', { name: 'Checkout' }).click();
  await expect(page).toHaveURL(/\/checkout/);
});
```

### Step 6: Verify and report coverage

Run the tests and report results:

```bash
# JavaScript (once: npm i -D @vitest/coverage-v8)
npx vitest run --coverage
# Python (once: pip install pytest-cov)
pytest --cov=src --cov-report=term-missing
```

Report: total tests, pass/fail, and coverage percentage. Suggest additional tests if coverage is below 80%.

## Examples

### Example 1: Generate unit tests for a utility module

**User request:** "Write tests for src/utils/string-helpers.ts"

**Source code analyzed:**
```typescript
export function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
```

**Generated test file** (`src/utils/string-helpers.test.ts`):
```typescript
import { describe, it, expect } from 'vitest';
import { slugify, truncate } from './string-helpers';

describe('slugify', () => {
  it('converts spaces to hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });
  it('removes special characters', () => {
    expect(slugify('Price: $99.99!')).toBe('price-9999');
  });
  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
  it('collapses multiple spaces', () => {
    expect(slugify('too   many   spaces')).toBe('too-many-spaces');
  });
});

describe('truncate', () => {
  it('returns original if within limit', () => {
    expect(truncate('short', 10)).toBe('short');
  });
  it('truncates and adds ellipsis', () => {
    expect(truncate('This is a very long sentence', 15)).toBe('This is a ve...');
  });
  it('handles exact length', () => {
    expect(truncate('exact', 5)).toBe('exact');
  });
});
```

**Result:** 7 tests across both functions. Each expected value is what the function returns, for example `slugify('Price: $99.99!')` gives `price-9999`.

### Example 2: Generate Pytest tests for a Flask API endpoint

**User request:** "Add tests for the /api/users endpoint in app.py"

**Source code analyzed:**
```python
@app.route('/api/users', methods=['POST'])
def create_user():
    data = request.get_json()
    if not data.get('email'):
        return jsonify({"error": "Email is required"}), 400
    user = User(email=data['email'], name=data.get('name', ''))
    db.session.add(user)
    db.session.commit()
    return jsonify({"id": user.id, "email": user.email}), 201
```

**Generated test file** (`tests/test_users_api.py`):
```python
import pytest
from app import app, db

@pytest.fixture
def client():
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    with app.test_client() as client:
        with app.app_context():
            db.create_all()
        yield client

def test_create_user_success(client):
    response = client.post('/api/users', json={"email": "alice.morgan@brightlane.io", "name": "Alice"})
    assert response.status_code == 201
    data = response.get_json()
    assert data["email"] == "alice.morgan@brightlane.io"
    assert "id" in data

def test_create_user_missing_email(client):
    response = client.post('/api/users', json={"name": "Bob"})
    assert response.status_code == 400
    assert "Email is required" in response.get_json()["error"]

def test_create_user_empty_body(client):
    response = client.post('/api/users', json={})
    assert response.status_code == 400
```

**Result:** 3 tests covering success, a validation error, and an empty request body.

## Guidelines

- Always match the existing test framework and style in the project. Do not introduce Jest if the project uses Vitest.
- Place test files following the project's existing convention (co-located vs. `tests/` directory).
- Use descriptive test names that explain the expected behavior, not the implementation.
- Mock external dependencies (databases, APIs, file system) but avoid over-mocking — test real logic.
- For each function, aim for at least: one happy path, one error case, one edge case.
- Generate `beforeEach`/`afterEach` setup when tests share common fixtures.
- Do not generate snapshot tests unless explicitly requested — they are brittle and rarely useful.
- When generating e2e tests, prefer `getByRole` and `getByTestId` locators over CSS classes; `getByTestId` reads the `data-testid` attribute by default.
- If the project has no testing setup, install the framework and create the config file before writing tests.
- Report test count and coverage after generation so the user knows the current state.
