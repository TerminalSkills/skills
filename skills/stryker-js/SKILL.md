---
name: stryker-js
description: >-
  StrykerJS is a mutation testing tool for JavaScript and TypeScript: it makes small deliberate changes to your source code and checks whether your tests fail, which shows how well the tests really protect the code. Use it when asked to "run mutation testing", "check test quality", "find weak tests", "improve the mutation score", "set up Stryker", or to gate a CI build on a mutation score.
license: Apache-2.0
compatibility: "Node.js 22+ (StrykerJS 10), an existing test suite that passes"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "mutation-testing, testing, javascript, typescript, test-quality"
  repository: https://github.com/stryker-mutator/stryker-js
---

# StrykerJS — mutation testing for JavaScript and TypeScript

## Overview

Line coverage tells you which code your tests execute, not whether they would notice a bug. StrykerJS answers the second question. It copies your project into a sandbox, applies one small change at a time (a `>=` becomes `>`, a `&&` becomes `||`, a condition becomes `true`), and reruns the tests for each change. A change that makes a test fail is "killed". A change that no test notices "survived", and every survivor points at a missing or weak assertion.

The result is a mutation score: killed mutants divided by all mutants that were tested. Stryker can fail the build under a chosen score, write an HTML report, and reuse earlier results so reruns only test what changed.

Use it on code whose behaviour matters (pricing, permissions, parsing, validation). Do not point it at a project whose tests are already failing: the initial run must pass.

## Instructions

### Installation and setup

StrykerJS 10 needs Node.js 22 or newer. Install the core package plus a runner for your test framework as dev dependencies:

```bash
npm install --save-dev @stryker-mutator/core
npm install --save-dev @stryker-mutator/vitest-runner   # Vitest
# or: @stryker-mutator/jest-runner, @stryker-mutator/mocha-runner,
#     @stryker-mutator/karma-runner, @stryker-mutator/tap-runner,
#     @stryker-mutator/cucumber-runner
npm install --save-dev @stryker-mutator/typescript-checker   # TypeScript projects only
```

The runner package must be the same version as `@stryker-mutator/core`. The guided way is `npm init stryker`, which asks about your framework and writes a config file. It is interactive, so in an agent session write the config by hand instead (below).

If the framework has no dedicated runner (for example `node --test`), use the built-in `command` runner. It runs any shell command and treats a non-zero exit code as a killed mutant.

### Configuration file

Create `stryker.config.json` (a `.mjs` file exporting a default object works too). A minimal, verified setup for a project that uses the `command` runner:

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "testRunner": "command",
  "commandRunner": { "command": "npm test" },
  "mutate": ["src/**/*.js"],
  "coverageAnalysis": "off",
  "reporters": ["clear-text", "html", "json"],
  "thresholds": { "high": 80, "low": 60, "break": 50 }
}
```

For Vitest or Jest, set `"testRunner": "vitest"` (or `"jest"`) instead and drop `commandRunner` and `coverageAnalysis`. Those runners report coverage, so the default `perTest` strategy works and runs only the tests that touch each mutant, which is much faster.

Key options:

- `mutate`: globs of production files to mutate. Prefix with `!` to exclude, for example `["src/**/*.ts", "!src/**/*.spec.ts"]`. A line range such as `"src/price.js:1-11"` limits mutation to a part of a file. Never list test files. The default is every JS-like file under `src` or `lib` except tests.
- `thresholds`: `high` (default 80), `low` (default 60) and `break`. A score below `break` makes `stryker run` exit with code 1. The default `break` is `null`, so the build never fails.
- `coverageAnalysis`: `perTest` (default), `all` or `off`. The `command` runner cannot provide coverage, so use `off` with it.
- `reporters`: `clear-text` (console), `progress`, `html`, `json`, `dashboard`, `dots`. The HTML report goes to `reports/mutation/mutation.html`.
- `concurrency`: number of worker processes, default is the number of logical CPUs minus one (all of them on 4 or fewer). Lower it on a small CI runner.
- `checkers`: `["typescript"]` discards mutants that do not compile, which removes noise in TypeScript code.

### Running

```bash
npx stryker run                      # uses stryker.config.json
npx stryker run --mutate "src/price.js"   # one file while iterating
npx stryker run --dryRunOnly         # only checks that the initial test run passes
```

Run `--dryRunOnly` first on an unfamiliar project: it confirms the sandbox and the test command work before spending time on mutants.

### Reading the clear-text report

Each survivor is printed with its mutator name, location, and the change:

```text
[Survived] EqualityOperator
src/price.js:3:7
-     if (total >= 100) return total * 0.9;
+     if (total > 100) return total * 0.9;
```

This says no test calls the function with exactly 100. Statuses you will see: Killed, Survived, NoCoverage (no test executes that line), Timeout (counted as detected), CompileError (type checker rejected it), Ignored. Fix survivors by adding an assertion that fails for the mutated behaviour, then rerun.

### Ignoring equivalent mutants

Some mutants cannot be killed because the changed code behaves the same (for example `a < b ? b : a` changed to `a <= b ? b : a`). Disable them with a comment, giving a reason that appears in the report:

```js
// Stryker disable next-line EqualityOperator: <= gives the same result for equal values
return a < b ? b : a;
```

`// Stryker disable all` at the top of a file disables the whole file; `// Stryker restore all` re-enables. To drop a mutator everywhere, use `"mutator": { "excludedMutations": ["StringLiteral"] }` in the config. Ignored mutants do not count toward the score.

