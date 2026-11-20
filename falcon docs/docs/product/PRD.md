# Product Requirements Document — FALCON

**Version:** 0.1  
**Status:** Proposed  
**Owner:** Project team  
**Product category:** Developer tooling / code intelligence

## 1. Executive summary

FALCON is a repository-aware code-change impact analysis tool. It builds a structured model of source-code symbols and their relationships, analyzes changes between Git revisions, and explains which components may be affected. It can recommend a focused set of tests using dependency relationships and optional coverage evidence.

FALCON begins as a local CLI for TypeScript/JavaScript repositories. A service API, web dashboard and GitHub App are later delivery channels, not prerequisites for proving the core value.

## 2. Problem statement

A small source change can affect many downstream functions, modules, routes or services. Developers and reviewers often lack a reliable, explainable view of these relationships, especially in unfamiliar or growing repositories.

Existing practices help but leave gaps:
- Linters detect configured code-quality issues, not broad change propagation.
- Type checkers detect certain type errors, not all behavioral consequences.
- Unit tests detect failures covered by existing tests.
- Coverage reports show exercised code but do not independently determine the impact of a new change.
- Reviewers manually infer affected components, which is time-consuming and inconsistent.

The problem is not that developers have no tools. The problem is that evidence about change impact is fragmented.

## 3. Product vision

Before a change is merged, a developer can ask:

- What changed at file and symbol level?
- Which known callers, importers or dependent modules are reachable from the changed symbols?
- What is directly affected versus transitively connected?
- Which relationships are unresolved or dynamic?
- Which tests are plausibly relevant?
- Why did FALCON include each item?

## 4. Target users

### Primary
- Software engineers working in TypeScript/JavaScript repositories.
- Reviewers handling changes in unfamiliar codebases.
- Maintainers of monorepos and modular backend applications.

### Secondary
- Engineering leads interested in coupling, hotspots and test gaps.
- CI owners seeking evidence-based test selection.

## 5. Jobs to be done

1. When I modify a function, show me its statically discoverable callers.
2. When I open a PR, summarize modified symbols and their dependency reachability.
3. When I need tests, recommend tests connected to the changed code and explain the mapping.
4. When analysis cannot resolve a relationship, tell me instead of hiding uncertainty.
5. When I investigate risk, show the evidence and path behind the result.

## 6. Goals

### MVP goals
- Analyze a local TypeScript repository.
- Extract files, symbols, imports and statically discoverable call relationships.
- Build a directed dependency graph.
- Compare two Git revisions.
- Identify changed symbols and reachable dependents.
- Produce deterministic JSON and human-readable terminal reports.
- Explain each impact path and expose unresolved analysis cases.

### Later goals
- Test-to-code mapping and coverage ingestion.
- Incremental analysis.
- GitHub App and PR status/report.
- Web dashboard and interactive graph.
- Additional languages.
- Historical architecture insights.

## 7. Non-goals

For the MVP, FALCON will not:
- Prove that a change will or will not cause a runtime bug.
- Replace unit, integration, end-to-end or security testing.
- Guarantee complete resolution of reflection, dynamic imports, runtime dependency injection or generated code.
- Automatically approve or block a PR based on an unvalidated risk score.
- Execute arbitrary repository scripts.
- Send source code to an LLM or external service.
- Support every programming language.
- Provide full interprocedural data-flow or formal verification.

## 8. Product principles

- Explain every result.
- Label uncertainty.
- Prefer useful partial analysis over false certainty.
- Keep core analysis local and deterministic.
- Be safe with untrusted repositories.
- Measure quality with labeled fixtures and real-world evaluation.

## 9. Core user journey

1. Developer runs `falcon analyze .`.
2. FALCON scans eligible source files.
3. Parser extracts symbols and relationships.
4. Graph builder creates a repository snapshot.
5. Developer runs `falcon impact --base main --target HEAD`.
6. Diff engine identifies changed files and symbols.
7. Impact engine traverses reverse dependency edges.
8. Report lists affected symbols, paths, confidence and unresolved cases.
9. Developer uses report to guide review and test selection.

