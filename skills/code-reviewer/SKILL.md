---
name: code-reviewer
description: >-
  Perform thorough code reviews with actionable, prioritized feedback. Use when
  a user asks to review code, check code quality, find bugs, review a pull
  request, audit code for issues, or get feedback on implementation. Covers
  correctness, security, performance, readability, and best practices across
  languages.
license: Apache-2.0
compatibility: "Works with any programming language"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["code-review", "quality", "bugs", "security", "best-practices"]
---

# Code Reviewer

## Overview

Perform structured code reviews that identify bugs, security issues, performance problems, and maintainability concerns. Provides prioritized, actionable feedback with specific fix suggestions.

## Instructions

When a user asks you to review code, a file, a diff, or a pull request, follow this process:

### Step 1: Understand the context

Before reviewing, determine:
- What does this code do? (feature, bugfix, refactor)
- What language and framework is it using?
- Are there tests included?
- Is this a full file or a diff/patch?

Read surrounding files if needed to understand the broader codebase context. Get the change itself with `git diff main...HEAD` (local branch) or `gh pr diff 482` (pull request), and run the project's own linter and test command first so the review does not repeat what tooling already reports.

### Step 2: Review using this checklist

Evaluate the code against each category in order of severity:

**Correctness (Critical)**
- Logic errors, off-by-one mistakes, wrong conditions
- Unhandled null/undefined/empty cases
- Race conditions or concurrency issues
- Incorrect error handling (swallowed exceptions, wrong error types)
- Missing input validation

**Security (Critical)**
- SQL injection, XSS, command injection
- Hardcoded secrets, API keys, passwords
- Improper authentication/authorization checks
- Unsafe deserialization, path traversal
- Missing rate limiting on public endpoints

**Performance (High)**
- N+1 queries in database loops
- Unnecessary re-renders in UI components
- Missing indexes for frequent queries
- Unbounded memory growth (loading entire datasets)
- Blocking operations on the main thread

**Reliability (High)**
- Missing error handling for external calls (network, file I/O)
- No retry logic for transient failures
- Missing timeouts on HTTP requests
- Resource leaks (unclosed connections, file handles)

**Readability (Medium)**
- Unclear variable or function names
- Functions doing too many things (> 30 lines is a smell)
- Deeply nested conditionals (> 3 levels)
- Missing or misleading comments
- Inconsistent naming conventions

**Testing (Medium)**
- Missing tests for new logic
- Tests that do not assert meaningful behavior
- Missing edge case coverage
- Brittle tests coupled to implementation details

### Step 3: Format the review

Organize findings by severity. For each issue:

```
### [SEVERITY] Category: Brief title

**File:** `src/routes/users.js` line 12-18

**Issue:** What is wrong and why it matters.

**Suggestion:**
(a fenced code block in the file's language with the fixed code)
```

Severity levels: CRITICAL, HIGH, MEDIUM, LOW. Tag each finding by how sure you are (confirmed by reading the code, or suspected and needs a check).

### Step 4: Provide a summary

End with:
- Overall assessment (approve, request changes, or needs discussion)
- Count of issues by severity
- Top 3 things to fix before merging

## Examples

### Example 1: Review a Node.js API endpoint

**User request:** "Review this Express route handler"

**Code submitted:**
```javascript
app.post('/users', async (req, res) => {
  const { name, email, role } = req.body;
  const user = await db.query(
    `INSERT INTO users (name, email, role) VALUES ('${name}', '${email}', '${role}')`
  );
  res.json(user);
});
// db is a node-postgres Pool; the handler runs under Express 4
```

**Review output:**

```
### CRITICAL Security: SQL Injection vulnerability

**File:** routes/users.js line 2-5

**Issue:** User input is interpolated directly into the SQL query string.
An attacker can inject arbitrary SQL via the name, email, or role fields.

**Suggestion:**
    const user = await db.query(
      'INSERT INTO users (name, email, role) VALUES ($1, $2, $3)',
      [name, email, role]
    );

### CRITICAL Security: No input validation

**File:** routes/users.js line 2

**Issue:** Request body fields are used without validation. Missing or
malformed data will cause database errors or store invalid records.

**Suggestion:**
    if (!name || !email || !email.includes('@')) {
      return res.status(400).json({ error: 'Name and valid email required' });
    }
    const allowedRoles = ['user', 'admin', 'editor'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

### HIGH Reliability: No error handling

**File:** routes/users.js line 3-5

**Issue:** In Express 4 a rejected promise in an async handler is not
caught: the request hangs and the rejection can crash the process
(Express 5 forwards it to the error handler).

**Suggestion:**
    try {
      const { rows } = await db.query(
        'INSERT INTO users (name, email, role) VALUES ($1, $2, $3) RETURNING id, name, email, role',
        [name, email, role]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error('Failed to create user:', err);
      res.status(500).json({ error: 'Failed to create user' });
    }

Summary: REQUEST CHANGES
- Critical: 2, High: 1, Medium: 0
- Fix SQL injection and add input validation before merging
```

### Example 2: Review a React component

**User request:** "Review this component for any issues"

**Code submitted:**
```jsx
function UserList({ users }) {
  const [search, setSearch] = useState('');

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <input onChange={e => setSearch(e.target.value)} />
      {filtered.map(user => (
        <div>{user.name} - {user.email}</div>
      ))}
    </div>
  );
}
```

**Review output:**

```
### MEDIUM Performance: Filtering runs on every render

**Issue:** The filter recalculates on every render, even when unrelated
state changes. Only worth fixing for large lists; with the React Compiler
enabled it is memoized automatically, so check the build config first.

**Suggestion:**
    const filtered = useMemo(() =>
      users.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase())
      ), [users, search]);

### MEDIUM Readability: Missing key prop on list items

**Issue:** React requires a unique key prop on list items for efficient
reconciliation. Missing keys cause incorrect re-renders and warnings.

**Suggestion:**
    {filtered.map(user => (
      <div key={user.id}>{user.name} - {user.email}</div>
    ))}

### LOW Readability: Missing input label and placeholder

**Issue:** The search input has no label or placeholder, making it
unclear what the input is for and inaccessible to screen readers.

**Suggestion:**
    <label htmlFor="user-search">Search users</label>
    <input
      id="user-search"
      placeholder="Search by name..."
      onChange={e => setSearch(e.target.value)}
    />

Summary: APPROVE with suggestions
- Critical: 0, High: 0, Medium: 2, Low: 1
- Add key prop and useMemo before merging
```

## Guidelines

- Focus on issues that matter. Do not nitpick formatting if there is a linter configured.
- Always explain WHY something is a problem, not just what to change.
- Provide concrete fix suggestions, not just "this could be improved."
- Acknowledge what the code does well. Reviews should not be exclusively negative.
- When reviewing diffs, focus on changed lines but check context for integration issues.
- For large PRs (500+ lines), start with an architectural overview before line-by-line review.
- If you are unsure about a finding, say so. Do not present uncertain issues as definitive.
- Do not run or modify the code under review beyond the project's own test and lint commands, and never paste secrets found in the diff into the report; cite file and line instead.
- Prioritize: fix all CRITICALs, fix HIGH before merge, MEDIUM/LOW can be follow-up tasks.
