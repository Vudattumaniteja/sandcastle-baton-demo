# Sandcastle

**Autonomous, sequential GitHub issue baton orchestrator for AI coding agents.**

Sandcastle eliminates context degradation by enforcing a **single-issue context boundary**: each issue is assigned to an isolated worker session with a clean context window, verified against project tests, committed, merged via Pull Request, and closed before passing the baton to the next issue.

---

## The Problem: Context Degradation

When an AI coding agent attempts to work through a multi-issue backlog in a single persistent session:
- **Token Degradation**: Context windows bloat, increasing cost and response latency.
- **Hallucinations & Drift**: Early requirements and test outputs pollute reasoning for subsequent tasks.
- **Regression Risk**: Cumulative untracked side effects accumulate across issues.

### The Sandcastle Solution: The Sequential Baton

```mermaid
sequenceDiagram
    autonumber
    participant Coord as Baton Orchestrator
    participant Gate as Issue Gate Evaluator
    participant GH as GitHub API / CLI
    participant Worker as Fresh AI Worker Session
    
    Coord->>GH: Fetch open issues in backlog
    Coord->>Gate: Evaluate issue readiness
    Note over Gate: Checks: OPEN + ready-for-agent + AFK + dependencies closed
    Gate-->>Coord: Issue #N Approved
    Coord->>Worker: Spawn worker with clean context
    Worker->>GH: Inspect issue & comments
    Worker->>Worker: Minimal implementation & local tests
    Worker->>GH: Branch, commit, open PR & auto-merge
    Worker->>GH: Close issue #N
    Worker-->>Coord: Handoff baton (Worker session terminates)
    Coord->>Gate: Evaluate issue #(N+1)...
```

---

## Quick Start

### 1. Global CLI (Interactive Wizard)

Run `sandcastle` or `sc` in any Git repository:

```bash
# Launch interactive terminal wizard
sandcastle
```

The wizard guides you through pre-flight environment checks, open issue selection, model and reasoning settings, and live execution.

### 2. Headless CLI Execution

Execute specific issues or entire backlogs in non-interactive or CI environments:

```bash
# Run all open ready issues in backlog
sandcastle run --all

# Resume backlog starting from issue 10 onward
sandcastle run 10
sandcastle run --from 10

# Process only issue 10 in isolation
sandcastle run --only 10

# Run with specific model and reasoning effort
sandcastle run --all --model "Gemini 3.8 Flash" --effort high

# Headless JSON output for pipeline automation
sandcastle run 10 --json
```

### 3. Antigravity Skill (In-Session Subagent Orchestrator)

Inside an active Google Antigravity session (CLI, IDE, or App), trigger the baton directly:

```text
Use sandcastle on owner/repo starting at issue #10
```

The coordinator agent will spawn isolated subagents (`invoke_subagent`) for each issue sequentially.

---

## Global CLI Reference (`sandcastle` / `sc`)

| Command | Description |
| :--- | :--- |
| `sandcastle wizard` (or bare `sandcastle`) | Interactive terminal wizard for guided baton orchestration. |
| `sandcastle run [issue]` | Run headless baton loop (`--all`, `--from`, `--only`, `--model`, `--effort`, `--timeout`, `--retries`, `--auto-pr`, `--auto-merge`, `--json`). |
| `sandcastle watch` | Live alternate-screen terminal monitor streaming agent transcripts and progress. |
| `sandcastle status` | Display status snapshot of current or latest baton execution (`--json`). |
| `sandcastle doctor` | Validate workspace health, toolchain (`gh`, `git`, `agy`, Node), and auth. |
| `sandcastle config` | Manage 3-tier configuration (`get`, `set`, `list`). |
| `sandcastle update` | Check for updates and synchronize verification skills (`--check`, `--ci`, `--force`). |

---

## Baton Gating & Safety

Sandcastle protects your codebase by strictly evaluating issue prerequisites before launching a worker:

1. **State Gate**: Issue must be `OPEN`.
2. **Specification Gate**: Must have the `ready-for-agent` label.
3. **Authorization Gate**: Must have the `AFK` (or `afk`) label.
4. **Dependency Gate**: All prerequisite blockers (`Blocked by #N` or GitHub sub-issues) must be `CLOSED`.

### Blocker Protocol
If a worker encounters failing tests, ambiguous specifications, or missing credentials:
1. It applies the `status blocked` label.
2. It posts a diagnostic comment with logs and required human intervention.
3. **Execution halts immediately** — the baton will never push forward in a broken state.

---

## The Worker Contract

Every isolated worker session follows a strict 7-phase contract:

1. **Orient & Inspect**: Read issue body, comments, and project architecture (`gh issue view <N> --comments`).
2. **Minimal Implementation**: Implement only the changes strictly needed for the issue requirements test-first.
3. **Local Verification**: Run project test suites, typechecks, and linters until green.
4. **Branch & Commit**: Create feature branch `issue-<N>-<slug>` and conventional commit referencing `#<N>`.
5. **Pull Request**: Push branch and create PR (`gh pr create`).
6. **Merge**: Auto-merge PR (`gh pr merge --merge`).
7. **Close & Sync**: Close issue with audit summary (`gh issue close <N>`) and sync local `main`.

---

## Documentation

- [**User Guide**](docs/user-guide.md): Complete installation, interactive wizard walkthrough, CLI command reference, configuration tiers, and doctor checks.
- [**Architecture Guide**](docs/architecture.md): Deep dive into the `BatonRunner` state machine, gating evaluator, process supervisor, and Antigravity interop.
- [**Agent Guidelines (`AGENTS.md`)**](AGENTS.md): Authoritative agent execution instructions and skills.
- [**Domain Context (`CONTEXT.md`)**](CONTEXT.md): Domain terminology and concepts.
- [**Architecture Decision Records (`docs/adr/`)**](docs/adr/): Recorded design decisions.
