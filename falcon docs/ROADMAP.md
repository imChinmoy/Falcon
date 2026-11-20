# FALCON Development Roadmap

Estimates are planning ranges, not commitments. Adjust based on test results and actual complexity.

## Phase 0 — Project foundation
**Goal:** Reproducible repository and contributor workflow.

Deliver:
- pnpm workspace.
- Strict TypeScript configuration.
- Lint, format, typecheck and Vitest.
- Package boundaries.
- CI workflow.
- Documentation baseline.

Exit criteria: clean clone can install, test and typecheck.

## Phase 1 — Repository ingestion
**Goal:** Discover supported source files safely.

Deliver:
- Root validation.
- File discovery.
- Ignore/exclude rules.
- Content hashing.
- File diagnostics.

Exit criteria: fixture file inventory matches expected output.

## Phase 2 — Parser and symbols
**Goal:** Extract structured code entities.

Deliver:
- TypeScript Program creation.
- AST visitors.
- Symbol declarations and source locations.
- Imports and exports.
- Parse diagnostics.

Exit criteria: golden symbol fixtures pass.

## Phase 3 — Resolution and graph
**Goal:** Build useful dependency relationships.

Deliver:
- Module resolution.
- Symbol resolution.
- Call edges.
- Typed graph.
- Reverse adjacency.
- Cycle-safe traversal.

Exit criteria: known fixture graph matches expected edges.

## Phase 4 — Git diff and symbol matching
**Goal:** Compare revisions.

Deliver:
- Git adapter.
- File status detection.
- Old/new parsing.
- Symbol matching.
- Added/deleted/modified classification.

Exit criteria: commit-pair fixtures pass, ambiguous matches surfaced.

## Phase 5 — Impact and reports
**Goal:** Produce explainable impact results.

Deliver:
- Reverse reachability.
- Impact paths.
- Direct/transitive labels.
- Diagnostics and confidence.
- JSON schema and terminal report.
- Initial evidence-based risk factors.

Exit criteria: demo scenario produces expected findings and no false certainty claims.

## Phase 6 — Test intelligence
**Goal:** Recommend relevant tests.

Deliver:
- Test-file discovery.
- Static test mapping.
- Optional coverage ingestion.
- Test recommendation report.
- Evidence levels.

Exit criteria: fixture tests demonstrate selection quality and limitations.

## Phase 7 — Performance and incremental analysis
**Goal:** Improve large-repository behavior.

Deliver:
- Benchmarks.
- Content-hash cache.
- Incremental parse and graph invalidation.
- Bounded concurrency.
- Cancellation and resource limits.

Exit criteria: measured improvement without correctness regression.

## Phase 8 — Product layer
**Goal:** Make FALCON accessible to teams.

Deliver:
- Fastify API.
- PostgreSQL persistence.
- Redis/BullMQ worker orchestration.
- Authentication and authorization.
- GitHub App.
- Dashboard and graph explorer.

Exit criteria: secure end-to-end PR analysis in a controlled environment.

## Scope guard

Do not begin Phase 8 while Phase 5 is unstable. A polished UI cannot compensate for inaccurate graph analysis.
