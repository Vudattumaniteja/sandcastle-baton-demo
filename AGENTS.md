# Agent Guidelines for Sandcastle

Sandcastle is an autonomous, sequential GitHub issue baton orchestrator for AI coding agents.

## Agent skills

### Worker contract & execution lifecycle

Authoritative 7-phase lifecycle (Inspect -> Implement -> Verify -> Commit -> PR -> Merge -> Close) and blocker protocol. See [`docs/agents/worker-contract.md`](file:///C:/Users/Manit/Desktop/sandcastle/docs/agents/worker-contract.md).

### Antigravity interop & model resolution

Google Antigravity (`agy`) CLI sub-processes, in-session subagents, model resolution, and quota tracking. See [`docs/agents/antigravity-interop.md`](file:///C:/Users/Manit/Desktop/sandcastle/docs/agents/antigravity-interop.md).

### Issue tracker

Issues and backlog tickets are tracked in GitHub Issues via `gh` CLI. See [`docs/agents/issue-tracker.md`](file:///C:/Users/Manit/Desktop/sandcastle/docs/agents/issue-tracker.md).

### Issue authoring & baton workflow

Author atomic issues, configure checkable acceptance criteria, and manage gating labels. See [`docs/agents/issue-authoring.md`](file:///C:/Users/Manit/Desktop/sandcastle/docs/agents/issue-authoring.md).

### Triage labels

Standard five canonical triage roles plus Sandcastle baton gates (`ready-for-agent`, `AFK`, `status blocked`, `sandcastle`). See [`docs/agents/triage-labels.md`](file:///C:/Users/Manit/Desktop/sandcastle/docs/agents/triage-labels.md).

### User & operator documentation

- [Getting Started Guide](file:///C:/Users/Manit/Desktop/sandcastle/docs/user/getting-started.md)
- [Interactive Wizard Guide](file:///C:/Users/Manit/Desktop/sandcastle/docs/user/interactive-wizard.md)
- [CLI Reference Manual](file:///C:/Users/Manit/Desktop/sandcastle/docs/user/cli-reference.md)
- [Configuration Guide](file:///C:/Users/Manit/Desktop/sandcastle/docs/user/configuration.md)

### Domain docs

Single-context layout ([`CONTEXT.md`](file:///C:/Users/Manit/Desktop/sandcastle/CONTEXT.md) + [`docs/adr/`](file:///C:/Users/Manit/Desktop/sandcastle/docs/adr/)). See [`docs/agents/domain.md`](file:///C:/Users/Manit/Desktop/sandcastle/docs/agents/domain.md).

---

## Coding and Tooling Standards

- **Core CLI**: Cross-platform TypeScript CLI (`sandcastle` / `sc`) and legacy PowerShell Core script (`sandcastle.ps1`).
- **Agent Interop**: Google Antigravity (`agy`) CLI and subagent protocols.
- **Git & GitHub Operations**: Use official `gh` CLI commands (`gh issue`, `gh pr`).
- **Safety First**: Never bypass permissions or run destructive git operations unless running in authorized AFK worker mode.