### Incremental mode

`--incremental` stores results in `reports/stryker-incremental.json` and the next run only retests mutants in changed files. Add `--force` to discard the stored results and rerun everything.

```bash
npx stryker run --incremental          # fast rerun
npx stryker run --incremental --force  # full rerun, rewrites the incremental file
```

With the `command` runner Stryker cannot see which tests exist, so editing a test file does not invalidate stored results. After changing tests, add `--force`, otherwise the score you see is stale. Dedicated runners (Vitest, Jest, Mocha) do detect test changes.

### CI usage

Run it in a separate job from the fast unit tests, because it is slower than a normal test run by a large factor. Keep `thresholds.break` set so the job fails on regressions. Cache `reports/stryker-incremental.json` between runs and use `--incremental` on pull requests.

## Examples

### Example 1: Find out how good the tests of a pricing function are

**Request:** "Our `discount()` function has 100% line coverage. Check whether the tests are any good."

```bash
cd ~/work/shop-pricing
npm install --save-dev @stryker-mutator/core
npx stryker run
```

With the config above, Stryker reports 13 mutants and a score of 53.85: seven killed, six survived. The survivors show that nothing tests the boundary at exactly 100, the non-member discount path with a total above 100, or the `&&` between `total >= 100` and `isMember`. The agent adds these tests:

```js
test('member at the threshold', () => assert.equal(discount(100, true), 80));
test('non-member over threshold', () => assert.equal(discount(100, false), 90));
test('member under threshold', () => assert.equal(discount(99, true), 99));
```

```bash
npx stryker run --incremental --force
```

The new run prints `All files | 100.00` with 13 killed and 0 survived. Coverage was 100% before and after; only the mutation score changed.

### Example 2: Fail the pull request when test quality drops

**Request:** "Add mutation testing to CI for the `src/billing` folder and block merges under 70%."

Update the config:

```json
{
  "testRunner": "vitest",
  "mutate": ["src/billing/**/*.ts", "!src/billing/**/*.spec.ts"],
  "checkers": ["typescript"],
  "reporters": ["clear-text", "html"],
  "thresholds": { "high": 85, "low": 70, "break": 70 },
  "incremental": true
}
```

```bash
npm install --save-dev @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker
npx stryker run
echo "exit code: $?"
```

When the score is under 70 Stryker logs that the score is below the break threshold and exits with code 1, which fails the CI step. Upload `reports/mutation/mutation.html` as a build artifact so reviewers can open it.

## Guidelines

- The initial test run must pass without Stryker. Fix failing or flaky tests first; a flaky test produces false kills.
- Mutate only production code. Scope `mutate` to the folder you are working on; mutating a whole large repo can take hours.
- A score of 100% is not the goal. Equivalent mutants and trivial mutants (log strings, error messages) are common. Aim for a high score on important code and ignore the rest with a reason.
- Tests must be independent of order with `perTest` coverage, because Stryker runs only the tests that cover each mutant.
- Stryker works in a copy of the project (`.stryker-tmp`). Add `.stryker-tmp` and `reports` to `.gitignore` (and `stryker.log` if you enable `fileLogLevel`).
- Infinite loops caused by mutants are cut off by timeouts. If many mutants time out, raise `timeoutMS` or `timeoutFactor`.
- With the `command` runner, always use `--force` after editing tests when `--incremental` is on.
- Never enable the `dashboard` reporter without the user's agreement: it uploads source code and results to an external service.
- Do not use mutation testing as a replacement for unit tests, integration tests or code review; it only measures the first of these.
