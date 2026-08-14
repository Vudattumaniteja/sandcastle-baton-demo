# Sandcastle Baton Demo (`TaskVault`)

A lightweight key-value ledger and state vault with cryptographic audit capabilities, designed for benchmarking and orchestrating **Sandcastle** autonomous agent batons with Google Antigravity.

## Architecture

- **Runtime**: Node.js (ES Modules, native `node --test`)
- **Core**: `src/vault.js`
- **Tests**: `npm test`

## Sandcastle Autonomous Agent Loop

Run sequential issue implementation loops using the Antigravity baton script:

```powershell
.\sandcastle.ps1 -Repo "Vudattumaniteja/sandcastle-baton-demo" -StartIssue 1
```

Or invoke within Antigravity directly:
```text
Use sandcastle on Vudattumaniteja/sandcastle-baton-demo starting at issue #1
```
