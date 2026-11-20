# ADR-0002: Use TypeScript Compiler API for initial language support

- **Status:** Accepted for MVP
- **Date:** 2026-11-20

## Context

FALCON needs syntax trees and semantic resolution for TypeScript/JavaScript. Supporting many languages immediately would multiply parser and resolver complexity.

## Decision

Use the TypeScript Compiler API for initial TS/JS parsing and semantic queries. Keep parser-specific details behind internal interfaces so other language frontends can be added later.

## Consequences

Positive:
- Native TypeScript syntax and type-checker access.
- Good fit for initial target repositories.
- One ecosystem and toolchain to validate.

Negative:
- Initial language coverage is limited.
- Compiler configuration and project references need careful handling.
- Some dynamic/runtime relationships remain unresolved.

## Revisit when

The TS/JS pipeline is evaluated and stable, and a concrete user need justifies another language frontend.
