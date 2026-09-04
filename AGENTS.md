# Agent Guidelines for Sandcastle

Sandcastle is an autonomous, sequential GitHub issue baton orchestrator for AI coding agents.

## Core Documentation

- **System Architecture**: System overview, 7-phase worker contract, gating engine, supervisor, and Antigravity interop. See [`docs/architecture.md`](docs/architecture.md).
- **User & CLI Guide**: Installation, interactive wizard, command reference, flags, and configuration. See [`docs/user-guide.md`](docs/user-guide.md).
- **Domain Context & Glossary**: Single-context domain layout, modules, and terminology. See [`CONTEXT.md`](CONTEXT.md).
- **Architectural Decision Records**: Key design history. See [`docs/adr/`](docs/adr/).

---

## The 7-Phase Worker Contract

When assigned an issue, subagents must follow the authoritative 7-phase contract:

1. **Inspect**: Read the issue description, acceptance criteria, and repo state.
2. **Implement**: Use the `implement` and `tdd` skills. Write minimal, clean code satisfying the acceptance criteria test-first.
3. **Verify**: Run `npm test` and ensure 100% passing tests. Fix regressions immediately.
4. **Commit**: Stage all files and commit with Conventional Commits referencing the issue.
5. **Pull Request**: Push branch to remote and create PR via `gh pr create`.
6. **Merge**: Merge PR via `gh pr merge --merge`.
7. **Close**: Confirm issue is closed.

---

## Coding and Tooling Standards

- **Core CLI**: Cross-platform TypeScript CLI (`sandcastle` / `sc`). `sandcastle.ps1` is legacy fallback.
- **Agent Interop**: Google Antigravity (`agy`) CLI sub-processes with model resolution and quota tracking.
- **Git & GitHub Operations**: Use official `gh` CLI commands (`gh issue`, `gh pr`).
- **Safety First**: Never bypass permissions or run destructive git operations unless running in authorized AFK worker mode.
