# FALCON Analysis Algorithms

## 1. Scope

This document defines the initial deterministic analysis strategy. Static analysis is necessarily incomplete for dynamic languages and runtime behavior.

## 2. Symbol extraction

Use the TypeScript Compiler API:
1. Create a `Program` using repository tsconfig when safe and available; otherwise use controlled fallback compiler options.
2. Visit AST nodes.
3. Extract supported declarations and source ranges.
4. Record imports, exports and call expressions as relationship candidates.
5. Resolve candidates using the type checker where possible.
6. Emit diagnostics for unsupported or unresolved constructs.

Do not execute project code or load arbitrary project plugins.

## 3. Module resolution

- Resolve relative imports using TypeScript compiler resolution rules where possible.
- Respect configured `paths` and `baseUrl` only from validated configuration.
- Treat package imports separately from repository-local files.
- Record unresolved module specifiers.
- Do not assume a package dependency implies a specific runtime call relationship.

## 4. Call graph extraction

For each call expression:
- Identify the expression form.
- Attempt symbol resolution using the checker.
- Create `CALLS` edge when a concrete declaration is resolved.
- If resolution is ambiguous or dynamic, emit a diagnostic or unresolved candidate.
- Handle method calls, aliases, callbacks and higher-order functions conservatively.

Known limitations include reflection, runtime monkey-patching, dependency injection, dynamic dispatch, string-based lookup and runtime-generated code.

## 5. Graph representation

Use adjacency maps:
- `outgoing[nodeId]`: nodes that this node depends on.
- `incoming[nodeId]`: nodes that depend on this node.

Convention: `A -> B` means A depends on B.

For a changed node B, traverse `incoming[B]` to discover known dependents.

Store typed edges and provenance. Use a visited set to avoid cycles.

## 6. Git diff and symbol matching

Compare explicit base and target revisions.
- Parse old and new source contents.
- Match unchanged symbols using stable file/name/kind/signature clues.
- Detect changed signatures and declaration bodies.
- Treat rename/move matching as a heuristic.
- If multiple candidates match, mark ambiguous.
- Deleted symbols should remain reportable as old-snapshot nodes.

Never silently compare symbols from different snapshots as if they shared identity.

## 7. Impact traversal

For every changed symbol:
1. Resolve it to old/new snapshot nodes.
2. Traverse reverse dependency edges.
3. Record the shortest known path to each affected node.
4. Mark first-hop nodes as direct dependents.
5. Mark later nodes as transitive dependents.
6. Preserve edge types and evidence along the path.
7. Stop at configured depth/result limits and add a truncation diagnostic.

Complexity for a traversal is O(V + E) over the visited subgraph. Multiple changed symbols may share traversal work; optimize after correctness is established.

## 8. Risk factors

Return a vector of evidence-backed factors, for example:
- `public_signature_changed`
- `symbol_deleted`
- `direct_dependent_count`
- `transitive_dependent_count`
- `critical_module_configured`
- `unresolved_relationships_near_change`
- `test_mapping_missing`
- `coverage_gap_detected`

An optional aggregate score may be computed from configurable weights, but:
- It is not a probability.
- It must include a factor breakdown.
- It must be calibrated against labeled outcomes before being presented as predictive.
- It must not be used as the sole basis for blocking or approving a PR.

## 9. Confidence labels

Recommended labels:
- `confirmed`: direct compiler-resolved static relationship.
- `inferred`: heuristic match or weaker evidence.
- `unresolved`: relationship candidate exists but target could not be resolved.
- `unknown`: behavior may exist but cannot be statically determined.

Confidence refers to evidence strength, not certainty of runtime impact.

## 10. Test mapping

MVP may identify test files that import or call analyzed symbols. Later versions may ingest coverage:
- Map covered source locations to symbols.
- Associate tests with covered symbols.
- Distinguish direct mapping from indirect/coverage-derived mapping.
- Recommend tests connected to changed symbols and their impact set.

Never claim that a test fully validates a symbol merely because it imports the file.

## 11. Evaluation

Build curated fixtures with known expected edges and change impacts. Track precision and recall separately:
- Precision = true positive findings / all reported findings.
- Recall = true positive findings / all labeled relevant findings.

Publish fixture scope and limitations alongside numbers.
