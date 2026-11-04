# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |

## Reporting a Vulnerability

This mod runs as code inside a Claude Code session and reads session and settings data, so how it handles that data matters.

For non-sensitive issues, open a regular GitHub issue. If you believe you have found a security vulnerability that should be disclosed privately, please [contact](https://www.nathanv.com/contact) the maintainer directly.

Please include:

- A description of the issue
- Steps to reproduce
- Potential impact
- A suggested fix (if you have one)

You should receive a response within 72 hours.

## Known Limitations

- **A mod is code that runs in your session.** It is a hooks module with access to the engine's `$` interface, so the trust boundary is the code itself. The module is one file, `hooks/register.tsx`; read it before installing, and pin the version you reviewed.
- **It reads settings.** The only settings key it reads is `advisorModel`. It does not read other keys, credentials or the OAuth session.
- **State stays in the session.** Token totals live in the session's `$.state` and are not written to disk or sent anywhere by the mod.
- **No phoning home.** This project does not collect analytics or metrics and does not call home in any way.
