# Feature: Doctor Preflight Diagnostics

## Sub-features
- Git repository validation.
- GitHub CLI (`gh`) authentication check.
- Google Antigravity (`agy`) CLI presence check.
- Node.js runtime version check (`>= 18.0.0`).
- Workspace gate label validation.
- `--json` machine-readable output.

## How to get to it (user POV)
Run `sandcastle doctor` from any terminal in a git repository.

## Driving it with CLI
```bash
node dist/bin/sandcastle.js doctor --json
```

## Observable Evidence
The JSON output contains:
```json
{
  "healthy": true,
  "checks": [
    { "name": "Git Repository", "passed": true },
    { "name": "GitHub CLI Auth", "passed": true },
    { "name": "Antigravity CLI", "passed": true },
    { "name": "Node.js Environment", "passed": true },
    { "name": "Workspace Gating Labels", "passed": true }
  ]
}
```
Exit code is `0`.

## Gotchas
- Running outside a git repository fails the first check.
- If `gh auth status` fails or GitHub credentials expired, the auth check fails.
