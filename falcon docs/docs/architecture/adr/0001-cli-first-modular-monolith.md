# ADR-0001: CLI-first modular monolith

- **Status:** Accepted for MVP
- **Date:** 2026-11-20

## Context

The main technical uncertainty is whether FALCON can extract useful, explainable dependency relationships and compute useful impact reports. Building a hosted service or dashboard first would add infrastructure before validating the core engine.

## Decision

Build a local CLI backed by independently testable TypeScript packages. Keep analysis logic separate from filesystem/Git adapters and future product interfaces.

## Consequences

Positive:
- Fast feedback on analysis quality.
- Easy fixture-based testing.
- No early auth, queue or deployment complexity.
- Core engine can later be reused by API and worker.

Negative:
- Initial user experience is terminal-based.
- Persistence and multi-user workflows are deferred.
- Some interfaces may need refinement when service requirements emerge.

## Revisit when

The core CLI is stable and there is validated demand for team/PR workflows.
