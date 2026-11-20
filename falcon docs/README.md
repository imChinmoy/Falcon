# FALCON — Project Documentation Pack

**Product:** FALCON — explainable code-change impact analysis  
**Initial target:** TypeScript / JavaScript repositories  
**Delivery shape:** CLI-first analysis engine, followed by API, dashboard and GitHub integration  
**Status:** Proposed baseline; validate decisions as implementation progresses.

## What FALCON does

FALCON analyzes a repository, builds a symbol-level dependency model, compares two Git revisions, and reports code that may be affected by a proposed change. It can also recommend relevant tests using static relationships and optional coverage data.

FALCON is a decision-support tool, not a correctness oracle. Its findings must distinguish confirmed relationships from inferred or unknown relationships. It must never claim that a change is safe merely because no impact was found.

## Documentation map

| Document | Purpose |
|---|---|
| `docs/product/PRD.md` | Product problem, users, goals, scope and success metrics |
| `docs/engineering/TRD.md` | Technical architecture, stack and engineering constraints |
| `docs/product/MVP.md` | Strict first-release scope and acceptance criteria |
| `DEV_RULES.md` | Instructions and guardrails for AI coding agents and contributors |
| `ARCHITECTURE.md` | System boundaries, components and data flow |
| `DATA_MODEL.md` | Core entities and persistence model |
| `ANALYSIS_ALGORITHM.md` | Parsing, graph, diff, impact and risk algorithms |
| `API_SPEC.md` | Proposed API contract for the later service layer |
| `CLI_SPEC.md` | CLI commands and output contract |
| `TEST_STRATEGY.md` | Test layers, fixtures and quality gates |
| `SECURITY.md` | Threat model and secure implementation requirements |
| `ROADMAP.md` | Phases, milestones and definition of done |
| `BENCHMARK_PLAN.md` | Performance and quality evaluation |
| `GLOSSARY.md` | Shared terminology |
| `docs/architecture/adr/` | Architecture Decision Records |

## Non-negotiable product principles

1. **Explainability over mystery:** every impact result must include a traceable reason.
2. **Conservative claims:** distinguish `confirmed`, `inferred`, `unknown` and `unresolved`.
3. **Static analysis first:** core analysis must work without an LLM or external API.
4. **Safe by default:** analyze untrusted repositories in isolated, resource-limited environments.
5. **Incremental later, correctness first:** establish a correct full-analysis baseline before optimizing.
6. **Evidence-based metrics:** publish precision, recall, runtime and limitations; do not invent accuracy claims.
7. **Small modules:** keep parsing, graph construction, diffing, impact analysis and presentation independently testable.

## Suggested first action

Read `DEV_RULES.md`, `docs/product/PRD.md`, `docs/engineering/TRD.md`, and `docs/product/MVP.md`. Then implement the CLI-first core described in `ROADMAP.md`. Do not start with authentication, billing, a dashboard, or microservices.
