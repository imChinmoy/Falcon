# FALCON Architecture

## 1. Architecture style

CLI-first modular monolith with clean package boundaries. A separate worker and API may be introduced after the core engine proves useful.

## 2. Context diagram

```mermaid
flowchart TD
    Dev[Developer] --> CLI[FALCON CLI]
    CLI --> Repo[Local Git Repository]
    CLI --> Core[Analysis Core]
    Core --> Parser[Parser and Extractors]
    Core --> Resolver[Symbol Resolver]
    Core --> Graph[Dependency Graph]
    Core --> Diff[Git Diff Engine]
    Core --> Impact[Impact Engine]
    Core --> Report[Report Generator]
    Report --> Dev
```

## 3. Core component responsibilities

| Component | Owns | Must not own |
|---|---|---|
| Repository scanner | File enumeration, ignore rules | Parsing semantics |
| Parser | AST creation and syntax diagnostics | Git operations |
| Extractor | Symbol and relationship candidates | UI/report formatting |
| Resolver | Module and symbol binding | Risk scoring |
| Graph engine | Nodes, edges, traversal | Filesystem access |
| Diff engine | Revision comparison and symbol matching | Graph visualization |
| Impact engine | Reachability and impact paths | HTTP or database |
| Risk engine | Heuristic factors and rationale | Claiming failure probability |
| Reporter | JSON/text serialization | Analysis decisions |
| CLI | Input validation and orchestration | Reimplementing domain logic |

## 4. Domain flow

```mermaid
flowchart TD
    A[Repository path and refs] --> B[Discover files]
    B --> C[Parse source]
    C --> D[Extract symbols]
    D --> E[Resolve relationships]
    E --> F[Build graph snapshot]
    G[Git base and target] --> H[Diff files]
    H --> I[Parse old and new versions]
    I --> J[Match changed symbols]
    F --> K[Impact traversal]
    J --> K
    K --> L[Risk factors]
    L --> M[Report]
```

## 5. Package dependency rules

- `domain` types are lowest-level and have no infrastructure dependency.
- `parser` may depend on TypeScript compiler packages.
- `graph` depends only on domain types.
- `impact` depends on graph interfaces and domain types.
- `diff` depends on Git adapter interfaces and parser/domain interfaces.
- `cli` composes adapters and use cases.
- Future `api` and `worker` compose the same use cases; they do not fork analysis logic.

## 6. Execution model

MVP is synchronous from the CLI user's perspective. Internally, operations may use bounded concurrency for parsing. Every analysis run has:
- Run ID.
- Repository root.
- Base and target refs (for impact runs).
- Analyzer version.
- Configuration hash.
- Start/end time.
- Diagnostics.
- Output artifact.

## 7. Future service topology

```mermaid
flowchart TD
    GH[GitHub Webhook] --> API[Fastify API]
    UI[Web Dashboard] --> API
    API --> Q[Redis Queue]
    Q --> W[Isolated Analysis Worker]
    W --> GIT[Read-only Repository Fetch]
    W --> DB[(PostgreSQL)]
    W --> OBJ[Artifact Storage]
    API --> DB
    API --> OBJ
```

Future hosted execution requires explicit tenant isolation, secret handling, quotas, source retention controls and sandboxing.
