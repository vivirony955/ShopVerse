# CI Pipeline

> Snapshot of what runs on every push and pull request / merge request.
> Last refresh: 2026-05-31. Re-run quarterly. The source of truth is
> the workflow files; this document is a navigable map of them.

ShopVerse runs CI on **two platforms in parallel** — GitHub Actions
(`.github/workflows/`) and GitLab CI (`.gitlab-ci.yml`). Neither is
authoritative on its own; pulling a change into `main` requires
both to be green. The reason is historical: the repo was mirrored
from GitHub to GitLab partway through the W1–W6 architecture
programme and the duplication has paid off twice (once when GitHub
Actions had a regional outage; once when GitLab runners got stuck
behind a Docker Hub rate-limit). The two pipelines are kept in step
by this document and by the test-count comments in `.gitlab-ci.yml`.

## What each layer gates

| Test layer                              | Tests | GitHub                        | GitLab                       |
|-----------------------------------------|-------|-------------------------------|------------------------------|
| Backend TypeScript compile              | n/a   | `ci.yml/typecheck`            | `typecheck`                  |
| Backend ESLint                          | n/a   | `ci.yml/lint`                 | `lint`                       |
| Backend Nest unit specs (mocked Prisma) | 42 spec files | ❌ (covered by GitLab)| `unit`                       |
| Backend integration (real Postgres)     | 714 + 6 | `ci.yml/test`               | `integration` (with coverage gate) |
| Backend Jest e2e (supertest)            | ~?    | ❌ (covered by GitLab)        | `e2e`                        |
| `@shopverse/sdk`                        | 66    | `packages.yml/sdk`            | `unit`                       |
| `@shopverse/cli`                        | 25    | `packages.yml/cli`            | `unit`                       |
| `@shopverse/eslint-plugin-shopverse`    | 32    | `packages.yml/eslint-plugin`  | `unit`                       |
| `create-shopverse-plugin`               | 9     | `packages.yml/create-plugin`  | `unit`                       |
| Prisma schema validation                | n/a   | `ci.yml/schema`               | `schema:validate`            |
| SBOM (CycloneDX)                        | n/a   | `ci.yml/sbom`                 | ❌                           |
| Helm lint + kubeconform                 | n/a   | `ci.yml/helm-lint`            | ❌ (Helm chart in repo, not deployed via GL) |
| K8s raw manifest validation             | n/a   | `ci.yml/k8s-validate`         | ❌                           |
| CodeQL (JS/TS security)                 | n/a   | `codeql.yml`                  | covered by GitLab SAST       |
| GitLab security scans (SAST/Secret/DepScan) | n/a | ❌                          | `include:` templates         |
| Sentry release / sourcemaps             | n/a   | `ci.yml/sentry-release` (main) | ❌                          |
| Frontend tsc                            | n/a   | `frontend.yml/typecheck`      | `frontend:typecheck`         |
| Frontend lint (next lint)               | n/a   | `frontend.yml/lint`           | `frontend:lint`              |
| Frontend Jest (jest-axe + units)        | 2+    | `frontend.yml/unit-tests`     | `frontend:unit`              |
| Bundle / hydration / plugin-memory budgets | n/a | `frontend.yml/bundle-size`  | `frontend:bundle`            |
| Lighthouse delta gate                   | gate  | `frontend.yml/lighthouse` (self-skip) | ❌ deferred POST_W6 §4.1 |
| k6 perf regression                      | gate  | `bench-regression.yml/k6-bench` (self-skip) | ❌ deferred POST_W6 §4.1 |
| Frontend Playwright e2e                 | 222   | ❌ deferred POST_W6 §4.1      | ❌ deferred POST_W6 §4.1     |
| Container build + push                  | n/a   | ❌ (handled separately)       | `build:backend`, `build:frontend` |
| GitLab Release (tag-only)               | n/a   | ❌                            | `release`                    |
| SSH deploy (staging / production)       | n/a   | ❌ (handled separately)       | `deploy:staging`, `deploy:production` |

Coverage after this snapshot:

- **Unique tests gated on at least one platform**: ~852 of 1086 (78.4%).
- **Tests still uncovered**: 222 Playwright (waiting on POST_W6 §4.1).

## GitHub Actions — workflow inventory

Trigger model: every job runs on `push` to `main` and on every `pull_request` targeting `main`.

### `.github/workflows/ci.yml`

| Job | Gate | Typical wall time |
|---|---|---|
| `typecheck` | backend `tsc --noEmit` | ~70 s |
| `lint` | backend `npm run lint` | ~75 s |
| `test` | 714 integration tests + 6 W6 admin-plugins tests, real Postgres service | ~6 min |
| `schema` | `prisma validate` | ~30 s |
| `sbom` | CycloneDX SBOM artifact | ~45 s |
| `helm-lint` | helm + kubeconform on the chart | ~30 s |
| `k8s-validate` | envsubst + kubeconform on raw manifests | ~30 s |
| `sentry-release` | sourcemap upload (push to main only) | ~50 s |

Shared install logic in `.github/actions/setup-sdk-and-backend/` (composite
action — referenced by `typecheck`, `lint`, `test`).

### `.github/workflows/packages.yml`

