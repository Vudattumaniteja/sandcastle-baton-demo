# Agent Guidelines for Sandcastle

Sandcastle is an autonomous, sequential GitHub issue baton orchestrator for AI coding agents.

## Agent skills

### Issue tracker

Issues and backlog tickets are tracked in GitHub Issues via `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Standard five canonical triage roles plus Sandcastle baton gates (`ready-for-agent`, `AFK`, `status blocked`, `sandcastle`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`CONTEXT.md` + `docs/adr/`). See `docs/agents/domain.md`.

---

## Coding and Tooling Standards

- **Core Scripting**: PowerShell Core (`sandcastle.ps1`) for CLI orchestration.
- **Agent Interop**: Google Antigravity (`agy`) CLI and subagent protocols.
- **Git & GitHub Operations**: Use official `gh` CLI commands (`gh issue`, `gh pr`).
- **Safety First**: Never bypass permissions or run destructive git operations unless running in authorized AFK worker mode.
