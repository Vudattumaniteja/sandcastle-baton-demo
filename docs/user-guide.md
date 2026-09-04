# Sandcastle User Guide

Sandcastle is an autonomous GitHub issue baton orchestrator for AI coding agents. It runs sequential backlog issues or isolated single tasks, enforces safety gates, verifies code with automated tests, opens and merges pull requests, and advances across issues automatically.

---

## 1. Installation & Setup

### Prerequisites
- **Node.js**: Version 18.0.0 or higher (`node -v`).
- **GitHub CLI (`gh`)**: Authenticated with repository access (`gh auth status`).
- **Google Antigravity CLI (`agy`)**: Installed and in your system PATH (`agy --version`).
- **Git**: Working git clone with tracking remote (`git status`).

### Global Installation via npm
```bash
npm install -g sandcastle
# Or link locally for development
npm link
```

Installing provides two executable commands:
- `sandcastle`: Primary command name.
- `sc`: Short alias.

---

## 2. Quickstart & Interactive Wizard

Running Sandcastle with zero arguments in an interactive terminal opens the interactive TUI wizard:

```bash
sandcastle
# or
sc
```

### Wizard Workflow
1. **Preflight Diagnostics**: Runs doctor checks to verify git repository, `gh` auth, `agy` CLI, and workspace gates.
2. **Backlog Inspection**: Fetches open issues and runs gating evaluations in memory.
3. **Issue Selection**:
   - Choose **All Ready Issues** to run all unblocked issues sequentially in backlog order.
   - Choose a specific issue to open a scope choice:
     - **Run only issue #N**: Runs that single issue and halts.
     - **Resume backlog from #N onward**: Runs #N and all subsequent open ready issues.
4. **Model Selection**: Selects candidate AI model (defaults to `Gemini 3.8 Flash (High)`).
5. **Reasoning Effort**: Chooses `low`, `medium`, or `high` thinking budget.
6. **Execution Mode**:
   - `afk`: Full autonomous execution (default).
   - `supervised`: Prompts for confirmation before opening/merging PRs.
   - `dry-run`: Simulates the worker lifecycle without running Antigravity or modifying git.
7. **Launch**: Summarizes configuration in a launch card and starts execution.

---

## 3. CLI Command Reference

### `sandcastle run` / `sc run`

Executes issues using the baton state machine.

```bash
# Run all open ready issues in backlog order
sandcastle run --all

# Resume backlog sequentially starting from issue 42 onward
sandcastle run 42
sandcastle run --from 42

# Run only issue 42 in isolation and stop
sandcastle run --only 42

# Run multiple cherry-picked issues in specified order
sandcastle run --only 42,45,48

# Run parent/epic issue and expand its child tasks
sandcastle run 10 --expand-children
sandcastle run 10 -y

# Headless run for CI / scripts with JSON output
sandcastle run --all --mode dry-run --json
```

#### Run Options

| Flag | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `[target]` | positional | (none) | Issue number. Defaults to resuming from this issue onward (`--from`). |
| `-f, --from <num>` | number | (none) | Resume backlog sequentially from this issue number onward. |
| `-o, --only <issues...>` | list | (none) | Run only the specified issue(s) (e.g. `42` or `42,45`), then halt. |
| `-a, --all` | boolean | `false` | Run all open ready issues from the lowest number onward. |
| `-m, --model <name>` | string | `Gemini 3.8 Flash` | Antigravity model name or alias. |
| `-e, --effort <level>` | string | `high` | Reasoning effort: `low`, `medium`, or `high`. |
| `--mode <mode>` | string | `afk` | Execution mode: `afk`, `supervised`, or `dry-run`. |
| `-t, --timeout <duration>` | string | `30m` | Watchdog timeout per issue worker session. |
| `-r, --retries <num>` | number | `2` | Number of worker failure retries before marking an issue blocked. |
| `--parent-context <mode>` | string | `reference` | How parent issue text is included: `reference`, `inline`, or `none`. |
| `--expand-children` | boolean | `false` | Automatically expand parent/epic issues into child tasks. |
| `-y, --yes` | boolean | `false` | Non-interactive confirmation for parent expansion. |
| `--cwd <path>` | string | current dir | Working directory for git operations and worker sessions. |
| `--prompt-template <path>` | string | (none) | Path to custom worker prompt markdown template. |
| `--auto-pr` | boolean | `true` | Automatically create pull request on worker success. |
| `--auto-merge` | boolean | `true` | Automatically merge pull request when checks pass. |
| `--json` | boolean | `false` | Output results as structured JSON. |
| `-q, --quiet` | boolean | `false` | Suppress non-essential terminal banners. |

