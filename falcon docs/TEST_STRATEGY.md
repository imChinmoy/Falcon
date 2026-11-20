# FALCON Test Strategy

## 1. Objectives

Test not only happy-path features but the correctness and limitations of static analysis. A parser that silently misses dependencies is more dangerous than one that reports uncertainty.

## 2. Test layers

### Unit tests
- File filtering and path normalization.
- Symbol identity generation.
- AST extractors.
- Import resolution.
- Graph edge insertion and deduplication.
- BFS/DFS traversal.
- Cycle handling.
- Symbol matching.
- Risk-factor calculation.
- JSON serialization.

### Integration tests
- Analyze a fixture repository.
- Compare two real Git fixture commits.
- Verify changed symbols and impact paths.
- Validate CLI output and exit codes.
- Validate deterministic output.

### Security tests
- Path traversal attempts.
- Symlink escape attempts.
- Malicious filenames.
- Oversized files.
- Malformed tsconfig.
- Git command argument injection.
- Repository with package scripts that must not execute.

### Performance tests
- Small, medium and large fixture repositories.
- Many files with few symbols.
- Few files with many symbols.
- Dense dependency graph.
- Large cyclic graph.
- Large number of changed symbols.

## 3. Required fixture cases

1. Simple relative import and function call.
2. Named and default exports.
3. Re-export barrel file.
4. Type-only import.
5. Namespace import.
6. Path alias.
7. Duplicate function names in different files.
8. Class method and inheritance.
9. Arrow function assigned to variable.
10. Circular imports.
11. Dynamic import.
12. Unresolved package import.
13. Deleted function.
14. Changed function signature.
15. Renamed/moved symbol ambiguity.
16. Generated file exclusion.
17. Parse error in one file.
18. Test importing changed module.
19. Monorepo package boundaries.

## 4. Golden tests

Store expected graph nodes, edges and impact findings as versioned JSON fixtures. Review fixture updates carefully; do not regenerate expected outputs blindly after failures.

## 5. Quality gates

Before merge:
- Unit tests pass.
- Integration tests pass.
- Typecheck passes.
- Lint passes.
- No known secret is committed.
- Documentation is updated.
- New diagnostics and limitations are tested.

## 6. Evaluation corpus

Create a manually labeled corpus of small repositories and realistic changes. Label:
- Changed symbols.
- Expected statically reachable dependents.
- Unresolved dynamic cases.
- Relevant tests.

Calculate precision and recall separately. Keep the corpus and methodology documented.
