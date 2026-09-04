# Feature: Baton Runner Execution

## Sub-features
- Backlog sweep (`--all`).
- Sequential resumption (`--from <num>` or positional `sandcastle run <num>`).
- Single-issue / cherry-picked execution (`--only <num>` or `--only 1,2`).
- Dry-run simulation (`--mode dry-run`).
- JSON output (`--json`).

## How to get to it (user POV)
Run `sandcastle run <issue>` or `sandcastle run --only <issue>`.

## Driving it with CLI
Safely drive with dry-run mode:
```bash
node dist/bin/sandcastle.js run 1 --mode dry-run --json
```

## Observable Evidence
Returns JSON with finish summary:
```json
{
  "success": true,
  "totalProcessed": 1,
  "closedIssues": [1],
  "blockedIssues": []
}
```
Exit code is `0`.

## Gotchas
- `sandcastle run 10` resumes from 10 onward. To run only issue 10, use `--only 10`.
- Specifying both `--from` and `--only` fails with a conflict error (exit code 1).
