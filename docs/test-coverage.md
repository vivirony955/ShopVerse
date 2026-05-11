# Test Coverage

## What Is Measured

Integration test coverage of the **NestJS backend** (`backend/src/**/*.ts`).

The 638 integration tests boot the full NestJS application against a real
PostgreSQL database and exercise it via HTTP. Coverage therefore reflects
which backend lines and branches are reached through actual HTTP requests —
the same paths production traffic would take.

**Included:**
- All service, controller, guard, filter, interceptor, and helper files
- DTOs (exercised by the ValidationPipe on every request)

**Excluded** (`collectCoverageFrom` in `test/jest.config.ts`):
| Pattern | Reason |
|---|---|
| `*.module.ts` | Just DI wiring — no testable logic |
| `main.ts` | Bootstrap only |
| `prisma/seed.ts` | Dev utility, not production code |
| `*.spec.ts` | Test files themselves |

## Coverage Provider

`coverageProvider: 'v8'` — uses Node.js's built-in V8 bytecode coverage rather
than Babel/Istanbul source instrumentation. Advantages for TypeScript:
- No false positives from decorator metadata emission
- Correct branch counts on `?.` and `??` operators
- Reports on actual executed lines, not transpiled artefacts

## Running Locally

```bash
# Full run with coverage report
cd test && npm run test:cov

# Output:
#   test/coverage/lcov.info          — lcov artifact (open with genhtml or VS Code extension)
#   test/coverage/coverage-summary.json  — machine-readable totals
#   Printed table                    — per-file statement/branch/function/line %
```

To view HTML report after the run:
```bash
# Requires lcov installed (brew install lcov  /  apt install lcov)
genhtml test/coverage/lcov.info --output-directory test/coverage/html
open test/coverage/html/index.html
```

## CI Pipeline

The `test:coverage` job runs **on `main` branch only** (not on every PR) so
PR pipelines stay fast. It needs `integration` and `e2e` to pass before it
starts — coverage is only published for a green test suite.

The Statements % is extracted from the `All files` row of the Jest text table
and surfaced as:
- The **Coverage badge** in the README (live, updates on every main push)
- The **pipeline coverage** field in GitLab's pipeline view
- `test/coverage/lcov.info` and `test/coverage/coverage-summary.json` artifacts
  (retained for 30 days, downloadable from the job page)

## Coverage Metrics Explained

Jest reports four metrics for each file:

| Metric | What it counts |
|---|---|
| **Statements** | Individual executable statements |
| **Branches** | Each arm of if/else, ternary, switch, `??`, `?.` |
| **Functions** | Functions/methods defined and called at least once |
| **Lines** | Physical source lines containing executable code |

The README badge and CI extraction use **Statements %** as the headline number
(it is the most conservative and the industry default).

## Target

**≥ 80% statements** on the backend source.

Integration tests naturally miss:
- Rare error paths (e.g., DB connection lost mid-request)
- Some guard/interceptor edge cases not triggered via HTTP
- Generated Prisma client internals (excluded)

These gaps are acceptable for integration-level coverage. Unit tests would be
needed to push into the 90%+ range on isolated business logic.

## Improving Coverage

To find uncovered lines after a local run:

```bash
# Open lcov HTML report in browser
cd test && npm run test:cov
# Then check test/coverage/html/index.html
```

Focus on:
1. Files with `< 60%` branch coverage — those have untested decision paths
2. Any new service file with `0%` — means no test exercises that endpoint at all
3. Error-handling branches in financial services (wallet, orders, payments)
