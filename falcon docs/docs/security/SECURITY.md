# FALCON Security and Threat Model

## 1. Security posture

Repository source code is untrusted input. Even static analysis can be attacked through path tricks, malformed files, resource exhaustion, parser bugs and unsafe subprocess usage.

The MVP should be local-first and read-only. A future hosted service has a substantially larger threat surface.

## 2. Assets

- Source code and intellectual property.
- GitHub installation tokens and user credentials.
- Analysis reports and repository metadata.
- Worker host and filesystem.
- Tenant and organization boundaries in hosted mode.

## 3. Threat actors

- Malicious repository contributor.
- Compromised dependency or repository configuration.
- Malicious webhook sender.
- Cross-tenant attacker.
- Accidental operator or developer error.

## 4. Threats and controls

| Threat | Required control |
|---|---|
| Path traversal | Canonicalize paths and enforce repository-root containment |
| Symlink escape | Resolve real paths and reject out-of-root targets |
| Command injection | Use subprocess argument arrays; never interpolate shell strings |
| Arbitrary code execution | Do not run package scripts, tests or builds by default |
| Resource exhaustion | File size/count limits, timeouts, cancellation and memory limits |
| Malformed source/config | Validate inputs and isolate parser failures |
| Token leakage | Secret manager/encryption, redaction and least privilege |
| Webhook spoofing | Verify signature and timestamp/replay protections |
| Tenant data leakage | Tenant-scoped authorization on every query and artifact |
| Network exfiltration | Isolated workers with restricted egress |
| Report injection | Escape source-derived text in terminal, HTML and Markdown output |

## 5. MVP rules

- Do not execute package manager commands.
- Do not install repository dependencies automatically.
- Do not load arbitrary compiler plugins.
- Do not run build scripts.
- Do not upload source files.
- Read only eligible source and Git object data.
- Bound file size, file count, parse duration and output size.
- Treat source comments, strings and filenames as untrusted display content.

## 6. Future hosted worker isolation

Before hosted execution:
- Run one analysis job in an isolated container or stronger sandbox.
- Use non-root user and read-only base filesystem.
- Mount repository content read-only where possible.
- Apply CPU, memory, PID, disk and wall-clock limits.
- Disable network by default; allowlist only required Git access.
- Destroy workspace after job completion.
- Scope credentials to one repository and one job.
- Keep secrets out of environment dumps and logs.
- Audit access to reports and artifacts.

## 7. Privacy

Document:
- What repository data is collected.
- Whether source content is retained.
- Retention and deletion behavior.
- Whether telemetry contains paths or symbol names.
- Whether any external model or service receives code.

Default principle: no source-code upload to third parties.
