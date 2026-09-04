# Feature: Update & Skill Synchronization

## Sub-features
- Check for updates (`--check`).
- CI validation mode (`--ci`).
- Force synchronization (`--force`).

## How to get to it (user POV)
Run `sandcastle update --check`.

## Driving it with CLI
```bash
node dist/bin/sandcastle.js update --check --json
```

## Observable Evidence
Returns JSON with version details and update status:
```json
{
  "currentVersion": "0.1.0",
  "upToDate": true
}
```
Exit code is `0`.

## Gotchas
- In `--ci` mode, returns non-zero exit code if an update is available.
