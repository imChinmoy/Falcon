# Technical Requirements Document — FALCON

**Version:** 0.1  
**Status:** Proposed baseline

## 1. Technical objective

Implement a deterministic, modular analysis engine that:
1. Reads a repository safely.
2. Parses TypeScript/JavaScript source.
3. Extracts symbols and typed relationships.
4. Builds a directed graph.
5. Computes a revision diff.
6. maps changed symbols to graph nodes.
7. Computes explainable reverse dependency reachability.
8. Emits machine-readable and human-readable reports.

## 2. Proposed stack

| Concern | Initial choice | Reason |
|---|---|---|
| Runtime | Node.js LTS | Mature TS tooling |
| Language | TypeScript strict | Shared language across engine and product |
| Workspace | pnpm | Monorepo and package management |
| Parser | TypeScript Compiler API | Native TS syntax and semantic services |
| Git | Git CLI via safe process wrapper | Mature diff and revision support |
| Graph | In-memory adjacency maps | Simple, fast MVP; no graph DB required |
| CLI | Commander or yargs (choose one) | Argument parsing |
| Tests | Vitest | Fast TS tests |
| Lint/format | ESLint + Prettier | Consistent code quality |
| Later API | Fastify | Small, typed Node HTTP layer |
| Later DB | PostgreSQL + Drizzle | Durable metadata and analysis records |
| Later queue | Redis + BullMQ | Background jobs |
| Later UI | Next.js + React Flow | Dashboard and graph exploration |
| Packaging | Docker | Reproducible service deployment |

## 3. System boundaries

### Core packages
- `repository`: file discovery and repository metadata.
- `parser`: AST parsing and diagnostics.
- `extractor`: symbols, imports, exports and calls.
- `resolver`: symbol and module resolution.
- `graph`: graph data structures and traversal.
- `diff`: Git revision and symbol diff.
- `impact`: changed-node mapping and impact paths.
- `risk`: explainable heuristic scoring.
- `report`: JSON and terminal report serialization.
- `cli`: command orchestration.

### Future application packages
- `api`: authentication, repository records, analysis requests.
- `worker`: queued analysis execution.
- `github`: installation, webhook validation and PR comments.
- `web`: dashboard.

Core packages must not import from future application packages.

## 4. Analysis data flow

`RepositoryPath -> FileDiscovery -> AST Parse -> Symbol Extraction -> Resolution -> Graph Build -> Git Diff -> Symbol Matching -> Impact Traversal -> Risk Factors -> Report`

Each stage should accept typed input and return typed output plus diagnostics. Prefer result types over throwing for expected partial-analysis conditions.

## 5. Parsing and symbol model

Extract at minimum:
- Function declarations.
- Method declarations.
- Class declarations.
- Interfaces.
- Type aliases.
- Enum declarations.
- Variable declarations with function/arrow-function initializers.
- Import declarations.
- Export declarations.
- Call expressions.

Each symbol should contain:
- Stable snapshot-local ID.
- Qualified name.
- Kind.
- Repository-relative file path.
- Start/end line and column.
- Export visibility.
- Optional signature fingerprint.
- Optional parent/container symbol.
- Parser/resolver confidence metadata.

Do not assume a symbol name is globally unique. Use file/module identity and declaration location.

## 6. Dependency model

Initial edge types:
- `IMPORTS_MODULE`
- `IMPORTS_SYMBOL`
- `CALLS`
- `REFERENCES`
- `EXTENDS`
- `IMPLEMENTS`
- `TESTS` (later, evidence-based)

Every edge includes:
- Source node ID.
- Target node ID.
- Relationship type.
- Provenance (AST node/location or coverage source).
- Resolution status.
- Confidence category.
- Optional notes.

For impact traversal, maintain reverse adjacency: from a changed dependency to its known dependents.

## 7. Git diff strategy

- Resolve base and target commits explicitly.
- Use Git diff name/status output to identify changed paths.
- Retrieve file content from each revision without checking out or executing code.
- Parse old and new versions.
- Match symbols using a layered strategy:
  1. Same file path + qualified name + kind.
  2. Same normalized signature and nearby structural context.
  3. Optional content fingerprint similarity for rename/move suggestions.
- Mark ambiguous matches as uncertain. Do not silently equate symbols based only on name.

## 8. Impact algorithm

For each changed or removed symbol:
- Add the changed symbol to the report.
- Traverse reverse dependency edges to discover known callers/dependents.
- Track shortest explanatory paths and edge evidence.
- Distinguish direct dependents from transitive dependents.
- Avoid infinite traversal with visited sets.
- Collapse strongly connected components or use visited-state handling for cycles.
- Apply configurable maximum depth and result limits for large graphs.
- Report truncated analysis explicitly.

Impact means “statically connected according to the analyzed graph”, not guaranteed runtime breakage.

## 9. Risk model

Initial risk should be a set of explainable factors, not a probability.

Candidate factors:
- Public API/signature changed.
- Number of direct dependents.
- Number of transitive dependents.
- Criticality label supplied by configuration.
- Unresolved dependency count near changed symbols.
- Test mapping absent or coverage gap.
- Change type: deletion, signature change, implementation-only edit.

Return factor values, rationale and configurable weights. Do not expose a single score without its component breakdown. Do not call it a probability of failure.

## 10. Persistence strategy

MVP: in-memory analysis, optional JSON artifact on disk.

Later PostgreSQL:
- repositories
- analysis_runs
- source_files
- symbols
- dependency_edges
- changed_symbols
- impact_findings
- test_mappings
- diagnostics

Use repository + commit SHA + analyzer version as snapshot identity. Store enough metadata to invalidate stale analysis when configuration or analyzer version changes.

## 11. Error handling

Expected diagnostics:
- Unsupported file extension.
- Parse error.
- Unresolved module.
- Ambiguous symbol.
- Dynamic import.
- Dynamic call.
- Excluded generated file.
- Git revision unavailable.
- File too large.
- Analysis limit reached.

One file failing to parse should not necessarily abort the repository analysis. Fatal repository/Git errors should fail the command with a non-zero exit code.

## 12. Performance approach

First implement a correct full scan. Measure:
- Files scanned.
- Parse time.
- Resolution time.
- Graph build time.
- Traversal time.
- Total runtime.
- Peak memory.

Then optimize:
- Cache parsed AST metadata keyed by content hash.
- Re-parse only changed files.
- Recompute edges affected by changed files.
- Persist snapshot artifacts.
- Add bounded concurrency.

Do not implement incremental graph mutation before full-analysis correctness is tested.

## 13. Deployment evolution

Stage 1: local CLI.  
Stage 2: API + worker + PostgreSQL + Redis.  
Stage 3: GitHub App and hosted or self-hosted execution.  
Stage 4: dashboard and organization features.

Never assume a hosted service should receive private source code without an explicit privacy and deployment model.
