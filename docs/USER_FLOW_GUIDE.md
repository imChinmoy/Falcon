# FALCON User Flow & Software Interaction Guide: How To and Why

> **A Complete Master Manual for Explainable Code-Change Impact Analysis, Test Intelligence, and Repository Graph Operations.**

---

## Table of Contents

1. [Executive Overview & Philosophy ("The Why")](#1-executive-overview-philosophy-the-why)
   - [The Crisis in Modern CI/CD Pipelines](#the-crisis-in-modern-cicd-pipelines)
   - [Why Compiler AST & Symbol Graphs Beat File/Regex Matching](#why-compiler-ast-symbol-graphs-beat-fileregex-matching)
   - [Explainability & Confidence Scoring vs. Black-Box AI Hallucination](#explainability-confidence-scoring-vs-black-box-ai-hallucination)
2. [System Architecture & Data Pipeline ("The How It Works")](#2-system-architecture-data-pipeline-the-how-it-works)
   - [High-Level End-to-End Architecture](#high-level-end-to-end-architecture)
   - [Detailed Pipeline Stages & Data Transformations](#detailed-pipeline-stages-data-transformations)
   - [Graph Foundations: Kahn's Algorithm & Cycle Protection](#graph-foundations-kahns-algorithm-cycle-protection)
3. [Interactive User Flows (Step-by-Step "How To")](#3-interactive-user-flows-step-by-step-how-to)
   - [Flow A: CLI Developer Flow](#flow-a-cli-developer-flow)
     - [A.1 Initializing & Scanning a Repository (`falcon analyze`)](#a1-initializing-scanning-a-repository-falcon-analyze)
     - [A.2 Inspecting Symbols & Call Graphs (`falcon inspect-symbol`)](#a2-inspecting-symbols-call-graphs-falcon-inspect-symbol)
     - [A.3 Multi-Revision Diff & Impact Analysis (`falcon impact`)](#a3-multi-revision-diff-impact-analysis-falcon-impact)
     - [A.4 Predictive Test Recommendations (`falcon test-recommend`)](#a4-predictive-test-recommendations-falcon-test-recommend)
     - [A.5 Programmatic Pipeline SDK (`runFalconAnalysisWorkflow`)](#a5-programmatic-pipeline-sdk-runfalconanalysisworkflow)
     - [A.6 Safe File Operations via CLI (`falcon file`)](#a6-safe-file-operations-via-cli-falcon-file)
   - [Flow B: Web GUI Experience (Apple-Style Dark Mode)](#flow-b-web-gui-experience-apple-style-dark-mode)
     - [B.1 Launching the GUI Dashboard](#b1-launching-the-gui-dashboard)
     - [B.2 Ingestion: Local Workspaces vs. Remote GitHub Repositories](#b2-ingestion-local-workspaces-vs-remote-github-repositories)
     - [B.3 Exploring the Interactive Dependency Canvas](#b3-exploring-the-interactive-dependency-canvas)
     - [B.4 In-Browser Code Editing with Reactive Re-Analysis](#b4-in-browser-code-editing-with-reactive-re-analysis)
     - [B.5 Interactive Blast Radius Simulation & Risk Breakdown](#b5-interactive-blast-radius-simulation-risk-breakdown)
   - [Flow C: CI/CD Pipeline & GitHub Actions Automation](#flow-c-cicd-pipeline-github-actions-automation)
     - [C.1 Complete GitHub Actions Workflow Specification](#c1-complete-github-actions-workflow-specification)
     - [C.2 Automated PR Impact Reports & Targeted Test Gating](#c2-automated-pr-impact-reports-targeted-test-gating)
   - [Flow D: Enterprise Persistence & Supabase Drizzle Sync](#flow-d-enterprise-persistence-supabase-drizzle-sync)
     - [D.1 Architecture & Connection Topology](#d1-architecture-connection-topology)
     - [D.2 Database Schema Configuration & Migrations](#d2-database-schema-configuration-migrations)
     - [D.3 Analysis Snapshotting & Historical Comparison](#d3-analysis-snapshotting-historical-comparison)
4. [Edge Cases, Security Hardening, & Troubleshooting ("Why It's Safe & Reliable")](#4-edge-cases-security-hardening-troubleshooting-why-its-safe-reliable)
   - [Directory Traversal & Symlink Escape Defenses](#directory-traversal-symlink-escape-defenses)
   - [Subprocess Security & Git Injection Immunization](#subprocess-security-git-injection-immunization)
   - [Computational Resource Limits & Cycle Resilience](#computational-resource-limits-cycle-resilience)
   - [Diagnostics Reference & Troubleshooting FAQ](#diagnostics-reference-troubleshooting-faq)
   - [CLI Exit Code Specifications](#cli-exit-code-specifications)

---

## 1. Executive Overview & Philosophy ("The Why")

### The Crisis in Modern CI/CD Pipelines

In modern software development, testing is the primary bottleneck to developer velocity:

1. **Blind Full-Suite Runs:** As codebases expand into tens or hundreds of thousands of lines of code, test suites grow proportionally. Running every unit, integration, and end-to-end test on every git commit wastes massive cloud compute resources and delays PR feedback loops from minutes to hours.
2. **Test Flakiness & Developer Fatigue:** The larger the test suite executed on a pull request, the higher the probability of encountering an unrelated flaky test. Developers lose confidence in CI, spending hours re-running pipelines rather than shipping features.
3. **Undetected Transitive Regressions:** Conversely, naive optimization strategies (such as only running tests that share the same directory or filename as changed files) miss semantic regressions. If a developer refactors an internal helper function in `src/utils/math.ts`, an unexpected change in floating-point precision can silently break an invoice payment calculation four module hops away in `src/billing/engine.ts`.

FALCON solves this dilemma by introducing **deterministic, compiler-verified impact intelligence**. Rather than guessing what broke or running everything blindly, FALCON computes the exact mathematical blast radius of every change.

### Why Compiler AST & Symbol Graphs Beat File/Regex Matching

Traditional attempts at impact analysis rely on text patterns, regex imports, or file-level diffing. These approaches break down under real-world repository conditions:

| Feature | Regex / File-Name Matching | FALCON AST & Symbol Dependency Graph |
|---|---|---|
| **Granularity** | File-level only (`checkout.ts` changed) | Symbol-level (`checkout` method signature changed; `validateCoupon` unchanged) |
| **False Positives** | High: Any comment, import formatting, or non-breaking change triggers tests | Zero / Minimal: Semantic AST comparison ignores whitespace and comments |
| **False Negatives** | Severe: Misses re-exports, aliased imports (`import { x as y }`), and polymorphic calls | Zero for static paths: Resolved directly via TypeScript Compiler API |
| **Resolution Depth** | 1-hop string matches | Multi-hop directed graph traversal with reverse reachability |
| **Type Integrity** | Ignored completely | Validates interfaces, type aliases, class inheritance, and module specs |

By integrating deeply with the TypeScript Compiler API (`ts.createProgram`, `ts.TypeChecker`, and iterative AST visitors), FALCON constructs an unambiguous directed dependency graph of declarations, function calls, variable references, and type extensions.

### Explainability & Confidence Scoring vs. Black-Box AI Hallucination

In recent years, "AI-driven" test selection tools have emerged that feed git diffs into Large Language Models (LLMs) to ask: *"What tests should run?"*

While tempting, this approach introduces non-determinism, security risks, and hallucination into core software infrastructure. When an LLM fails to suggest a critical test, a production outage occurs with no auditable explanation.

FALCON is built on **Explainable Static Analysis**:

> [!IMPORTANT]
> **FALCON's Golden Rule:** Every reported impact finding must be accompanied by a concrete, reproducible evidence path down to the exact source file and line number.

FALCON computes four conservative, unambiguous confidence ratings:

```
[confirmed]  --> 100% Compiler-resolved call expression or import link
[inferred]   --> Heuristically matched dependency (e.g. index re-export or module link)
[unresolved] --> Dynamic or ambiguous call target that static analysis cannot prove
[unknown]    --> Runtime-injected or non-analyzable boundary
```

FALCON never asserts that code is "safe" merely because no impact was discovered. It provides conservative, verified claims backed by graph mathematics.

---

## 2. System Architecture & Data Pipeline ("The How It Works")

### High-Level End-to-End Architecture

The following diagram illustrates how source code moves through FALCON's seven-layer processing engine:

```mermaid
flowchart TD
    A["Git Commit / PR Diff"] --> B["1. Repository Ingestion & Boundary Defense (@falcon/repository)"]
    B --> C["2. Compiler AST Parsing & Symbol Extraction (@falcon/parser)"]
    C --> D["3. Directed Adjacency Dependency Graph (@falcon/graph)"]
    A --> E["4. Multi-Revision Git Diff & Symbol Matcher (@falcon/diff)"]
    D --> F["5. Reverse Reachability Impact Traversal (@falcon/impact)"]
    E --> F
    F --> G["6. Risk Heuristics & Test Intelligence (@falcon/risk)"]
    G --> H["7. Presentation & Persistence Layer"]
    H --> H1["CLI Formatter (@falcon/report & falcon)"]
    H --> H2["Apple Dark Mode GUI (@falcon/gui)"]
    H --> H3["PostgreSQL / Supabase Drizzle Sync (@falcon/db)"]
```

### Detailed Pipeline Stages & Data Transformations

#### Stage 1: Repository Ingestion & Boundary Defense (`@falcon/repository`)
- **Input:** Target repository root path on disk or remote GitHub URL.
- **Process:**
  - Validates real path canonicalization and verifies `.git` presence.
  - Enforces traversal defense (`isPathWithinRoot`) to reject `../` and symlink escapes.
  - Applies file filters: default exclusions (`node_modules`, `dist`, `.git`), root `.gitignore`, and custom glob patterns.
  - Scans files, calculates deterministic SHA-256 hashes, and detects language (`.ts`, `.tsx`, `.js`, etc.).
- **Output:** Immutable `RepositoryInventory` object containing verified source file paths and content hashes.

#### Stage 2: Compiler AST Parsing & Symbol Extraction (`@falcon/parser`)
- **Input:** Discovered source files.
- **Process:**
  - Initializes a virtual TypeScript host with optimized fallback compiler options (`ESNext`, `NodeNext`).
  - Iteratively visits AST nodes using an iterative traversal stack (preventing call-stack overflows).
  - Extracts symbols (`CodeSymbol`): functions, methods, classes, interfaces, type aliases, enums, variables, imports, and exports.
  - Extracts relationship candidates: imports, exports, and call expressions with location coordinates (`line`, `character`).
- **Output:** Normalized symbol declarations and dependency candidates.

#### Stage 3: Directed Adjacency Graph Construction (`@falcon/graph`)
- **Input:** Symbols and dependency candidates.
- **Process:**
  - Builds an in-memory directed graph using dual adjacency lists:
    - Forward adjacency (`outgoing[nodeId]`): Nodes that this node depends on.
    - Reverse adjacency (`incoming[nodeId]`): Dependents that rely on this node.
  - Nodes represent either files (`kind: 'file'`) or individual symbols (`kind: 'symbol'`).
  - Edges represent typed relationships (`CALLS`, `IMPORTS_MODULE`, `IMPORTS_SYMBOL`, `REFERENCES`, `EXTENDS`, `IMPLEMENTS`, `TESTS`).
- **Output:** Queryable `DependencyGraph` supporting O(1) edge lookups and topological traversal.

#### Stage 4: Multi-Revision Git Diff & Symbol Matching (`@falcon/diff`)
- **Input:** Base git revision (e.g., `main`) and target git revision (e.g., `HEAD` or PR branch).
- **Process:**
  - Safely invokes `git diff --name-status` using non-shell argument arrays to avoid injection.
  - Categorizes file-level changes: Added (`A`), Modified (`M`), Deleted (`D`), Renamed (`R`).
  - For modified files, parses the AST of both revisions and executes a 5-tier symbol matching heuristic:
    1. Exact signature & kind match.
    2. Body-modified symbol match.
    3. Moved symbol match (relocated in file).
    4. Heuristic rename match.
    5. Deleted / Added categorization.
- **Output:** Set of `ChangedSymbol` entities with exact change categories (`MODIFIED_BODY`, `SIGNATURE_CHANGED`, `DELETED`, `ADDED`).

#### Stage 5: Reverse Reachability Impact Traversal (`@falcon/impact`)
- **Input:** Set of changed symbols/files and the active `DependencyGraph`.
- **Process:**
  - Seeds a Breadth-First Search (BFS) queue with the changed nodes.
  - Traverses the `incoming` adjacency list (following consumers against the dependency arrow).
  - Categorizes dependents:
    - **Direct Dependents (1-hop):** Symbols/files that directly call or import the changed entity.
    - **Transitive Dependents (n-hop):** Higher-level consumers affected via propagation chains.
  - Computes the shortest evidence path from the root change to each affected node.
  - Propagates confidence scores using the weakest-link principle:
    $$\text{Confidence}_{\text{path}} = \min(\text{Confidence}_{e_1}, \text{Confidence}_{e_2}, \dots, \text{Confidence}_{e_k})$$
- **Output:** Comprehensive `ImpactReport` with directly affected files, transitive files, and finding paths.

#### Stage 6: Test Intelligence Engine & Risk Heuristics (`@falcon/impact/testIntelligence` & `@falcon/risk`)
- **Input:** `ImpactReport`, repository test inventory, and optional code coverage report (lcov, Istanbul, or Vitest JSON).
- **Process:**
  - Discovers all repository test files via `discoverTestFiles` (`*.test.ts`, `*.spec.ts`, `__tests__/*`).
  - Correlates changed symbols and affected files against the test catalog using **four tiered evidence levels**:
    1. **`direct_import` (Priority: High / Weight: 4):** Test suite explicitly imports the modified source module or symbol.
    2. **`coverage` (Priority: High / Weight: 4):** Dynamic coverage report confirms that test execution exercized the modified line numbers.
    3. **`naming_convention` (Priority: Medium / Weight: 3):** Test filename directly matches the source module name (e.g., `pricing.test.ts` for `pricing.ts`).
    4. **`transitive_dependency` (Priority: Medium / Weight: 2):** Test file imports an intermediate consumer that transitively depends on the modified symbol.
  - Automatically flags **Coverage Gaps (`CoverageGap`)**: Identifies changed symbols or lines with zero associated test executions or missing mappings.
  - Computes explainable risk heuristic vectors:
    - `public_signature_changed`: Breaking API surface changes.
    - `direct_dependent_count`: Number of immediate consumers impacted.
    - `transitive_dependent_count`: Depth and breadth of propagation reach.
    - `cycle_detected_in_path`: Whether impacted symbols participate in circular dependencies.
- **Output:** Structured `TestRecommendationReport` ranking tests by priority (`high`, `medium`, `low`), listing coverage gaps, and cataloging missing test mappings.

#### Stage 7: Reporting, GUI Visualization, & Database Persistence
- **CLI:** Outputs formatted ASCII tables or compliant JSON envelopes.
- **GUI:** Renders interactive SVG graph canvas, Apple dark mode UI, and live code re-analysis.
- **Database:** Persists repository snapshots, dependency edges, impact runs, and findings into Supabase / PostgreSQL via Drizzle ORM.

### Graph Foundations: Kahn's Algorithm & Cycle Protection

To maintain stability across complex monorepos, FALCON handles cycles and ordering deterministically:

1. **Cycle Detection (3-Color DFS):** Traverses nodes using `White` (unvisited), `Gray` (visiting/in current DFS stack), and `Black` (visited). If a `Gray` node is encountered, a cycle is detected and isolated.
2. **Topological Ordering (Kahn's Algorithm):** Computes in-degrees for all nodes, enqueues 0-in-degree nodes, and removes edges iteratively. If nodes remain unprocessed, FALCON isolates cyclic components without crashing the traversal.
3. **Traversal Bounds:** Traversal is bounded by `--max-depth` (default: 5) and `--max-results` (default: 1,000) to guarantee $O(V + E)$ run-time guarantees even on large enterprise repositories.

---

## 3. Interactive User Flows (Step-by-Step "How To")

### Flow A: CLI Developer Flow

The FALCON CLI (`falcon`) is an all-in-one developer utility designed for fast, local feedback before code leaves your workstation.

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant CLI as falcon CLI
    participant Core as FALCON Engine
    participant Git as Git Adapter

    Dev->>CLI: falcon analyze .
    CLI->>Core: Scan directory & build snapshot
    Core-->>CLI: Inventory: 120 files, 0 diagnostics
    CLI-->>Dev: Print repository summary & language breakdown

    Dev->>CLI: falcon inspect-symbol src/billing.ts#calculateInvoice
    CLI->>Core: Lookup symbol in DependencyGraph
    Core-->>CLI: Callers, callees, location & confidence
    CLI-->>Dev: Display caller tree & module bindings

    Dev->>CLI: falcon impact --base main --target HEAD
    CLI->>Git: git diff --name-status main HEAD
    Git-->>CLI: Modified: src/billing.ts
    CLI->>Core: Reverse BFS reachability traversal
    Core-->>CLI: ImpactReport: 1 direct file, 3 transitive files
    CLI-->>Dev: Print Impact Table & Blast Radius

    Dev->>CLI: falcon test-recommend --base main --target HEAD
    CLI->>Core: Filter impacted nodes for test files (*.test.ts)
    Core-->>CLI: Recommended: billing.test.ts, checkout.test.ts
    CLI-->>Dev: Run: vitest run billing.test.ts checkout.test.ts
```

#### A.1 Initializing & Scanning a Repository (`falcon analyze`)

To scan a repository, validate file boundaries, and generate a baseline analysis inventory:

```bash
# Scan current directory with human-readable text output
falcon analyze .

# Scan an explicit repository path with JSON output
falcon analyze /path/to/my-repo --format json

# Filter specific paths using include and exclude glob patterns
falcon analyze . --include "src/**/*.ts" --exclude "src/**/*.test.ts" --output snapshot.json
```

**Example Terminal Output:**
```
FALCON Analysis Summary: /home/dev/projects/falcon-app
Git Repository: Yes
Files Scanned: 142
Eligible Source Files: 89
Excluded Paths: 53
Diagnostics: 0

Language Distribution:
  - typescript: 76
  - typescript-react: 13

Source Files (89):
  packages/domain/src/index.ts (typescript) [7a8b9c1d2e]
  packages/billing/src/invoice.ts (typescript) [4f5e6d7c8b]
  ... and 87 more files
```

#### A.2 Inspecting Symbols & Call Graphs (`falcon inspect-symbol`)

Inspect any symbol declaration in your project to reveal its immediate callers, callees, and declaration coordinates:

```bash
# Inspect a specific symbol using unambiguous path#symbol syntax
falcon inspect-symbol "packages/billing/src/invoice.ts#calculateTotal"

# Get JSON output for IDE tooling or agent scripting
falcon inspect-symbol "packages/billing/src/invoice.ts#calculateTotal" --format json
```

**Example Output:**
```
Symbol: packages/billing/src/invoice.ts#calculateTotal
Kind: function
Location: packages/billing/src/invoice.ts:42:1
Exported: true

Outgoing Dependencies (Callees):
  -> packages/tax/src/calculator.ts#computeVat [CALLS] (confirmed)
  -> packages/currency/src/convert.ts#toUsd [CALLS] (confirmed)

Incoming Dependents (Callers):
  <- packages/checkout/src/service.ts#processCheckout [CALLS] (confirmed)
  <- packages/portal/src/api/invoice.ts#getInvoiceSummary [CALLS] (inferred)
```

#### A.3 Multi-Revision Diff & Impact Analysis (`falcon impact`)

Compare your local branch or commit against any git revision to identify the exact blast radius:

```bash
# Compare current working branch against main
falcon impact --base main --target HEAD

# Compare two explicit commit hashes with depth limiting
falcon impact --base a1b2c3d --target e4f5g6h --max-depth 3

# Save structured impact report to file
falcon impact --base origin/main --target my-feature-branch --format json --output impact-report.json
```

**Example Text Report:**
```
FALCON Impact Analysis
========================================
Base Revision:   origin/main (a1b2c3d)
Target Revision: feat/pricing-v2 (e4f5g6h)
Changed Files:   1
Changed Symbols: 1

Changed Symbols:
  * packages/billing/src/invoice.ts#calculateTotal [MODIFIED_BODY]

Directly Affected Files (1-hop):
  - packages/checkout/src/service.ts (confirmed)

Transitively Affected Files (2-hop+):
  - packages/portal/src/api/invoice.ts (hop distance: 2, confidence: inferred)
  - packages/checkout/src/controller.ts (hop distance: 2, confidence: confirmed)

Shortest Impact Paths:
  [1] packages/checkout/src/service.ts -> packages/billing/src/invoice.ts (1 hop)
  [2] packages/portal/src/api/invoice.ts -> packages/checkout/src/service.ts -> packages/billing/src/invoice.ts (2 hops)
```

#### A.4 Predictive Test Recommendations (`falcon test-recommend`)

Rather than running the entire repository test suite, request only the tests that have a proven dependency path to your changes, sorted by evidence confidence and priority:

```bash
# Identify tests affected between current branch and main
falcon test-recommend --base main --target HEAD

# Include dynamic test coverage report for hybrid static + runtime mapping
falcon test-recommend --base main --target HEAD --coverage coverage/coverage-final.json

# Output as a clean space-separated list of test files for direct runner piping
falcon test-recommend --base main --target HEAD --format test-files

# Pipe directly into Vitest or Jest
npx vitest run $(falcon test-recommend --base main --target HEAD --format test-files)
```

**Example Terminal Output:**
```
FALCON Test Recommendations:
========================================
Base Revision: origin/main | Target: HEAD
Evaluated Test Files: 48
Recommended Test Suites: 2 (Savings: 95.8% execution time)

[HIGH PRIORITY] packages/billing/src/__tests__/invoice.test.ts
  Evidence: direct_import (confirmed)
  Target:   packages/billing/src/invoice.ts#calculateTotal
  Reason:   Directly imports modified declaration calculateTotal

[MEDIUM PRIORITY] packages/checkout/src/__tests__/service.test.ts
  Evidence: transitive_dependency (confirmed)
  Distance: 2 hops
  Target:   packages/billing/src/invoice.ts#calculateTotal
  Reason:   Imports checkoutService which calls modified function calculateTotal

Coverage Gaps Detected (1):
  [WARNING] packages/billing/src/tax.ts#computeVat: No mapped tests found!
```

**Why this matters:** In enterprise codebases with thousands of unit, integration, and E2E tests, full CI runs create massive latency. By running only compiler-verified affected tests, developers get sub-minute feedback without compromising test safety.

#### A.5 Programmatic Pipeline SDK (`runFalconAnalysisWorkflow`)

In addition to the CLI, FALCON provides a typed programmatic workflow orchestrator exportable from `@falcon/impact/workflow`:

```typescript
import { runFalconAnalysisWorkflow } from '@falcon/impact/workflow';

const result = await runFalconAnalysisWorkflow({
  repoRoot: process.cwd(),
  baseRef: 'origin/main',
  targetRef: 'HEAD',
  coverage: './coverage/coverage-summary.json',
  maxDepth: 5,
  maxTests: 50,
});

console.log(`Changed files: ${result.gitDiff.changedFiles.length}`);
console.log(`Directly affected: ${result.impact.directlyAffectedFiles.length}`);
console.log(`Recommended tests: ${result.testIntelligence.recommendedTests.length}`);
```

#### A.6 Safe File Operations via CLI (`falcon file`)

The CLI provides traversal-safe file manipulation commands guaranteed not to escape the repository root or follow hostile symlinks:

```bash
# List all source files tracked by FALCON
falcon file list

# Safely read a file with language and content hash metadata
falcon file read src/utils.ts

# Inspect file metadata
falcon file info src/utils.ts

# Safely write or create a file
falcon file write src/config.ts --content "export const API_VERSION = 'v2';"

# Safely perform an exact find-and-replace
falcon file edit src/config.ts --find "API_VERSION = 'v1'" --replace "API_VERSION = 'v2'"

# Safely delete a file
falcon file delete src/deprecated.ts
```

---

### Flow B: Web GUI Experience (Apple-Style Dark Mode)

FALCON provides a standalone Web GUI built on Apple Human Interface Guidelines: an OLED deep-black theme, translucent glass panels (`backdrop-filter: blur(20px)`), SF Pro typography, and macOS window chrome.

```mermaid
flowchart LR
    subgraph Browser ["Apple Dark Mode Web GUI (Port 4200)"]
        Tab1["Overview Dashboard"]
        Tab2["Files & In-Browser Code Editor"]
        Tab3["Interactive Graph Canvas (SVG)"]
        Tab4["Impact Traversal & Risk Suite"]
    end

    subgraph Server ["@falcon/gui HTTP Server"]
        API1["/api/status"]
        API2["/api/ingest/github & local"]
        API3["/api/repository/file/edit"]
        API4["/api/graph"]
        API5["/api/impact/analyze"]
    end

    Browser <--> Server
```

#### B.1 Launching the GUI Dashboard

Start the GUI server locally using either `pnpm` or the CLI:

```bash
# Using pnpm workspace script
pnpm gui

# Or via the falcon CLI with custom port and target repository
falcon gui --port 4200 --repo .

# Access the interface in your browser
open http://localhost:4200
```

#### B.2 Ingestion: Local Workspaces vs. Remote GitHub Repositories

The GUI supports two ingestion modes via modal dialogs:

1. **Local Repository Ingestion:**
   - Click **Ingest Local** in the navigation header.
   - Enter any local path on your machine (e.g., `.` or `/home/user/projects/repo`).
   - FALCON canonicalizes the path, verifies Git presence, builds the file index, and constructs the dependency graph.
2. **Remote GitHub Repository Ingestion:**
   - Click **Ingest GitHub**.
   - Enter shorthand (`owner/repo`), HTTPS URL (`https://github.com/owner/repo`), or SSH URL.
   - Specify an optional branch/tag ref and shallow clone depth (default: `--depth 1`).
   - FALCON shallow-clones the repo safely into managed isolated storage (`~/.falcon/ingested/`) using sanitized argument arrays, parses the tree, and displays the commit SHA and branch badge.

#### B.3 Exploring the Interactive Dependency Canvas

Click the **Graph** tab in the segmented navigation bar:

- **Radial / Force Layout:** Renders file and symbol nodes as interactive SVG elements. File nodes are color-coded in cyan; symbols in Apple purple.
- **Cycle Highlights:** If circular dependencies exist in the repository, the **Cycle Warning** badge pulses amber/red, displaying the exact cycle count.
- **Interactive Navigation:**
  - **Pan & Zoom:** Smooth scaling from 0.3x to 3.0x with dedicated Zoom In (`+`), Zoom Out (`-`), and Reset buttons.
  - **Hover Tooltips:** Hovering over any node displays its full path, kind, and dependency count.
  - **Direct File Jumping:** Clicking any file node automatically opens that file in the in-browser code editor.

#### B.4 In-Browser Code Editing with Reactive Re-Analysis

Click the **Files & Code** tab:

1. **File Tree Browser:** Browse all discovered source files grouped by folder hierarchy.
2. **Editor Panel:** Select a file to view its contents with line numbers and syntax styling.
3. **Reactive Re-Analysis:**
   - Make an edit directly in the text editor.
   - Click **Save Changes** (or use the Find & Replace panel).
   - FALCON writes the file through `@falcon/repository` with strict traversal checks, recomputes the SHA-256 hash in real time, and dynamically rebuilds the dependency graph without requiring a server restart.

#### B.5 Interactive Blast Radius Simulation & Risk Breakdown

Click the **Impact Traversal** tab:

1. **File Chip Picker:** Select one or more candidate files to simulate changes (e.g., `src/billing/tax.ts`).
2. **Max Depth Slider:** Set the traversal depth (1 to 10 hops).
3. **Execute Analysis:** Click **Run Impact Analysis**.
4. **Instant Visual Feedback:**
   - **Directly Affected (1-hop):** Displayed in red with `confirmed` confidence tags.
   - **Transitive Dependents:** Displayed in orange with hop distances and propagation reasons.
   - **Visual Paths:** Step-by-step breadcrumb traces showing how changes flow from source to dependent (`tax.ts ➔ invoice.ts ➔ checkout.ts`).

---

### Flow C: CI/CD Pipeline & GitHub Actions Automation

Automate FALCON in continuous integration to analyze every Pull Request, calculate blast radius, gate high-risk PRs, and run targeted tests.

```mermaid
sequenceDiagram
    autonumber
    actor Contributor as Contributor
    participant GH as GitHub PR Event
    participant Runner as GitHub Actions Runner
    participant Falcon as FALCON CLI
    participant Vitest as Targeted Test Runner

    Contributor->>GH: Open Pull Request #42 (feat/checkout-refactor)
    GH->>Runner: Trigger .github/workflows/falcon-impact.yml
    Runner->>Runner: git fetch origin main --depth=1
    Runner->>Falcon: falcon impact --base origin/main --target HEAD --format json
    Falcon-->>Runner: impact-report.json (2 directly affected, 5 transitive)
    Runner->>Falcon: falcon test-recommend --base origin/main --target HEAD
    Falcon-->>Runner: test-suites: billing.test.ts, checkout.test.ts
    Runner->>Vitest: vitest run billing.test.ts checkout.test.ts
    Vitest-->>Runner: Tests Passed in 8.2s (vs 14m full suite)
    Runner->>GH: Post PR Comment with Impact Summary & Risk Table
    GH-->>Contributor: View PR Impact Breakdown & Fast Green Checkmark
```

#### C.1 Complete GitHub Actions Workflow Specification

Place this workflow in `.github/workflows/falcon-impact.yml`:

```yaml
name: FALCON Code-Change Impact Analysis

on:
  pull_request:
    branches: [ main, master ]

permissions:
  contents: read
  pull-requests: write

jobs:
  impact-analysis:
    name: Impact Radius & Targeted Testing
    runs-on: ubuntu-latest
    steps:
      - name: Checkout PR Branch
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Full history required for base revision comparison

      - name: Setup Node.js & pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install Dependencies & Build FALCON
        run: |
          pnpm install --frozen-lockfile
          pnpm build

      - name: Run FALCON Impact Analysis
        id: falcon
        run: |
          node packages/cli/dist/bin.js impact \
            --base "origin/${{ github.base_ref }}" \
            --target "HEAD" \
            --format json \
            --output impact-report.json

      - name: Run Targeted Test Intelligence
        run: |
          # Extract affected test suites
          TEST_FILES=$(node -e '
            const report = require("./impact-report.json");
            const tests = (report.findings || [])
              .map(f => f.affectedSymbol.split("#")[0])
              .filter(p => p.includes(".test.") || p.includes(".spec."))
              .filter((v, i, a) => a.indexOf(v) === i);
            console.log(tests.join(" "));
          ')

          if [ -n "$TEST_FILES" ]; then
            echo "Running targeted test suites: $TEST_FILES"
            pnpm vitest run $TEST_FILES
          else
            echo "No test files affected in impact path."
          fi

      - name: Comment Impact Report on PR
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('./impact-report.json', 'utf8'));
            
            const comment = `### 🦅 FALCON Impact Analysis Report
            
            | Metric | Result |
            |---|---|
            | **Base Revision** | \`${report.repository.baseRevision}\` |
            | **Target Revision** | \`${report.repository.targetRevision}\` |
            | **Changed Symbols** | \`${report.summary.changedSymbols}\` |
            | **Direct Dependents (1-hop)** | \`${report.summary.directDependents}\` |
            | **Transitive Dependents** | \`${report.summary.transitiveDependents}\` |
            
            #### 🔍 Directly Affected Files
            ${report.findings.filter(f => f.impactKind === 'direct').map(f => `- \`${f.affectedSymbol}\` (${f.confidence})`).join('\n') || '_None_'}
            
            > *Verified by FALCON compiler-aware static dependency graph.*`;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

#### C.2 Automated PR Impact Reports & Targeted Test Gating

When this workflow executes, developers receive an instant comment on their Pull Request:

> ### 🦅 FALCON Impact Analysis Report
> 
> | Metric | Result |
> |---|---|
> | **Base Revision** | `origin/main (4f2a1c)` |
> | **Target Revision** | `HEAD (9e8b7d)` |
> | **Changed Symbols** | `2` |
> | **Direct Dependents (1-hop)** | `3` |
> | **Transitive Dependents** | `7` |
> 
> #### 🔍 Directly Affected Files
> - `packages/billing/src/invoice.ts` (confirmed)
> - `packages/checkout/src/service.ts` (confirmed)
> 
> *Targeted Test Suite Executed: 2 suites passed in 6.4s (Full suite: 18m skipped).*

---

### Flow D: Enterprise Persistence & Supabase Drizzle Sync

For enterprise teams and monorepos, FALCON persists historical analysis snapshots, symbol catalogs, and impact runs to a managed PostgreSQL database via Supabase and Drizzle ORM.

```mermaid
erDiagram
    repositories ||--o{ analysis_snapshots : "contains"
    analysis_snapshots ||--o{ files : "tracks"
    analysis_snapshots ||--o{ symbols : "declares"
    analysis_snapshots ||--o{ dependency_edges : "contains"
    analysis_snapshots ||--o{ impact_runs : "analyzes"
    impact_runs ||--o{ impact_findings : "reports"
    analysis_snapshots ||--o{ test_mappings : "stores"
    analysis_snapshots ||--o{ diagnostics : "emits"

    repositories {
        text id PK
        varchar name
        text root_path
        text remote_url
        varchar default_branch
        timestamp created_at
    }

    analysis_snapshots {
        text id PK
        text repository_id FK
        varchar commit_sha
        varchar branch
        varchar status
        timestamp created_at
    }

    symbols {
        text id PK
        text snapshot_id FK
        text file_path
        varchar name
        varchar kind
        integer line
        boolean is_exported
    }

    dependency_edges {
        text id PK
        text snapshot_id FK
        text source_symbol_id
        text target_symbol_id
        varchar edge_type
        varchar confidence
    }

    impact_runs {
        text id PK
        text snapshot_id FK
        varchar base_ref
        varchar target_ref
        integer total_affected_files
        integer total_affected_symbols
    }

    impact_findings {
        text id PK
        text impact_run_id FK
        text symbol_id
        text file_path
        varchar kind
        integer distance
        varchar confidence
        text reason
    }

    test_mappings {
        text id PK
        text snapshot_id FK
        text test_file_path
        text test_symbol_id
        text source_file_path
        text source_symbol_id
        varchar evidence_level
        varchar confidence
        integer line
        text notes
    }
```

#### D.1 Architecture & Connection Topology

FALCON supports dual-mode connection topologies for Supabase:

1. **Transaction Pooler (Recommended for Serverless / CLI):**
   - Connects through Supavisor on port **6543**.
   - IPv4 compatible, supports high-concurrency stateless CLI executions.
2. **Direct Connection (For Long-Running Migrations):**
   - Connects directly to PostgreSQL on port **5432**.
   - Used during initial schema generation and DDL migrations.

**Configuration (`.env`):**
```bash
# Supabase Transaction Pooler (Port 6543)
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"

# Optional Direct Connection URL
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@db.[project-ref].supabase.co:5432/postgres"

# Supabase API Credentials
SUPABASE_URL="https://[project-ref].supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOi..."
```

> [!TIP]
> **Credential Sanitization:** FALCON automatically parses and masks sensitive passwords in connection strings. If a password contains special characters like `@`, FALCON normalizes it with percent-encoding (`%40`) and sanitizes all console outputs and error logs to prevent leaking secrets.

#### D.2 Database Schema Configuration & Migrations

To apply FALCON's relational schema to your database:

```bash
# Run migrations using the db package script
pnpm --filter @falcon/db run db:migrate

# Alternatively, execute the built migration runner directly
node packages/db/dist/migrate.js

# Generate new migration files if schema is modified
pnpm --filter @falcon/db run db:generate
```

#### D.3 Analysis Snapshotting & Historical Comparison

When integrated with `@falcon/db`, analysis runs are recorded with immutable snapshot IDs:

```typescript
import { createDbClient } from '@falcon/db';
import { repositories, analysisSnapshots, impactRuns } from '@falcon/db/schema';

const db = createDbClient(process.env.DATABASE_URL);

// 1. Create or retrieve repository record
const [repo] = await db.insert(repositories).values({
  id: 'repo-falcon',
  name: 'Falcon',
  rootPath: process.cwd(),
}).onConflictDoNothing().returning();

// 2. Persist analysis snapshot
const [snapshot] = await db.insert(analysisSnapshots).values({
  id: `snap-${Date.now()}`,
  repositoryId: repo.id,
  commitSha: 'a1b2c3d4e5',
  branch: 'main',
  status: 'completed',
}).returning();

// 3. Persist impact run findings
await db.insert(impactRuns).values({
  id: `run-${Date.now()}`,
  snapshotId: snapshot.id,
  baseRef: 'main',
  targetRef: 'feat/new-pricing',
  totalAffectedFiles: 4,
  totalAffectedSymbols: 7,
});
```

This enables teams to track blast radius trends over time, identify high-churn high-risk files, and correlate impact findings with production defect histories.

---

## 4. Edge Cases, Security Hardening, & Troubleshooting ("Why It's Safe & Reliable")

FALCON is designed to safely inspect untrusted codebases without executing arbitrary repository scripts or risking host machine compromise.

### Directory Traversal & Symlink Escape Defenses

```
Attack Vector:
/repo/src/../../etc/passwd  --> [BLOCKED] DIAG_PATH_TRAVERSAL
/repo/symlink -> /etc/shadow --> [BLOCKED] DIAG_SYMLINK_ESCAPE
/repo/linkA -> linkB -> linkA --> [BLOCKED] DIAG_SYMLINK_CYCLE
```

1. **Strict Root Boundary Enforcement (`isPathWithinRoot`):**
   - Every candidate path is resolved using `path.resolve` and verified against the canonical repository root path (`fs.realpathSync`).
   - Any path attempting directory traversal (`../`) or null-byte poisoning (`\0`) is rejected with `DIAG_PATH_TRAVERSAL` (HTTP 403 / CLI Exit Code 3).
2. **Symlink Escape Defense (`DIAG_SYMLINK_ESCAPE`):**
   - Before reading or scanning files, FALCON evaluates symlink targets.
   - If a symlink resolves to a destination outside the repository boundary, it is blocked and logged as a security diagnostic.
3. **Circular Symlink Defense (`DIAG_SYMLINK_CYCLE`):**
   - The scanner maintains a set of visited inode numbers and canonical paths to prevent infinite loops caused by self-referential symlinks.

### Subprocess Security & Git Injection Immunization

FALCON interacts with Git via native subprocess execution (`node:child_process`). It prevents command injection through rigorous isolation:

> [!CAUTION]
> **No Shell Interpretation:** FALCON **never** invokes commands via `child_process.exec()` or `sh -c`. All subprocess calls use `execFile` with explicit argument arrays.

- **Git Argument Injection Protection:**
  - Revision parameters (`--base`, `--target`) are validated against regex patterns (`^[a-zA-Z0-9_.\-/~^]+$`).
  - Dangerous Git flags (such as `--upload-pack`, `--exec`, or options starting with `--`) passed as positional refs are rejected immediately.
- **Credential Masking in Errors:**
  - If a Git remote operation fails, any database tokens or basic auth URLs embedded in stderr are scrubbed using `maskSensitiveCredentials()` before being emitted to stdout or logs.

### Computational Resource Limits & Cycle Resilience

To guarantee predictable memory consumption and execution time on massive repositories:

1. **AST Iteration Stack Bounds:**
   - FALCON replaces recursive AST visitor functions with an explicit iterative traversal stack, eliminating `Maximum call stack size exceeded` errors on heavily nested JSX or expressions.
2. **Cycle Tolerance (Kahn & DFS):**
   - Circular imports (`A.ts` imports `B.ts` imports `A.ts`) are common in TypeScript.
   - FALCON's impact traversal maintains a global `visitedNodes` Set. Once a node is visited, it is never re-enqueued, guaranteeing $O(V + E)$ termination.
3. **Max Payload & Depth Bounds:**
   - GUI HTTP requests are capped at 10 MB (`MAX_BODY_SIZE_BYTES`). Requests exceeding this limit receive HTTP 413 (`PAYLOAD_TOO_LARGE`).
   - Reverse reachability traversal is bounded by `--max-depth` (default: 5) and `--max-results` (default: 1,000), emitting `DIAG_DEPTH_LIMIT` and `DIAG_RESULTS_TRUNCATED` when thresholds are reached.

### Diagnostics Reference & Troubleshooting FAQ

| Diagnostic Code | Severity | Description | Recommended Remediation |
|---|---|---|---|
| `DIAG_ROOT_NOT_FOUND` | Fatal | Repository target path does not exist on disk | Check path spelling or provide absolute path |
| `DIAG_ROOT_NOT_DIRECTORY` | Fatal | Repository target path is a file, not a directory | Pass root folder containing project |
| `DIAG_PATH_TRAVERSAL` | Fatal | Path attempted to escape root boundary (`../`) | Restrict paths to repository workspace |
| `DIAG_SYMLINK_ESCAPE` | Warning | Symlink points to location outside repository | Audit repository symlinks or add to exclude list |
| `DIAG_SYMLINK_CYCLE` | Warning | Circular symlink loop detected during scanning | Remove circular symlink on filesystem |
| `DIAG_FILE_OVERSIZED` | Warning | File exceeds maximum allowable scan size | Check `.gitignore` for generated bundles or minified assets |
| `DIAG_DEPTH_LIMIT` | Info | Impact traversal reached configured `--max-depth` | Increase `--max-depth` if full transitive trace is needed |
| `DIAG_RESULTS_TRUNCATED`| Info | Impact findings reached configured `--max-results` | Increase `--max-results` or narrow change scope |

#### Frequently Asked Questions

**Q: Why does FALCON report `0` changed symbols when my git diff shows modified lines?**  
**A:** FALCON performs AST-level symbol matching. If your commit only changed comments, whitespaces, or documentation strings, the TypeScript compiler AST remains identical, correctly concluding that zero code symbols were impacted.

**Q: Can FALCON analyze private dependencies or node_modules?**  
**A:** By design, FALCON excludes `node_modules` from internal impact scanning to keep analysis fast and secure. It models external package dependencies at the boundary (`IMPORTS_MODULE`), treating third-party packages as immutable external nodes.

**Q: Does FALCON execute repository setup scripts (e.g. `npm postinstall`)?**  
**A:** Never. FALCON is a pure static analysis platform. It inspects source code without executing arbitrary project files, making it completely safe for untrusted pull requests.

---

### CLI Exit Code Specifications

FALCON follows deterministic exit codes compliant with standard Unix CI tooling:

| Exit Code | Identifier | Description | Action Required |
|---|---|---|---|
| **0** | `SUCCESS` | Operation completed successfully. Findings may exist. | None. Check stdout/JSON for findings. |
| **1** | `INTERNAL_ERROR` | Unexpected internal runtime failure or uncaught exception. | Review stderr and report issue. |
| **2** | `INVALID_ARGUMENTS` | Missing or invalid flags, arguments, or options. | Check `falcon help` or command syntax. |
| **3** | `REPOSITORY_ERROR` | Filesystem access denied, Git failure, or traversal escape. | Verify permissions and git repository state. |
| **4** | `FATAL_DIAGNOSTICS` | Analysis encountered configured fatal diagnostics. | Resolve critical repository diagnostics. |
| **5** | `UNSUPPORTED_OPERATION`| Requested command or git revision combination unsupported. | Check revision ref or supported languages. |

---

> **FALCON** — Explainable, deterministic code-change impact intelligence for mission-critical software engineering.
