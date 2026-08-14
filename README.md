# Sandcastle

Autonomous, sequential GitHub issue baton orchestrator for AI coding agents (Google Antigravity `agy`, Claude Code, and subagent architectures).

Sandcastle enforces a single-issue context boundary: each issue is assigned to an isolated worker session with a clean context window, verified with tests, committed, merged via PR, and closed before handing the baton off to the next issue.

## Features

- **Isolated Sessions**: Eliminates context bloat and token degradation across long backlog runs.
- **Strict Gating**: Protects repositories by executing only issues verified with `ready-for-agent` and `AFK` labels.
- **Automated PR & Merge Lifecycle**: Creates feature branches, commits with issue references, opens PRs, merges when green, and closes issues.
- **Dual Execution Modes**:
  - **In-Session Subagent Orchestrator**: Runs natively inside Antigravity via `invoke_subagent`.
  - **Headless CLI Loop (`sandcastle.ps1`)**: Runs unattended terminal workflows using `agy`.
- **Blocker Safety**: Automatically halts and comments diagnostic logs when gates or verification tests fail.

## Quick Start

### 1. Headless CLI Baton
```powershell
.\sandcastle.ps1 -Repo "owner/repo" -StartIssue 1
```

### 2. Antigravity Skill
Inside an Antigravity session, simply prompt:
```text
Use sandcastle on owner/repo starting at issue #1
```

## Documentation & Architecture

- [`CONTEXT.md`](./CONTEXT.md): Domain glossary and conceptual architecture.
- [`AGENTS.md`](./AGENTS.md): Agent guidelines and Matt Pocock engineering skills configuration.
- [`docs/agents/`](./docs/agents/): Issue tracker, triage labels, and domain configuration.
- [`docs/adr/`](./docs/adr/): Architecture Decision Records.
- [`SESSION_SUMMARY.md`](./SESSION_SUMMARY.md): Benchmark report and 4-issue demonstration run.
