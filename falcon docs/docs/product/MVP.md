# FALCON MVP Definition

## 1. MVP statement

A local CLI that analyzes a TypeScript/JavaScript Git repository, constructs a symbol-level dependency graph, compares two revisions, and emits an explainable list of potentially affected symbols.

## 2. In scope

- Local repository path.
- `.ts`, `.tsx`, `.js`, `.jsx` source files (define exact defaults in config).
- Ignore common generated/vendor directories.
- AST parsing using TypeScript Compiler API.
- Extract function/class/interface/type/variable declarations.
- Resolve relative static imports and exports.
- Extract statically resolvable function calls where feasible.
- Build directed graph and reverse adjacency.
- Git base/target comparison.
- Basic symbol matching.
- Direct/transitive impact report.
- JSON and terminal output.
- Diagnostics for unresolved or unsupported cases.
- Unit tests and fixture repositories.

## 3. Out of scope

- GitHub OAuth/App.
- Hosted multi-tenant service.
- Web dashboard.
- Authentication and billing.
- Redis, queues and PostgreSQL.
- Automatic test execution.
- LLM analysis.
- Full dynamic dispatch, reflection or runtime dependency injection.
- Multi-language support beyond TS/JS.
- Guaranteed-safe PR approval.

## 4. MVP user stories

### US-01: Analyze repository
As a developer, I can point FALCON at a local repository and receive a summary of files and symbols discovered.

Acceptance:
- Invalid path produces actionable error.
- File discovery is deterministic.
- Excluded paths are reported or inspectable.
- Parse failures appear as diagnostics.
- A partial failure does not hide successful analysis.

### US-02: Inspect dependencies
As a developer, I can query a symbol and see its known callers/dependents.

Acceptance:
- Symbol identity is unambiguous.
- Direct and transitive relationships are separated.
- Each relationship includes source location and evidence.
- Circular dependencies do not cause infinite loops.

### US-03: Compare revisions
As a developer, I can compare base and target Git revisions.

Acceptance:
- Added, modified and deleted files are detected.
- Changed symbols are listed.
- Ambiguous symbol matching is flagged.
- Missing Git refs produce clear errors.

### US-04: Analyze impact
As a developer, I can see known downstream dependents of changed symbols.

Acceptance:
- Impact paths are included.
- Direct and transitive impact are labeled.
- Traversal limits are visible.
- Unresolved relationships are reported.
- Output does not claim runtime certainty.

### US-05: Export report
As a developer, I can consume a stable JSON report in scripts.

Acceptance:
- JSON schema is versioned.
- Output is deterministic for same inputs.
- Diagnostics and analyzer version are included.
- Human output is readable and concise.

## 5. MVP commands

```bash
falcon analyze .
falcon graph .
falcon impact --base main --target HEAD
falcon impact --base main --target HEAD --format json
falcon inspect-symbol "src/pricing.ts:calculatePrice"
```

Exact syntax may change during CLI implementation, but commands must be documented and tested.

## 6. Acceptance gate

MVP is complete only when:
- Fixture tests validate symbol extraction and graph edges.
- Diff fixtures validate add/modify/delete behavior.
- Impact fixtures validate expected paths.
- Cycles and unresolved references are handled.
- JSON output is schema-validated.
- CLI works on a clean checkout with documented setup.
- No repository scripts are executed.
- Limitations are clearly documented.

## 7. Demo scenario

Create a fixture repository:
- `pricing.ts` exports `calculatePrice`.
- `checkout.ts` calls it.
- `invoice.ts` calls it.
- Test files import the relevant modules.

Change the `calculatePrice` signature between two commits. Run FALCON and demonstrate:
- The changed symbol.
- Direct dependents.
- Transitive dependents.
- Related tests where mapping exists.
- The evidence path and any uncertainty.

This is the primary MVP demo.
