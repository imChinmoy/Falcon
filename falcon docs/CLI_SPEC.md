# FALCON CLI Specification

The CLI is the first user-facing product surface.

## 1. Command principles

- Commands must be deterministic for identical inputs.
- Human-readable output is default; JSON is supported for automation.
- Errors go to stderr; structured report goes to stdout or an explicit output file.
- Exit codes are stable and documented.
- Analysis must not execute repository scripts.

## 2. Proposed commands

### `falcon analyze <path>`

Build an analysis snapshot.

Options:
- `--format text|json`
- `--output <file>`
- `--config <file>`
- `--include <glob>` (repeatable)
- `--exclude <glob>` (repeatable)

### `falcon impact`

Compare revisions and produce impact report.

Required:
- `--base <git-ref>`
- `--target <git-ref>`

Optional:
- `--repo <path>` (default current directory)
- `--format text|json`
- `--output <file>`
- `--max-depth <number>`
- `--max-results <number>`

### `falcon inspect-symbol <selector>`

Inspect a symbol and its dependencies/dependents. Selector format should be documented and unambiguous, e.g. `src/pricing.ts#calculatePrice`.

### `falcon version`

Print CLI and analyzer versions.

## 3. Exit codes

| Code | Meaning |
|---|---|
| 0 | Analysis completed; findings may exist |
| 1 | Unexpected internal error |
| 2 | Invalid arguments or configuration |
| 3 | Repository or Git operation failed |
| 4 | Analysis completed with configured fatal diagnostics |
| 5 | Unsupported operation or revision |

Do not use non-zero exit merely because impact findings exist.

## 4. JSON report envelope

```json
{
  "schemaVersion": "1",
  "analyzerVersion": "0.1.0",
  "repository": {
    "baseRevision": "abc123",
    "targetRevision": "def456"
  },
  "summary": {
    "changedSymbols": 1,
    "directDependents": 2,
    "transitiveDependents": 1
  },
  "findings": [],
  "diagnostics": []
}
```

This is an illustrative envelope; define and validate the full schema in code before promising compatibility.

## 5. Example finding

```json
{
  "changedSymbol": "src/pricing.ts#calculatePrice",
  "affectedSymbol": "src/checkout.ts#checkout",
  "impactKind": "direct",
  "confidence": "confirmed",
  "path": [
    "src/checkout.ts#checkout",
    "src/pricing.ts#calculatePrice"
  ],
  "reason": "Compiler-resolved call expression",
  "evidence": {
    "file": "src/checkout.ts",
    "line": 12
  }
}
```
