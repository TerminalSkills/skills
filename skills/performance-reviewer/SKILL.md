---
name: performance-reviewer
description: >-
  Review code for performance issues and optimization opportunities. Use when
  someone needs to check for N+1 queries, unnecessary re-renders, memory leaks,
  inefficient algorithms, missing indexes, or bundle size regressions. Trigger
  words: performance review, slow query, N+1, memory leak, bundle size, latency,
  optimization, re-render, Big O.
license: Apache-2.0
compatibility: "Works with any codebase. Optional: lighthouse CLI, webpack-bundle-analyzer"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["performance", "optimization", "code-review", "profiling"]
---

# Performance Reviewer

## Overview

This skill analyzes code changes for performance regressions and optimization opportunities. It catches common issues like N+1 database queries, unnecessary re-renders in React components, missing database indexes, unoptimized loops, and bundle size increases before they reach production.

## Instructions

### Analyzing a Diff or PR

1. Get the diff: `git diff main...HEAD` or `git diff <base>...<head>`
2. For each changed file, evaluate against these performance categories:

**Database & Queries:**
- Look for queries inside loops (N+1 pattern)
- Check for missing `WHERE` clauses or full table scans
- Identify missing indexes on columns used in `WHERE`, `JOIN`, or `ORDER BY`
- Flag `SELECT *` when only specific columns are needed
- Watch for unbounded queries without `LIMIT`

**Frontend & Rendering:**
- React: Check for missing `useMemo`/`useCallback` on expensive computations passed as props
- Look for state updates that trigger unnecessary re-renders of large component trees
- Flag inline object/array creation in render (creates new reference every render)
- Check for large bundle imports (`import moment` → suggest `dayjs`)

**Algorithm & Data Structures:**
- Flag O(n²) or worse algorithms when O(n log n) alternatives exist
- Look for repeated array searches that should use a Set or Map
- Identify string concatenation in loops (suggest StringBuilder/join)

**Memory & Resources:**
- Check for missing cleanup in `useEffect` (event listeners, intervals, subscriptions)
- Look for growing arrays/objects that are never trimmed
- Flag missing connection pool limits or unclosed file handles

**Network & I/O:**
- Identify sequential API calls that could be parallelized (`Promise.all`)
- Check for missing pagination on list endpoints
- Flag missing caching for expensive or repeated operations

### Output Format

For each issue found, report:
- **File and line number**
- **Category** (Database, Frontend, Algorithm, Memory, Network)
- **Severity** (Critical, Warning, Info)
- **What's wrong** (specific description)
- **Suggested fix** (concrete code suggestion)

### Severity Guidelines

- **Critical**: Will cause visible degradation in production (N+1 in a loop, O(n²) on large datasets, memory leak)
- **Warning**: May cause issues at scale (missing index, unnecessary re-renders, sequential API calls)
- **Info**: Optimization opportunity, not urgent (bundle size suggestion, minor refactor)

## Examples

### Example 1: N+1 Query Detection

**Input diff:**
```python
# api/views.py
def list_orders(request):
    orders = Order.objects.filter(user=request.user)
    result = []
    for order in orders:
        items = OrderItem.objects.filter(order=order)  # ← query per order
        result.append({
            "id": order.id,
            "total": order.total,
            "items": [{"name": i.product.name, "qty": i.quantity} for i in items]
        })
    return JsonResponse(result, safe=False)
```

**Output:**
```
🔴 Critical — Database N+1 Query
  File: api/views.py:5-8
  Issue: OrderItem query executes once per order, plus each i.product.name
         triggers another query. For 50 orders with 3 items each = 201 queries.
  Fix: Use select_related and prefetch_related:
    orders = Order.objects.filter(user=request.user).prefetch_related(
        Prefetch('items', queryset=OrderItem.objects.select_related('product'))
    )
  Result: 2 queries regardless of order count (the orders query, plus one prefetch
  query that joins product). The Prefetch assumes OrderItem.order has related_name="items".
```

### Example 2: React Re-render Issue

**Input diff:**
```jsx
function UserList({ users, onSelect }) {
  return (
    <div>
      {users.map(user => (
        <UserCard
          key={user.id}
          user={user}
          style={{ padding: 16, margin: 8 }}
          onClick={() => onSelect(user.id)}
        />
      ))}
    </div>
  );
}
```

**Output:**
```
🟡 Warning — Unnecessary Re-renders
  File: components/UserList.jsx:6-7
  Issue: Inline object `style={{ padding: 16, margin: 8 }}` and arrow function
         `() => onSelect(user.id)` create new references every render. UserCard
         is not memoized, so it re-renders whenever UserList does, whatever its props.
  Fix:
    // module scope: one object shared by every render, no hook needed
    const CARD_STYLE = { padding: 16, margin: 8 };

    const UserCard = memo(function UserCard({ user, style, onSelect }) {
      return <div style={style} onClick={() => onSelect(user.id)}>{user.name}</div>;
    });

    // UserList passes the same style object and the parent's onSelect
    <UserCard key={user.id} user={user} style={CARD_STYLE} onSelect={onSelect} />
    // onSelect must be stable too: the parent wraps it in useCallback
  Impact: With 100+ users, an unchanged UserCard is skipped on each parent render.
          The gain requires both memo() on the child and a stable onSelect; useMemo or
          useCallback alone do nothing for a child that is not memoized.
```

## Guidelines

- Focus on issues introduced by the diff, not pre-existing problems
- Prioritize Critical issues — don't bury them in a list of Info suggestions
- Always provide concrete fix suggestions, not just "optimize this"
- Consider the scale: an O(n²) loop on a 5-element array is fine; on user-generated data it's not
- When suggesting caching, specify what to cache and invalidation strategy
- Don't flag micro-optimizations that harm readability for negligible gain
- For React, check the whole chain before suggesting `useMemo`/`useCallback`: a memoized value only saves work if the receiving component is wrapped in `memo` and every prop is stable. One always-new prop breaks the skip for the whole component
- Measure before and after (React Profiler, Lighthouse, query counts in the test log) when the change claims a gain
