# Security Policy

## Supported Versions

Only the latest minor release of each major version receives security fixes.

| Version | Supported          |
| ------- | ------------------ |
| 0.x (latest) | ✅ |
| < 0.x   | ❌ |

Once v1.0.0 is released, this table will be updated.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately via one of:

- **GitHub Private Vulnerability Reporting** (preferred):
  Navigate to the [Security tab](https://github.com/AkkilMG/orqis/security/advisories/new)
  of this repository and click "Report a vulnerability".

- **Email**: Send details to **me@akkil.dev**.

### What to include

- A description of the vulnerability and its potential impact.
- Steps to reproduce or a minimal proof-of-concept.
- The version(s) of Orqis affected.
- Any suggested mitigations or patches (optional but appreciated).

## Response Timeline

| Step | Target |
|------|--------|
| Acknowledgement | Within 48 hours |
| Initial triage  | Within 5 business days |
| Fix / advisory  | Within 30 days for critical issues; 90 days for others |

We will coordinate disclosure timing with you and credit you in the advisory
unless you prefer to remain anonymous.

## Scope

Orqis is a **zero-dependency**, in-process Node.js library with no network
listeners, no file-system access, and no persistent state. The attack surface
is limited to:

- Prototype pollution via task payloads.
- Denial-of-service via resource exhaustion (unbounded queue growth, CPU spin).
- Unexpected `AbortController` signal propagation.

Out of scope: vulnerabilities in your own task functions or in the broader Node.js runtime.

## Automated Security Measures

The following automated safeguards are in place across the repository:

- **CodeQL Analysis** — Static application security testing (SAST) runs on every push and pull request to detect vulnerabilities in source code.
- **npm Audit** — Dependency vulnerability scanning runs in CI, blocking critical-level issues from being merged.
- **Dependabot** — Automated pull requests are opened weekly to keep npm and GitHub Actions dependencies up to date with the latest security patches.

## Disclosure Policy

We follow [Coordinated Vulnerability Disclosure (CVD)](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerability_Disclosure_Cheat_Sheet.html).
Patches will be released as a semver patch release accompanied by a GitHub
Security Advisory and, where appropriate, a CVE.
