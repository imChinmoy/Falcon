# FALCON API Specification — Future Service

This API is a later phase. Do not implement it before the CLI/core MVP is useful.

## 1. API principles

- Version routes under `/v1`.
- Validate all request bodies and query parameters.
- Use asynchronous jobs for repository analysis.
- Never expose server filesystem paths.
- Return job status and stable report references.
- Authenticate all non-public endpoints.
- Authorize every repository and analysis access.

## 2. Proposed endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/v1/repositories` | Register repository connection |
| GET | `/v1/repositories` | List authorized repositories |
| GET | `/v1/repositories/:id` | Repository metadata |
| POST | `/v1/repositories/:id/analyses` | Queue analysis |
| GET | `/v1/analyses/:id` | Job status and summary |
| GET | `/v1/analyses/:id/report` | Retrieve report |
| GET | `/v1/analyses/:id/findings` | Paginated impact findings |
| POST | `/v1/webhooks/github` | Receive verified GitHub events |

## 3. Queue lifecycle

`queued -> cloning -> analyzing -> reporting -> completed`

Terminal alternatives:
- `failed`
- `cancelled`
- `timed_out`

Status transitions must be validated. Jobs should be idempotent where possible using repository, commit pair, analyzer version and configuration hash.

## 4. Security requirements

- Verify GitHub webhook signatures.
- Encrypt tokens at rest.
- Use least-privilege GitHub permissions.
- Prevent cross-tenant report access.
- Apply repository size, CPU, memory and runtime quotas.
- Do not execute package scripts.
- Isolate worker filesystem and network.
- Redact secrets from logs and reports.

## 5. Example analysis request

```json
{
  "baseRevision": "main",
  "targetRevision": "feature/pricing-update",
  "options": {
    "includeTests": true,
    "maxDepth": 8
  }
}
```

## 6. Example response

```json
{
  "analysisId": "analysis_123",
  "status": "queued",
  "createdAt": "2026-01-01T12:00:00Z"
}
```

IDs and timestamps above are illustrative.
