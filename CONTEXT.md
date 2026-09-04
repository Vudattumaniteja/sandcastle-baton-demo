# Context: Sandcastle Autonomous Issue Baton

Sandcastle is an autonomous, sequential GitHub issue baton orchestrator designed for AI coding agents (specifically Google Antigravity `agy` and subagent architectures).

## Core Domain Concepts

### Baton
The baton is the sequential orchestration mechanism. It ensures that one agent session focuses exclusively on one issue at a time in a clean, isolated context window. Once the issue is implemented, verified, committed, PR'd, merged, and closed, the baton advances to the next unblocked issue.

### Worker Session
An isolated execution environment (either an Antigravity subagent via `invoke_subagent` or a standalone headless CLI process via `agy`) instantiated specifically for a single issue. Context is never shared or bloated across issues.

### Issue Gates
The safety prerequisites evaluated before any worker is launched:
1. Issue state must be `OPEN`.
2. Issue must bear the `ready-for-agent` label.
3. Issue must bear the `AFK` (or `afk`) label.
4. All dependent/prerequisite issues mentioned in the issue or tracked via GitHub issue dependencies must be `CLOSED`.

### Blocker Protocol
A strict halt policy. If an issue fails gating checks, if an agent encounters ambiguity, or if local verification fails, the issue is labelled `status blocked`, diagnostic details are commented, and the baton is halted immediately to protect repository integrity.

### Worker Contract
The mandatory step sequence executed by each worker: Inspect -> Minimal Implementation -> Local Verification -> Git Branch & Commit -> Pull Request -> Merge -> Issue Closure. See [`docs/architecture.md`](docs/architecture.md) for the authoritative specification.

### Sandcastle CLI (`sandcastle` / `sc`)
The global cross-platform TypeScript command-line tool. Provides both an interactive terminal wizard and headless execution modes for driving sequential Antigravity (`agy`) batons in any repository. See [`docs/user-guide.md`](docs/user-guide.md).

### Interactive Wizard Mode
The default experience when `sandcastle` is run without arguments in a Git workspace. Guides the user through pre-flight auth checks, open issue browsing/selection, runner options, and live execution display. See [`docs/user-guide.md`](docs/user-guide.md).

### Headless Mode
Non-interactive CLI execution (e.g. `sandcastle run 42` or `sandcastle run --all`) accepting arguments directly for scriptability, scheduled runs, and automated pipelines. See [`docs/user-guide.md`](docs/user-guide.md).

### Execution Scope
The bounding criteria determining which issues are targeted for execution: `all` (entire ready backlog), `from` (sequential backlog resumption from a start offset), or `only` (one or more isolated cherry-picked issues).

### Sequential Resumption
Execution mode starting from a specific issue offset (`--from <num>` or positional `sandcastle run <num>`) and advancing sequentially through subsequent open issues in ascending number order.

### Single-Issue Execution
Execution mode targeting an isolated ticket (`--only <num>`) or explicit cherry-picked list (`--only <num1,num2>`), halting immediately after processing without sweeping the remainder of the backlog.

### Antigravity Runner & Interop
The dedicated execution driver that spawns isolated Google Antigravity (`agy`) CLI sub-processes with configurable model, timeout, and permission flags, or dispatches in-session subagents via `invoke_subagent`. See [`docs/architecture.md`](docs/architecture.md).

---

## File Structure & Documentation Index

- `src/`: TypeScript source code for the global Sandcastle CLI.
- `SKILL.md`: Root copy of the Sandcastle agent skill.
- `.agents/skills/sandcastle/`: Discoverable Antigravity skill directory.
- `docs/user-guide.md`: Comprehensive user manual (quickstart, interactive wizard, command reference, configuration, and doctor checks).
- `docs/architecture.md`: Complete architectural design (state machine, gating evaluator, supervisor, and Antigravity interop).
- `docs/adr/`: Architecture Decision Records:
  - `0001-powershell-and-subagent-baton-architecture.md`
  - `0002-cli-semantics-and-wizard-resumption-flow.md`
- `CONTEXT.md`: This domain context and terminology map.
- `AGENTS.md`: Agent behavior rules and skill mappings.
