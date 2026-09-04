# Feature: Status Snapshot

## Sub-features
- Terminal snapshot card display.
- Machine-readable `--json` output.
- Reading active execution state from `.sandcastle/run.json`.

## How to get to it (user POV)
Run `sandcastle status` from any terminal in a repository where a run has occurred or is running.

## Driving it with CLI
```bash
node dist/bin/sandcastle.js status --json
```

## Observable Evidence
Returns a JSON object matching `BatonRunSnapshot`:
```json
{
  "sessionId": "...",
  "status": "completed",
  "totalIssues": 2,
  "closedCount": 2,
  "blockedCount": 0
}
```
Exit code is `0`.

## Gotchas
- If no run has ever been initiated and `.sandcastle/run.json` does not exist, it reports no active session.