## 10. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Accept a local repository path | P0 |
| FR-02 | Detect supported TS/JS source files | P0 |
| FR-03 | Exclude configured generated/vendor directories | P0 |
| FR-04 | Parse files and extract symbol declarations | P0 |
| FR-05 | Resolve static imports/exports where possible | P0 |
| FR-06 | Extract statically discoverable call edges | P0 |
| FR-07 | Build typed directed graph | P0 |
| FR-08 | Compare Git base and target revisions | P0 |
| FR-09 | Match changed symbols across revisions | P0 |
| FR-10 | Compute direct and transitive impact | P0 |
| FR-11 | Show a reason/path for every impacted symbol | P0 |
| FR-12 | Emit JSON and terminal reports | P0 |
| FR-13 | Report unresolved imports and unsupported patterns | P0 |
| FR-14 | Map tests to symbols | P1 |
| FR-15 | Ingest coverage reports | P1 |
| FR-16 | Incrementally update analysis | P1 |
| FR-17 | GitHub PR integration | P2 |
| FR-18 | Web dashboard | P2 |

## 11. Non-functional requirements

- **Correctness:** deterministic output for identical repository content, configuration and tool version.
- **Transparency:** each edge includes provenance and resolution status.
- **Performance:** establish baseline measurements before setting hard limits; see `BENCHMARK_PLAN.md`.
- **Reliability:** malformed or unsupported files should produce diagnostics, not crash the entire run.
- **Security:** do not execute repository code by default; constrain filesystem and subprocess access.
- **Portability:** support current LTS Node.js on Linux, macOS and Windows where dependencies permit.
- **Maintainability:** isolate parser, graph, diff, impact and output modules.
- **Privacy:** local CLI analysis remains local unless the user explicitly configures a future hosted service.

## 12. Success metrics

Initial quality metrics:
- Symbol extraction precision/recall on curated fixtures.
- Import resolution precision/recall.
- Call-edge precision/recall on curated fixtures.
- Impact precision and recall against manually labeled changes.
- Percentage of unresolved relationships surfaced in diagnostics.
- Full-analysis wall-clock time and peak memory.
- Incremental analysis speedup when implemented.

Product usage metrics for a later hosted version:
- Repositories analyzed.
- PR analyses completed.
- Report usefulness feedback.
- Recommended-test selection rate and missed-failure rate.

Do not set a target such as “90% accurate” until the evaluation corpus and metric definition exist.

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Static analysis misses dynamic behavior | Expose unresolved/dynamic edges and document limitations |
| False positives overwhelm users | Rank by evidence and allow filtering |
| False negatives create misplaced confidence | Conservative language; evaluate recall; never claim safety |
| Large repos consume excessive resources | File limits, cancellation, timeouts and later incremental analysis |
| Repository code is malicious | Never run repository scripts by default; sandbox future execution |
| Test mapping is incomplete | Combine explicit mapping and coverage; show evidence level |
| Scope expands too quickly | Keep MVP CLI-only and TS/JS-only |

## 14. Competitive positioning

FALCON should be evaluated against categories, not caricatures:
- Linters and type checkers.
- Test selection and test impact tools.
- Code search and code navigation.
- Dependency graph and architecture tools.
- Observability and code review platforms.

The product hypothesis is an explainable workflow that connects symbol-level change detection, dependency reachability and test recommendations. Validate this through a competitor study and user interviews before making superiority claims.

## 15. Open questions

- Which TypeScript module systems and path alias configurations are in MVP?
- How should test files be recognized?
- Which coverage formats should be supported first?
- What maximum repository size should be included in the first benchmark?
- Should GitHub integration run in customer infrastructure or a hosted worker?
- Which findings should be warnings versus informational diagnostics?