| Job | Gate | Wall time |
|---|---|---|
| `sdk` | `@shopverse/sdk` (66 tests) | ~40 s |
| `cli` | `@shopverse/cli` (25 tests; builds SDK first because of `file:../sdk` dep) | ~50 s |
| `eslint-plugin` | `@shopverse/eslint-plugin-shopverse` (32 tests) | ~40 s |
| `create-plugin` | `create-shopverse-plugin` (9 tests) | ~30 s |

All 4 jobs are independent — failure in one doesn't block the others.

### `.github/workflows/frontend.yml`

| Job | Gate | Wall time |
|---|---|---|
| `typecheck` | frontend `tsc --noEmit` | ~50 s |
| `lint` | `next lint --max-warnings=0` | ~45 s |
| `unit-tests` | frontend Jest (jest-axe slot a11y + future Jest specs) | ~45 s |
| `bundle-size` | bundle + hydration + plugin-memory budgets | ~3 min |
| `lighthouse` | self-skips unless `LIGHTHOUSE_BASE_URL` is set | ~30 s (skipped) / ~3 min (active) |

### `.github/workflows/bench-regression.yml`

| Job | Gate | Wall time |
|---|---|---|
| `k6-bench` | k6 perf regression vs `bench/baseline.json`; self-skip without `BENCH_BASE_URL` | ~30 s (skipped) / ~5 min (active) |

### `.github/workflows/codeql.yml`

| Job | Gate | Wall time |
|---|---|---|
| `analyze` | CodeQL SAST scan (JS/TS) | ~6 min, runs on push + PR + weekly schedule |

## GitLab CI — pipeline inventory

Trigger model: pipelines only spawn on **merge requests**, **semver tags**,
**web-UI "Run pipeline"**, **API trigger token**, or **scheduled runs**.
Plain branch pushes produce zero pipelines (operator-explicit verification model).

Stages: `validate` → `test` → `build` → `release` → `deploy`.

### `validate` stage (parallel; ~60 s)

| Job | Gate |
|---|---|
| `typecheck` | backend `tsc --noEmit` |
| `lint` | backend `npm run lint` |
| `schema:validate` | `prisma validate` |
| `frontend:typecheck` | frontend `tsc --noEmit` |
| `frontend:lint` | `next lint --max-warnings=0` |

Each job's `before_script` uses `!reference [.shared_install, before_script]`
to dedupe the SDK build + backend install pair. The `.shared_install`
anchor is defined after the `default:` block at the top of the file.

### `test` stage (parallel)

| Job | Gate | Tests |
|---|---|---|
| `unit` | backend Nest specs + 4 package suites | 42 backend specs + 132 package tests |
| `integration` | full integration suite with `--coverage` gate (jest.config.ts `coverageThreshold`) | 714 + 6 admin-plugins |
| `e2e` | backend Jest e2e (supertest against in-process Nest app) | ? |
| `frontend:unit` | frontend Jest (jest-axe slot a11y + future units) | 2+ |
| `frontend:bundle` | bundle + hydration + plugin-memory budgets | ~ |

GitLab Security templates injected via `include:`:
- `Secret-Detection` (gitleaks)
- `Dependency-Scanning` (gemnasium)
- `SAST` (semgrep + typescript-eslint security ruleset)

### `build` stage (push to main + tags only)

| Job | Gate | Wall time |
|---|---|---|
| `build:backend` | Docker image push to GitLab registry, tags: `$CI_COMMIT_SHA`, `latest`, `$CI_COMMIT_TAG` (if tag) | ~4 min |
| `build:frontend` | Same, frontend image | ~4 min |

### `release` stage (semver tags only)

| Job | Gate |
|---|---|
| `release` | creates GitLab Release entry with pull instructions |

### `deploy` stage (manual approval)

| Job | Trigger | Approval |
|---|---|---|
| `deploy:staging` | push to main, manual | yes |
| `deploy:production` | semver tag, manual | yes |

## Known gaps + their tickets

| Gap | Plan reference | Unblocked by |
|---|---|---|
| Playwright e2e on either platform | POST_W6_REMEDIATION_PLAN.md §1.4 | §4.1 staging URL |
| Lighthouse delta gate active (real perf scores) | §4.2 | §4.1 staging URL |
| k6 perf regression gate active (real baseline) | §4.3 | §4.1 staging URL |
| `/admin/plugins` runtime metrics endpoint | §4.4 | independent |
| Backend Nest unit + e2e in GitHub Actions | this doc | deliberately deferred — GitLab covers them, doubling maintenance for marginal benefit |
| Lighthouse + k6 on GitLab | this doc | POST_W6 §4.1 lands, then port the self-skip pattern |
| Test coverage report uploaded to Codecov/Coveralls (GitHub) | POST_W6 §5.3 | independent (GitLab already gates coverage via jest threshold) |

## Refresh cadence

This document drifts as workflows change. Refresh quarterly or after any
PR that adds/removes a job. Suggested workflow:

1. `ls .github/workflows/` — compare to the tables above.
2. `node -e "const y=require('js-yaml'); const f=require('fs').readFileSync('.gitlab-ci.yml','utf8'); const refType=new y.Type('!reference',{kind:'sequence',construct:d=>({_ref:d})}); const sch=y.DEFAULT_SCHEMA.extend([refType]); const doc=y.load(f,{schema:sch}); console.log(Object.keys(doc).filter(k=>doc[k]&&doc[k].stage&&!k.startsWith('.')).join('\n'));"` — list GitLab jobs.
3. For each missing / extra row, update this doc.
4. Update the "Last refresh" date at the top.
