# FALCON Development Rules

These rules apply to human contributors and AI coding agents. They are project constraints, not suggestions.

## 1. Operating principles

- Read `README.md`, `PRD.md`, `TRD.md`, `MVP.md`, `ARCHITECTURE.md`, and the relevant module docs before changing code.
- Inspect the existing repository before proposing or creating files. Do not overwrite working code or silently replace project conventions.
- Implement the smallest complete vertical slice. Avoid speculative abstractions and premature infrastructure.
- Prefer deterministic, explainable algorithms over AI-generated conclusions.
- Do not claim a feature works unless it is implemented and covered by tests.
- Do not fabricate benchmark results, test outcomes, repository facts, or supported-language coverage.
- If requirements conflict, stop and document the conflict rather than silently choosing.

## 2. Architecture boundaries

- TypeScript is the initial implementation language.
- The core analysis packages must not depend on the web app, HTTP framework, GitHub SDK, database, Redis, or UI.
- Keep pure analysis logic deterministic and side-effect-free where practical.
- Put filesystem, Git, database, queue and network access behind explicit adapters.
- Use dependency injection at module boundaries; avoid service locators and hidden global state.
- The CLI must call the same public application/core interfaces intended for later API use.
- Do not introduce microservices for the MVP.
- Do not add an LLM dependency to parsing, symbol resolution, graph construction, impact computation or risk scoring.

## 3. TypeScript standards

- Enable `strict` TypeScript settings.
- Avoid `any`; use `unknown` at untrusted boundaries and narrow it.
- Model domain concepts with explicit types and discriminated unions.
- Validate external input at runtime.
- Prefer named exports.
- Avoid giant files and giant functions. Separate orchestration from domain logic.
- Comments should explain non-obvious reasoning, invariants or trade-offs, not restate code.
- Handle errors explicitly; never swallow exceptions.
- Do not use unsafe shell-string interpolation. Pass arguments as arrays to process APIs.

## 4. Analysis correctness

- Every graph node and edge must have a stable identity within an analysis snapshot.
- Preserve source locations: repository-relative path, start/end line and column where available.
- Track edge provenance and confidence.
- Never silently interpret unresolved dynamic behavior as “no dependency”.
- Report unsupported syntax, unresolved imports and analysis exclusions.
- Separate direct dependencies from transitive reachability.
- Avoid calling reachability “proof of runtime impact”.
- Risk scores are heuristic indicators, not probabilities, unless statistically calibrated and validated.
- Never describe a PR as “safe” based only on static analysis.

## 5. Repository and Git safety

- Treat repository contents, filenames, Git metadata and package scripts as untrusted.
- Never execute repository scripts, package lifecycle hooks, tests or builds by default.
- For MVP local analysis, read source files and invoke Git in read-only mode.
- Use argument arrays, timeouts, output limits and explicit working directories for subprocesses.
- Reject paths escaping the repository root after canonicalization.
- Respect `.gitignore` where practical and always exclude generated/vendor directories by default.
- Do not upload source code to third-party services.
- Do not store access tokens in logs, reports or test fixtures.

## 6. Testing requirements

- Add unit tests for every algorithmic behavior and important edge case.
- Add fixture repositories with known expected symbols, edges and impact paths.
- Include negative tests: unresolved import, dynamic import, circular dependency, duplicate symbol names, deleted symbol and renamed symbol.
- Add regression tests for every fixed bug.
- Tests must not depend on network access.
- A change is not complete until relevant tests, typecheck and lint pass.
- Do not weaken assertions or delete tests merely to make a build pass.

## 7. Dependencies and tooling

- Use pnpm workspaces.
- Pin or constrain dependencies consistently using the lockfile.
- Add a dependency only when its value is clear; explain significant additions.
- Prefer the TypeScript Compiler API for TypeScript semantic analysis.
- Do not add a graph database for the initial implementation; use an in-memory adjacency representation and PostgreSQL later if persistence is needed.
- Keep package scripts documented and reproducible.

## 8. AI agent workflow

For each task, the agent must:
1. Restate the goal and identify affected modules.
2. Inspect relevant code and docs.
3. Propose a concise implementation plan.
4. Identify assumptions and risks.
5. Implement only the requested scope.
6. Add or update tests.
7. Run tests, typecheck and lint where available.
8. Summarize changed files, behavior, commands run and known limitations.

The agent must ask before:
- Changing public APIs or persisted schemas incompatibly.
- Adding a new runtime service or major dependency.
- Changing security boundaries or repository execution behavior.
- Removing features or rewriting large modules.
- Making irreversible Git or filesystem changes.

## 9. Definition of done

A task is done only when:
- Acceptance criteria are met.
- Types are correct.
- Relevant tests pass.
- Errors and unsupported cases are handled.
- Documentation is updated.
- No secrets or generated artifacts are committed.
- Limitations are stated honestly.
