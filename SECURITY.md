# Security Policy

We take security seriously. Please follow these guidelines to help keep the project and users safe.

## Reporting a Vulnerability

- Do not open public issues for security problems.
- Email the maintainer listed in the repository profile or use GitHub Security Advisories to privately report.
- Include a clear description, impacted versions, PoC (if available), and suggested remediation.

## Secrets and Credentials

- Never commit secrets. This includes API keys, tokens, passwords, and certificates.
- Environment files are ignored by default (`.env`, `.env.local`, `.env.*`). Keep them out of source control.
- Use GitHub Actions Secrets and/or Environment Variables to provide credentials at runtime.
- Rotate credentials regularly and revoke any exposed token immediately.

## Dependency Hygiene

- Prefer `npm ci` in CI to use the exact lockfile.
- Update dependencies regularly and review changelogs for security-related fixes.
- Run vulnerability scans (e.g., `npm audit`) periodically.

## CI/CD

- Limit permissions for GitHub Actions tokens (principle of least privilege).
- Avoid printing secrets to logs; use `::add-mask::` if necessary.
- Review third-party actions and pin to trusted versions.

## Data & Privacy

- Avoid storing sensitive user data. If necessary, encrypt at rest and in transit.
- Redact or anonymize data in logs and diagnostics.

Thank you for helping keep this project secure.
