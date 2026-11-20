# ADR-0003: Start with an in-memory graph

- **Status:** Accepted for MVP
- **Date:** 2026-11-20

## Context

The MVP requires graph traversal, not a general-purpose graph query service. A graph database adds operational cost before query patterns and scale are known.

## Decision

Use typed node/edge collections and adjacency maps in memory. Persist analysis artifacts as JSON only if needed. Re-evaluate PostgreSQL persistence later; introduce a graph database only with measured evidence.

## Consequences

Positive:
- Simple local development.
- Low operational overhead.
- Predictable traversal complexity.
- Easy unit testing.

Negative:
- Full graph must fit in worker memory.
- Cross-run graph queries are not available by default.
- Persistence and incremental updates need later design.

## Revisit when

Benchmarks demonstrate memory or query constraints that cannot be addressed with indexing, caching or bounded analysis.
