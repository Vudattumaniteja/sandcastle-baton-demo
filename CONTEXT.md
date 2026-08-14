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
The mandatory step sequence executed by each worker:
1. **Read & Inspect**: Fetch issue body, requirements, and existing test suites.
2. **Minimal Implementation**: Implement minimal code directly satisfying acceptance criteria.
3. **Local Verification**: Run test suites, linting, and build commands until green.
4. **Git Branch & Commit**: Create feature branch `issue-<N>-<desc>` and commit with conventional messages referencing `#<N>`.
5. **Pull Request**: Open PR via `gh pr create`.
6. **Merge**: Merge PR via `gh pr merge --merge` (or squash according to repo conventions).
7. **Issue Closure**: Close the issue with `gh issue close <N>` and an audit summary comment.

### Sandcastle CLI (`sandcastle` / `sc`)
The global cross-platform TypeScript command-line tool. Provides both an interactive terminal wizard and headless execution modes for driving sequential Antigravity (`agy`) batons in any repository.

### Interactive Wizard Mode
The default experience when `sandcastle` is run without arguments in a Git workspace. Guides the user through repository confirmation, pre-flight auth checks, open issue browsing/selection, runner options, and live execution display.

### Headless Mode
Non-interactive CLI execution (e.g. `sandcastle run --repo owner/repo --start 1`) accepting arguments directly for scriptability, scheduled runs, and automated pipelines.

### Antigravity Runner
The dedicated execution driver that spawns isolated Google Antigravity (`agy`) CLI sub-processes with configurable model, timeout, and permission flags.

---

## File Structure

- `src/`: TypeScript source code for the global Sandcastle CLI.
- `sandcastle.ps1`: Legacy PowerShell CLI orchestrator script for headless baton runs.
- `SKILL.md`: Root copy of the Sandcastle agent skill.
- `.agents/skills/sandcastle/`: Discoverable Antigravity skill directory.
- `docs/agents/`: Configuration for Matt Pocock engineering skills (issue tracker, triage labels, domain docs).
- `docs/adr/`: Architecture Decision Records.
- `CONTEXT.md`: This domain context and terminology map.
- `AGENTS.md`: Agent behavior rules and skill mappings.
