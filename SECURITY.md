# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Democracy Monitor, please report it responsibly.

**Email:** [michaelk@agileexplorations.com](mailto:michaelk@agileexplorations.com)

Do **not** open a public GitHub issue for security vulnerabilities.

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

### Response timeline

- **Acknowledgment:** within 72 hours
- **Assessment:** within 1 week
- **Fix or mitigation:** depends on severity, but we aim for 30 days for critical issues

## Scope

The following are in scope for security reports:

- **Injection vulnerabilities** in API routes (`pages/api/`) — SQL injection, command injection, XSS
- **Proxy abuse** via `/api/proxy` — SSRF, host allowlist bypass, cache poisoning
- **Credential exposure** — API keys, database connection strings, or tokens leaked in logs, responses, or committed to the repository
- **Dependency vulnerabilities** — known CVEs in project dependencies
- **Authentication/authorization bypass** in any server-side endpoint

The following are **not** security issues:

- Assessment methodology disagreements (use a regular issue)
- AI model output quality or bias concerns (use a regular issue)
- Rate limiting or availability — this is a small OSS project, not a production SaaS

## Security Practices

### API keys

- API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_URL`) are loaded from environment variables and `.env.local`, which is gitignored
- The application never logs, returns, or stores API keys in the database
- Contributors must never commit credentials — pre-commit hooks help but are not a guarantee

### Proxy endpoint

- The `/api/proxy` route restricts outbound requests to an explicit host allowlist (`lib/allowedHosts.ts`)
- Responses are cached in Redis with a configurable TTL

### Dependencies

- Dependabot is enabled for automated dependency update PRs
- `pnpm audit` is run periodically to check for known vulnerabilities
