# Sandcastle CLI Reference Manual

Sandcastle is invoked via the global command `sandcastle` or its shorthand alias `sc`. It provides both interactive terminal interfaces and headless, scriptable subcommands for automated CI/CD and agent workflows.

---

## Global Binary & Aliases

```bash
sandcastle [command] [options]
sc [command] [options]
```

### Global Options

| Option | Shorthand | Description |
| :--- | :--- | :--- |
| `--version` | `-v` | Output the current version string. |
| `--help` | `-h` | Display help information for Sandcastle or a specific subcommand. |

---

## Exit Codes

All Sandcastle commands return standard POSIX process exit codes:

| Exit Code | Name | Condition |
| :---: | :--- | :--- |
| **`0`** | `SUCCESS` | Baton finished all target issues successfully, doctor diagnostics passed, or config query completed. |
| **`1`** | `FAILURE / BLOCKED` | Fatal diagnostic failure, issue gating failure, test verification failure, or unrecoverable blocker. |

---

## Subcommands Overview

| Subcommand | Description | Primary Mode |
| :--- | :--- | :--- |
| [`sandcastle wizard`](#1-sandcastle-wizard) | Launch the interactive guided TUI wizard (default in TTY without args). | Interactive |
| [`sandcastle run`](#2-sandcastle-run) | Execute an autonomous issue baton loop on one or more issues. | Headless / Automated |
| [`sandcastle status`](#3-sandcastle-status) | Print runtime snapshot and telemetry for the active or latest baton run. | Telemetry & Observability |
| [`sandcastle doctor`](#4-sandcastle-doctor) | Validate workspace health, toolchain prerequisites, and gate assets. | Health & Diagnostics |
| [`sandcastle config`](#5-sandcastle-config) | Read, write, or list 4-tier configuration values. | Configuration |
| [`sandcastle watch`](#6-sandcastle-watch) | Live alternate-screen terminal monitor streaming agent transcripts and progress. | Live Monitoring |

---

## 1. `sandcastle wizard`

Launches the interactive `@clack/prompts` guided flow.

```bash
sandcastle wizard
# or simply:
sandcastle
sc
```

*For complete wizard UI details, see the [Interactive Wizard Guide](file:///C:/Users/Manit/Desktop/sandcastle/docs/user/interactive-wizard.md).*

---

## 2. `sandcastle run`

Executes the sequential issue baton state machine on a single issue or the entire ready backlog.

```bash
sandcastle run [issue] [options]
```

### Arguments

- `[issue]` *(optional)*: The target issue number (e.g. `42` or `#42`). Required unless `-a, --all` is provided.

### Options & Flags

| Flag | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `-a, --all` | Boolean | `false` | Process all open ready issues in backlog sequentially. |
| `-m, --model <name>` | String | Configured default (`Gemini 3.7 Flash`) | LLM model identifier or alias to use for Antigravity workers. |
| `-e, --effort <level>` | Enum: `low` \| `medium` \| `high` | `high` | Reasoning effort level for worker sessions. |
| `--mode <mode>` | Enum: `afk` \| `supervised` \| `dry-run` | `afk` | Execution autonomy mode. |
| `-t, --timeout <dur>` | String | `30m` | Watchdog timeout per issue (e.g. `15m`, `45m`, `1h`). |
| `--retries <N>` | Number | `2` | Maximum retry attempts per issue upon test/implementation failure. |
| `--auto-pr` | Boolean | `true` | Automatically create a Pull Request upon verified local tests. |
| `--no-auto-pr` | Boolean | — | Disable automatic Pull Request creation. |
| `--auto-merge` | Boolean | `true` | Automatically merge the Pull Request upon creation. |
| `--no-auto-merge` | Boolean | — | Disable automatic Pull Request merging. |
| `--prompt-template <path>` | String | Auto-resolved | Path to custom markdown prompt template file. |
| `--parent-context <mode>` | Enum: `reference` \| `inline` \| `none` | `reference` | Parent issue context injection mode in prompt context. |
| `--expand-children` | Boolean | `false` | Expand direct parent issue execution into its child tasks. |
| `-y, --yes` | Boolean | `false` | Automatically confirm interactive prompts (e.g. expand children). |
| `--json` | Boolean | `false` | Output structured JSON finish payload to stdout. Automatically activates quiet mode. |
| `--quiet` | Boolean | `false` | Suppress non-essential progress output and banners. |

### Examples

```bash
# Execute single issue #10 autonomously
sandcastle run 10

# Execute all open unblocked issues sequentially
sandcastle run --all

# Run with specific model and medium reasoning effort
sandcastle run 15 --model "Gemini 3.1 Pro" --effort medium

# Run in supervised mode with 45m timeout
sandcastle run 20 --mode supervised --timeout 45m --retries 1

# Dry-run validation of entire backlog outputting JSON
sandcastle run --all --mode dry-run --json
```

### JSON Output Schema (`sandcastle run --json`)

```json
{
  "success": true,
  "totalProcessed": 2,
  "closedIssues": [42, 43],
  "blockedIssues": [],
  "durationMs": 95400
}
```

---

## 3. `sandcastle status`

Reads the workspace state file (`.sandcastle/run.json`) and renders a status snapshot of the current or most recent baton execution.

```bash
sandcastle status [options]
```

### Options

| Flag | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `--json` | Boolean | `false` | Output raw JSON state snapshot for CI or automation. |

### JSON Output Schema (`sandcastle status --json`)

```json
{
  "sessionId": "baton-1771128000000-a1b2c",
  "startTime": "2026-08-15T04:00:00.000Z",
  "endTime": "2026-08-15T04:01:35.400Z",
  "status": "completed",
  "repo": "Vudattumaniteja/sandcastle-baton-demo",
  "mode": "afk",
  "processedIssues": [
    {
      "number": 42,
      "title": "Add JSON schema validation",
      "status": "completed",
      "durationMs": 48200
    }
  ],
  "totalIssues": 1,
  "closedCount": 1,
  "blockedCount": 0,
  "lastUpdated": "2026-08-15T04:01:35.400Z"
}
```

---

## 4. `sandcastle doctor`

Performs end-to-end workspace health checks, toolchain verifications, and gate asset validations.

```bash
sandcastle doctor [options]
```

### Options

| Flag | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `--json` | Boolean | `false` | Output structured diagnostic JSON report. Exits with code 1 if unhealthy. |

### Diagnostic Checks Evaluated

1. **`node`**: Node.js runtime version `>= 18.0.0` (Fatal).
2. **`git`**: Inside a valid Git worktree and detects active branch (Fatal).
3. **`gh-auth`**: GitHub CLI (`gh`) authenticated with repository permissions (Fatal).
4. **`agy-cli`**: Google Antigravity CLI (`agy`) present in PATH (Non-fatal warning).
5. **`workspace-assets`**: Presence of [`SKILL.md`](file:///C:/Users/Manit/Desktop/sandcastle/SKILL.md), [`CONTEXT.md`](file:///C:/Users/Manit/Desktop/sandcastle/CONTEXT.md), [`AGENTS.md`](file:///C:/Users/Manit/Desktop/sandcastle/AGENTS.md) (Non-fatal warning).

### JSON Output Schema (`sandcastle doctor --json`)

```json
{
  "healthy": true,
  "checks": [
    {
      "id": "node",
      "name": "Node.js Runtime",
      "passed": true,
      "message": "Node.js v22.13.0 (Required >= 18.0.0)",
      "fatal": true
    },
    {
      "id": "git",
      "name": "Git Workspace",
      "passed": true,
      "message": "Valid Git repository (Active branch: main)",
      "fatal": true
    },
    {
      "id": "gh-auth",
      "name": "GitHub CLI Auth",
      "passed": true,
      "message": "GitHub CLI (gh) is authenticated and functional.",
      "fatal": true
    },
    {
      "id": "agy-cli",
      "name": "Antigravity CLI (agy)",
      "passed": true,
      "message": "Antigravity CLI is installed (Ready)",
      "fatal": false
    },
    {
      "id": "workspace-assets",
      "name": "Workspace Gate Assets",
      "passed": true,
      "message": "All required workspace assets present (SKILL.md, CONTEXT.md, AGENTS.md).",
      "fatal": false
    }
  ]
}
```

---

## 5. `sandcastle config`

Manages local and global Sandcastle configuration settings across the 4-tier hierarchy.

### 5.1 `sandcastle config get <key>`

Retrieves the resolved effective value for a specific configuration key.

```bash
sandcastle config get model
sandcastle config get timeout --json
```

### 5.2 `sandcastle config set <key> <value>`

Sets a configuration key in the local project (`.sandcastle/config.json`) or globally (`~/.sandcastle/config.json`).

```bash
# Set locally for current repository
sandcastle config set model "Gemini 3.1 Pro"
sandcastle config set reasoningEffort high

# Set globally for all repositories on machine
sandcastle config set model "Gemini 3.7 Flash" --global
sandcastle config set timeout "45m" -g
```

### 5.3 `sandcastle config list`

Displays configuration values across all tiers (Defaults, Global, Local, and Resolved).

```bash
sandcastle config list
sandcastle config list --json
```

*For complete configuration schema details, see the [Configuration Guide](file:///C:/Users/Manit/Desktop/sandcastle/docs/user/configuration.md).*

---

## 6. `sandcastle watch`

Opens an alternate-screen live terminal monitor streaming real-time agent transcripts, tool calls, and progress.

```bash
sandcastle watch [options]
```

### Options

| Flag | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `-i, --interval <ms>` | Number | `500` | Refresh polling interval in milliseconds. |
| `-f, --file <path>` | String | Auto-resolved | Explicit transcript JSONL file path to stream. |
| `-s, --session <id>` | String | Active session | Specific Antigravity session/conversation ID to attach to. |
| `--state <path>` | String | `.sandcastle/run.json` | Custom path to baton run state file. |
| `--once` | Boolean | `false` | Render a single snapshot frame to terminal and exit immediately. |
| `--json` | Boolean | `false` | Output live monitoring snapshot (state, transcript summary, statusline quota) in JSON format. |

---

## Context Pointers & Related Guides

| Document | Description | Reached When |
| :--- | :--- | :--- |
| [getting-started.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/user/getting-started.md) | Initial setup, global install, and prerequisites. | Installing or verifying the toolchain. |
| [interactive-wizard.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/user/interactive-wizard.md) | Interactive TUI walkthrough of the guided wizard. | Running without CLI flags in an interactive terminal. |
| [configuration.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/user/configuration.md) | 4-tier configuration hierarchy and JSON file formats. | Setting persistent configuration defaults. |
| [worker-contract.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/agents/worker-contract.md) | Specification of the 7 worker execution phases executed by `sandcastle run`. | Auditing worker agent actions and blocker behaviors. |
