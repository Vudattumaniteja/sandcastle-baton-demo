# Feature: Configuration Service

## Sub-features
- Read single key (`sandcastle config get <key>`).
- Set local key in `.sandcastle/config.json` (`sandcastle config set <key> <value>`).
- Set global key in `~/.sandcastle/config.json` (`sandcastle config set <key> <value> --global`).
- List resolved values across 3 tiers (`sandcastle config list --json`).

## How to get to it (user POV)
Run `sandcastle config list` or `sandcastle config get model`.

## Driving it with CLI
```bash
node dist/bin/sandcastle.js config list --json
```

## Observable Evidence
Returns JSON showing defaults, local, global, and resolved tiers:
```json
{
  "defaults": {
    "model": "Gemini 3.8 Flash",
    "mode": "afk"
  },
  "resolved": {
    "model": "Gemini 3.8 Flash"
  }
}
```
Exit code is `0`.

## Gotchas
- Setting invalid keys or malformed JSON is rejected with exit code `1`.
