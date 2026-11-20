# FALCON

> Explainable code-change impact analysis for TypeScript & JavaScript repositories.

## Overview

FALCON is a developer tool that analyzes a repository, constructs a symbol-level dependency graph, compares Git revisions, and explains which code components and tests may be affected by changes.

### Core Principles

1. **Explainability over mystery:** Every impact result includes a traceable reason and path.
2. **Conservative claims:** Clear confidence levels (`confirmed`, `inferred`, `unresolved`, `unknown`). Never asserts safety just because no impact is found.
3. **Static analysis first:** Deterministic AST and compiler analysis without mandatory LLM or remote calls.
4. **Safe by default:** Inspects untrusted repositories without executing arbitrary repository scripts.
5. **Modular architecture:** Clean package boundaries across parsing, extraction, graph resolution, diffing, impact traversal, and reporting.

## Monorepo Packages

- [`@falcon/domain`](packages/domain): Core entities, error models, and typed contracts.
- [`@falcon/repository`](packages/repository): Safe repository scanning, ignore handling, and content hashing.
- [`@falcon/parser`](packages/parser): TypeScript compiler integration and AST processing.
- [`@falcon/extractor`](packages/extractor): Declaration, call, import, and export extraction.
- [`@falcon/resolver`](packages/resolver): Module and symbol resolution.
- [`@falcon/graph`](packages/graph): In-memory directed graph with reverse adjacency traversal.
- [`@falcon/diff`](packages/diff): Git diff engine and cross-revision symbol matching.
- [`@falcon/impact`](packages/impact): Reverse reachability and impact path calculation.
- [`@falcon/risk`](packages/risk): Explainable heuristic risk factors.
- [`@falcon/report`](packages/report): JSON schema and terminal output formatting.
- [`falcon`](packages/cli): Unified CLI entrypoint.

## Development

```bash
# Install dependencies
pnpm install

# Start TypeScript incremental watch mode
pnpm dev

# Build all packages
pnpm build

# Typecheck
pnpm typecheck

# Run test suite
pnpm test

# Lint and format
pnpm lint
pnpm format:check
```

## Project Status

Track current roadmap progress and implemented packages in [**`IMPLEMENTATION_STATUS.md`**](IMPLEMENTATION_STATUS.md).

## Documentation

Full project design, algorithms, specs, and roadmap can be found in [`falcon docs/`](falcon docs/README.md).