*Note on Flag Exclusivity:* Positional target, `--from`, `--only`, and `--all` are mutually exclusive. Passing more than one results in an immediate error with exit code 1.

---

### `sandcastle watch` / `sc watch`

Opens an alternate-screen terminal monitor displaying live status, worker phase updates, Antigravity quota snapshots, and active agent transcript streaming.

```bash
sandcastle watch
sandcastle watch --interval 500
```

- Press `q` or `Ctrl+C` to return to your normal terminal buffer.
- Quota meters update automatically every 1000ms (or `--interval` ms).

---

### `sandcastle status` / `sc status`

Inspects the current or most recent baton execution recorded in `.sandcastle/run.json`.

```bash
sandcastle status
sandcastle status --json
```

Outputs active session ID, execution mode, scope, current issue, elapsed duration, and completed vs blocked counts.

---

### `sandcastle doctor` / `sc doctor`

Runs preflight health checks to verify your environment is ready for autonomous agent execution.

```bash
sandcastle doctor
sandcastle doctor --json
```

Validates:
1. **Git Workspace**: Current directory is a git repository with an origin remote.
2. **GitHub Authentication**: `gh auth status` returns 0.
3. **Google Antigravity CLI**: `agy` binary exists and responds.
4. **Node.js Environment**: Node version satisfies `>= 18.0.0`.
5. **Workspace Gates**: Required labels exist on GitHub repository.

---

### `sandcastle config` / `sc config`

Inspects and updates configuration values.

```bash
# List all resolved configuration values
sandcastle config list
sandcastle config list --json

# Read a specific key
sandcastle config get model
sandcastle config get mode

# Set a key locally in .sandcastle/config.json
sandcastle config set model "Gemini 3.8 Flash"
sandcastle config set retries 3

# Set a key globally in ~/.sandcastle/config.json
sandcastle config set model "Gemini 3.1 Pro" --global
```

---

### `sandcastle update` / `sc update`

Checks for updates to Sandcastle and synchronizes verification skills across agent environments.

```bash
# Check if updates are available
sandcastle update --check

# Force reinstall / update to latest version
sandcastle update --force

# Run in CI mode (non-zero exit on outdated versions)
sandcastle update --ci
```

---

## 4. Configuration Precedence

Sandcastle resolves settings in three tiers. Higher tiers always override lower tiers:

```
CLI Flags (--model, --timeout, --mode)
       ↓
Local Project Config (.sandcastle/config.json)
       ↓
Global User Config (~/.sandcastle/config.json)
       ↓
Built-in Defaults (Gemini 3.8 Flash, 30m timeout, 2 retries, AFK mode)
```

### Configuration File Schema (`.sandcastle/config.json`)

```json
{
  "model": "Gemini 3.8 Flash",
  "reasoningEffort": "high",
  "mode": "afk",
  "timeout": "30m",
  "retries": 2,
  "autoPr": true,
  "autoMerge": true,
  "repo": "owner/repo",
  "parentLabels": ["parent", "epic", "wayfinder:map"],
  "hitlLabels": ["wayfinder:grilling", "wayfinder:prototype"],
  "parentContext": "reference",
  "promptTemplate": ""
}
```
