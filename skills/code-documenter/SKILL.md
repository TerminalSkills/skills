---
name: code-documenter
description: >-
  Generate comprehensive documentation for undocumented or poorly documented
  codebases. Use when a user asks to document code, add JSDoc/docstrings,
  create README files, generate architecture docs, explain what a codebase does,
  produce onboarding guides, or document internal APIs. Works with any language.
license: Apache-2.0
compatibility: "Supports TypeScript, JavaScript, Python, Go, Java, Rust, Ruby, C#, and PHP."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["documentation", "jsdoc", "docstrings", "architecture", "onboarding"]
---

# Code Documenter

## Overview

Analyzes source code to generate accurate, context-aware documentation at multiple levels: inline comments for complex logic, function/class docstrings, module-level overviews, architecture documents, and onboarding guides. Understands control flow, data transformations, side effects, and cross-module dependencies.

## Instructions

When asked to document code:

1. **Determine the documentation level needed:**
   - **Inline**: Function/method docstrings, JSDoc, Python docstrings, Go doc comments
   - **Module**: README or header comment explaining the module's purpose and exports
   - **Architecture**: High-level document showing how modules interact, data flows, key design decisions
   - **Onboarding**: Getting-started guide for new team members

2. **For function/method documentation, extract:**
   - Purpose: What does this function do? (one sentence)
   - Parameters: name, type, description, default values, constraints
   - Return value: type, description, possible values
   - Side effects: database writes, API calls, file I/O, state mutations, cache invalidation
   - Exceptions/errors: what can go wrong, when, and what error types
   - Example usage: realistic call with realistic data

3. **For complex logic, add inline comments explaining:**
   - WHY, not WHAT — explain the reasoning, not the obvious operation
   - Business rules embedded in conditionals
   - Performance-critical sections and why they're written a certain way
   - Workarounds with links to issues/bugs if available in git history
   - Non-obvious algorithm choices

4. **For architecture documentation:**
   - Map module dependencies (imports/requires graph)
   - Identify entry points (API handlers, CLI commands, event listeners)
   - Trace key data flows through the system (e.g., "user signup" flow)
   - Document configuration and environment variables
   - List external service dependencies (databases, APIs, queues)
   - Note design patterns used (repository pattern, event sourcing, CQRS, etc.)

5. **Language-specific format:**
   - TypeScript/JavaScript: JSDoc with `@param`, `@returns`, `@throws`, `@example`
   - Python: Google-style docstrings with Args, Returns, Raises sections
   - Go: Package-level and exported function doc comments per Go conventions
   - Java: Javadoc with `@param`, `@return`, `@throws`
   - Rust: `///` doc comments with `# Examples` sections

6. **Quality rules:**
   - Never state the obvious ("Increments counter by 1")
   - Document the contract, not the implementation (what, not how — unless the how is surprising)
   - Include realistic example values, not `foo`, `bar`, `test123`
   - Flag functions that are too complex and suggest refactoring before documenting
   - Note when documentation reveals a likely bug (e.g., unhandled null case)

## Examples

### Example 1: Document a Python function

**Input:**
```python
def process_payment(user_id, amount, currency, idempotency_key=None):
    user = db.users.find(user_id)
    if not user:
        raise ValueError("User not found")
    if user.balance < amount and not user.credit_enabled:
        return {"status": "declined", "reason": "insufficient_funds"}
    charge = stripe.charges.create(
        amount=int(amount * 100),
        currency=currency,
        customer=user.stripe_id,
        idempotency_key=idempotency_key
    )
    db.transactions.insert({
        "user_id": user_id, "amount": amount,
        "stripe_charge_id": charge.id, "created_at": datetime.utcnow()
    })
    if user.balance < amount:
        user.balance = user.balance - amount
        db.users.update(user)
    return {"status": "success", "charge_id": charge.id}
```

**Output:**
```python
def process_payment(user_id, amount, currency, idempotency_key=None):
    """Process a payment by charging the user's Stripe account.

    Validates the user's balance (unless credit is enabled), creates a Stripe
    charge, records the transaction, and deducts from the user's internal balance
    if applicable.

    Args:
        user_id: Internal user identifier (e.g., "usr_8f2k3j").
        amount: Charge amount in major currency units (e.g., 49.99).
        currency: ISO 4217 currency code (e.g., "usd", "eur").
        idempotency_key: Optional key to prevent duplicate charges on retry.
            Recommended for all production calls.

    Returns:
        dict: {"status": "success", "charge_id": "ch_..."} on success,
              {"status": "declined", "reason": "insufficient_funds"} if balance
              is too low and credit is not enabled.

    Raises:
        ValueError: If user_id does not match any user in the database.
        stripe.error.CardError: If the card is declined by Stripe.
        stripe.error.InvalidRequestError: If Stripe parameters are invalid.

    Side Effects:
        - Creates a Stripe charge (external API call)
        - Inserts a row into the transactions table
        - May update the user's balance

    Example:
        >>> result = process_payment("usr_8f2k3j", 49.99, "usd", idempotency_key="pay_retry_001")
        >>> result
        {"status": "success", "charge_id": "ch_3Kx9mPqR2s"}

    Note:
        ⚠ Potential bug: balance deduction only happens when balance < amount,
        but the charge always goes through. If balance >= amount, the user is
        charged via Stripe but their internal balance is not deducted.
    """
```

### Example 2: Generate architecture overview

**Input:**
```
Document the architecture of our notification service in src/services/notifications/
```

**Output:**
```markdown
# Notification Service — Architecture

## Purpose
Delivers user notifications across email, push, and in-app channels.
Handles template rendering, delivery scheduling, preference checking,
and delivery status tracking.

## Module Map
  notifications/
  ├── router.ts          — HTTP endpoints for notification preferences and history
  ├── service.ts         — Core orchestration: resolves channel, renders template, dispatches
  ├── channels/
  │   ├── email.ts       — SendGrid integration (SMTP fallback)
  │   ├── push.ts        — Firebase Cloud Messaging
  │   └── in-app.ts      — WebSocket broadcast + database persistence
  ├── templates/
  │   ├── renderer.ts    — Handlebars template engine with i18n support
  │   └── templates/     — .hbs files organized by notification type
  ├── preferences.ts     — User channel preferences (opt-in/opt-out per type)
  └── queue.ts           — Bull queue consumer for async delivery

## Key Data Flow: Sending a Notification
  1. API call or internal event → service.send(userId, type, data)
  2. service.ts checks user preferences → skips opted-out channels
  3. renderer.ts renders template with user's locale
  4. Dispatch queued via Bull (Redis-backed) for reliability
  5. Channel adapter delivers and records status in notifications table

## External Dependencies
  - SendGrid API (email delivery)
  - Firebase Cloud Messaging (push notifications)
  - Redis (Bull queue backing store)
  - PostgreSQL (notification history, preferences, templates metadata)

## Environment Variables
  SENDGRID_API_KEY, FCM_SERVER_KEY, REDIS_URL, NOTIFICATION_FROM_EMAIL
```

## Guidelines

- Read the code before documenting — understand the actual behavior, not just function names.
- When you spot bugs or inconsistencies during documentation, flag them explicitly.
- Architecture docs should be useful to a new engineer on day 1 — no assumed context.
- Keep docstrings focused on the contract. Move implementation details to inline comments.
- For modules with no tests, note it: "⚠ No test coverage — documented behavior is inferred from code."
- Update documentation when the code changes — stale docs are worse than no docs.
