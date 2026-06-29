# Security Policy

**SpeexJS** takes the security of its software products seriously. This document outlines our vulnerability reporting process, supported versions, and disclosure policy.

> **⚠️ IMPORTANT:** If you believe you have found a security vulnerability, please report it privately as described below. **Do not** disclose it publicly via GitHub Issues or Discussions until a fix has been released.

---

## Table of Contents

- [Supported Versions](#supported-versions)
- [Reporting a Vulnerability](#reporting-a-vulnerability)
- [What to Include](#what-to-include)
- [Response SLA](#response-sla)
- [Responsible Disclosure Policy](#responsible-disclosure-policy)
- [Security Scope](#security-scope)
- [Recognition](#recognition)
- [Per-Package Policies](#per-package-policies)

---

## Supported Versions

### speexjs

| Version | Support |
|---------|---------|
| 1.x | ✅ Active development — security patches provided |
| 0.6.x – 0.9.x | ⚠️ Limited — critical security patches only |
| < 0.6 | ❌ End of life — no security patches |

### speexkit

| Version | Support |
|---------|---------|
| 1.4.x | ✅ Active development — security patches provided |
| 0.8.x – 1.3.x | ⚠️ Limited — critical security patches only |
| < 0.8 | ❌ End of life — no security patches |

---

## Reporting a Vulnerability

### Step 1: Report Privately

Send an email to **adityasuperdev@gmail.com** with the subject line prefixed by `[SECURITY]`.

### Step 2: Acknowledge

You will receive an acknowledgment of receipt within **48 hours**.

### Step 3: Collaborate

The maintainer will:
- Confirm the vulnerability and assess its severity
- Develop a fix and release timeline
- Coordinate with you on disclosure timing

---

## What to Include

To help us respond quickly and effectively, please include:

- **Vulnerability description** — what kind of issue it is (XSS, SQLi, RCE, etc.)
- **Affected package** — speexjs, speexkit, or speexray
- **Affected versions** — specific version range where the vulnerability exists
- **Reproduction steps** — minimal code snippet or configuration to trigger the issue
- **Proof of concept** (optional) — demonstrates the impact
- **Potential impact** — what an attacker could achieve
- **Suggested fix** (optional) — if you have a proposed patch

---

## Response SLA

| Phase | Timeframe |
|-------|-----------|
| **Acknowledgment** | Within 48 hours of report |
| **Triage & Assessment** | Within 5 business days |
| **Critical fix release** | Within 14 days (critical severity) |
| **High fix release** | Within 30 days (high severity) |
| **Medium/Low fix release** | Within 90 days (medium/low severity) |

### Severity Classification

| Severity | Definition | Example |
|----------|------------|---------|
| **🔴 Critical** | Remote code execution, auth bypass, data breach | SQL injection, RCE, SSRF |
| **🟠 High** | Significant security control bypass, sensitive data exposure | IDOR, CSRF on state-changing operations |
| **🟡 Medium** | Limited impact, requires other conditions | XSS in non-critical context, open redirect |
| **🔵 Low** | Minimal security impact, mostly informational | Missing security headers, debug info leakage |

---

## Responsible Disclosure Policy

We follow a **coordinated disclosure** model:

1. **Report first** — Submit the vulnerability privately via email
2. **Fixing period** — Allow us 30–90 days (depending on complexity) to develop and release a fix
3. **Coordinated disclosure** — Once a fix is released, we will coordinate with you on public disclosure timing
4. **Credit** — You will be credited in the release notes and changelog (if you consent)

We kindly ask that you **do not**:
- Publicly disclose the vulnerability before a fix is available
- Exploit the vulnerability beyond what is necessary to demonstrate it
- Access, modify, or exfiltrate user data beyond what is needed for proof of concept

---

## Security Scope

### What We Cover

| Area | Package | Security Measures |
|------|---------|-------------------|
| **Server** | speexjs | CSRF protection, Helmet security headers, rate limiting, CORS enforcement |
| **Authentication** | speexjs | SessionGuard (AES-256-GCM encrypted), TokenGuard (HMAC-SHA256), Sanctum SPA auth, OAuth with state parameter |
| **Authorization** | speexjs | Gate/Policy system, role-based access control |
| **Input Validation** | speexjs | Schema validation (25+ types), request body validation middleware |
| **Database** | speexjs | Parameterized queries via QueryBuilder, migration safety checks |
| **Cryptography** | speexjs | AES-256-GCM encryption, scrypt + PBKDF2 hashing, constant-time comparison |
| **Storage** | speexjs | Path traversal prevention, safe file operations |
| **Dependencies** | Both | **Zero runtime dependencies** — minimal attack surface |
| **CLI** | speexkit | dep-exray scanner detects known CVEs in project dependencies |

### What Is NOT Covered

- Third-party packages installed alongside SpeexJS
- Custom application-level security (business logic, custom middleware)
- Infrastructure security (host OS, network configuration, database server)
- Supply chain attacks on devDependencies (CI/CD only)

---

## Security Features by Design

| Feature | Benefit |
|---------|---------|
| **Zero runtime dependencies** | Eliminates supply chain risk from npm packages |
| **TypeScript strict mode** | Prevents common type-related security issues |
| **No `eval()` or dynamic code execution** | Prevents code injection via user input |
| **Parameterized queries** | Prevents SQL injection in QueryBuilder |
| **Constant-time comparison** | Prevents timing attacks on auth tokens |
| **Helmet integration** | Sets secure HTTP headers (CSP, HSTS, X-Frame-Options) |
| **CSRF token binding** | Protects against cross-site request forgery |

---

## Recognition

We maintain a **Security Hall of Fame** in our release notes. Reporters who responsibly disclose vulnerabilities will be:

- Credited in the relevant release's CHANGELOG (with your consent)
- Added to the acknowledgments section of the release notes
- Listed in the advisory (if published via GitHub Security Advisories)

---

## Per-Package Policies

For package-specific security details:

- [speexjs SECURITY.md](./packages/speexjs/SECURITY.md)
- [speexkit SECURITY.md](./packages/speexkit/SECURITY.md)
