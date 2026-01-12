# Security Policy

## Overview

The security of **swappy** is a top priority. As a cryptocurrency exchange platform handling sensitive financial operations and HD wallet generation (BIP32/39/44), we take all security vulnerabilities seriously.

This document outlines our security policies, how to report vulnerabilities, and best practices for users.

---

## Supported Versions

| Version       | Supported          | Notes                              |
|---------------|--------------------|------------------------------------|
| 0.1.0-beta    | :white_check_mark: | Current release, actively maintained |
| < 0.1.0       | :x:                | Pre-release versions, not supported |

We recommend always running the latest version to ensure you have the most recent security patches.

---

## Reporting a Vulnerability

If you discover a security vulnerability in swappy, please report it responsibly. **Do not disclose security vulnerabilities publicly** until we have had an opportunity to address them.

### How to Report

1. **GitHub Security Advisories** (Preferred): [Report a Vulnerability](https://github.com/Sou0327/swappy/security/advisories/new)
2. **Include the following information**:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact assessment
   - Any proof-of-concept code (if applicable)
   - Your contact information for follow-up

### What to Expect

| Timeline | Action |
|----------|--------|
| Within 48 hours | Acknowledgment of your report |
| Within 7 days | Initial assessment and severity classification |
| Within 30 days | Resolution timeline provided |
| Upon fix | Credit in security advisory (if desired) |

We will keep you informed throughout the remediation process and notify you when the issue has been resolved.

---

## Responsible Disclosure Policy

We kindly ask security researchers to:

1. **Allow reasonable time** for us to investigate and address the vulnerability before any public disclosure
2. **Avoid accessing or modifying user data** beyond what is necessary to demonstrate the vulnerability
3. **Do not exploit the vulnerability** for any purpose other than verification
4. **Do not perform actions** that could negatively impact the availability of the service
5. **Report vulnerabilities in good faith** with the intent of improving security

In return, we commit to:

- Responding promptly to your report
- Providing regular updates on our progress
- Not pursuing legal action against researchers who follow this policy
- Publicly acknowledging your contribution (with your permission)
- Working with you to understand and resolve the issue

---

## Security Best Practices for Users

### Wallet Security

- **Never share your mnemonic seed phrase** with anyone, including support staff
- **Store seed phrases offline** in a secure, physical location
- **Use strong, unique passwords** for your account
- **Enable two-factor authentication (2FA)** when available

### Account Security

- **Verify the URL** before entering credentials (watch for phishing attempts)
- **Use a dedicated browser/profile** for financial transactions
- **Keep your browser and operating system updated**
- **Log out from shared or public devices** after each session

### Transaction Security

- **Double-check wallet addresses** before confirming transactions
- **Start with small test transactions** when sending to new addresses
- **Be cautious of unsolicited messages** requesting funds or account access

### Development/Self-Hosting Security

If you are self-hosting or developing with this codebase:

- **Never commit `.env` files** or secrets to version control
- **Use environment variables** for all sensitive configuration
- **Enable Row Level Security (RLS)** on all Supabase tables
- **Regularly update dependencies** to patch known vulnerabilities
- **Review Supabase security rules** before production deployment

---

## Out of Scope

The following are considered **out of scope** for security vulnerability reports:

### General Exclusions

- Vulnerabilities in third-party services (Supabase, hosting providers, etc.)
- Social engineering attacks against team members or users
- Physical attacks against infrastructure
- Denial of Service (DoS/DDoS) attacks
- Spam or rate limiting issues without security impact

### Application-Specific Exclusions

- Self-XSS (requiring user interaction to paste malicious code)
- Missing security headers without demonstrated exploit
- Clickjacking on pages with no sensitive actions
- CSRF on logout or other non-state-changing operations
- Vulnerabilities requiring physical access to a user's device
- Outdated browser or client-side vulnerabilities

### Informational Issues

- Version disclosure without demonstrated vulnerability
- Descriptive error messages without sensitive data exposure
- Missing best practices without concrete security impact
- Theoretical vulnerabilities without proof of concept

---

## Security Updates

Security advisories and updates will be published through:

- GitHub Security Advisories
- Release notes in the CHANGELOG
- Direct notification to affected users (when applicable)

---

## Contact

For security-related inquiries:

- **Security Reports**: [GitHub Security Advisories](https://github.com/Sou0327/swappy/security/advisories/new)
- **General Inquiries**: [GitHub Discussions](https://github.com/Sou0327/swappy/discussions)

---

## Acknowledgments

We appreciate the security research community's efforts in helping keep swappy and its users safe. Contributors who report valid security vulnerabilities will be acknowledged in our security advisories (with their permission).

---

*This security policy is effective as of January 2025 and may be updated periodically.*
