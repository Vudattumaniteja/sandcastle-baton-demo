# Sandcastle Architecture

Sandcastle is an autonomous, sequential GitHub issue baton orchestrator for AI coding agents. This document details the internal domain design, state machine, safety gating, process supervision, and Antigravity interop.

---

## 1. System Overview

Sandcastle orchestrates isolated, per-issue worker sessions. Each issue is processed through a strict 7-phase contract, verified against tests, merged into git, and handed off to the next issue.

```
                  ┌──────────────────────────────┐
                  │    Entrypoints (CLI / TUI)   │
                  │   sandcastle run / wizard    │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │        BatonRunner           │
                  │  (Event-Driven State Machine)│
                  └──────┬───────────────┬───────┘
                         │               │
       Gating Evaluation │               │ Worker Execution
                         ▼               ▼
         ┌─────────────────────┐   ┌───────────────────────────┐
         │   GatingEvaluator   │   │     ProcessSupervisor     │
         │  (Safety & Epics)   │   │  (Watchdogs, Retries, 429)│
         └─────────────────────┘   └─────────────┬─────────────┘
                                                 │
                                                 ▼
                                   ┌───────────────────────────┐
                                   │    AntigravityService     │
                                   │    (Isolated agy worker)  │
                                   └───────────────────────────┘
```

---

## 2. The 7-Phase Worker Lifecycle

Every issue worker runs inside an isolated Google Antigravity session. The worker is bound to the repository via `--add-dir` and follows this authoritative contract:

1. **Phase 1: Inspect**: Read the GitHub issue title, body, and acceptance criteria. Check existing repository code and tests to confirm the current state.
2. **Phase 2: Implement**: Use the `implement` and `tdd` skills. Write minimal, clean code satisfying the acceptance criteria test-first. Keep changes tightly focused on the issue.
3. **Phase 3: Verify**: Run the full test suite (`npm test`, `vitest run`). Confirm 100% green tests. Fix any regressions immediately.
4. **Phase 4: Commit**: Stage all modified and new files. Write a descriptive commit message following Conventional Commits format referencing the issue (e.g. `feat(core): add feature (#42)`).
5. **Phase 5: Pull Request**: Push branch to remote and create pull request via `gh pr create`.
6. **Phase 6: Merge**: Merge the pull request via `gh pr merge --merge` (or squash/rebase per repo rules).
7. **Phase 7: Close**: Confirm issue is marked closed. Add a brief closing summary comment if needed.

---

## 3. Core Domain Orchestration

### `BatonRunner` (`src/core/baton-runner.ts`)
The `BatonRunner` is an `EventEmitter` state machine that drives sequential queue traversal. It emits strongly typed events throughout execution:

| Event | Payload | Trigger |
| :--- | :--- | :--- |
| `baton:start` | `{ repo, mode, issues, scope, model }` | Execution queue resolved and ready. |
| `baton:gating` | `{ issueNumber, evaluation }` | Gate conditions evaluated for an issue. |
| `worker:start` | `{ issueNumber, title, attempt, maxAttempts }` | Worker process launched for an issue. |
| `worker:phase` | `{ issueNumber, phase, message }` | Phase transition during run (dry-run or live). |
| `worker:retry` | `{ issueNumber, attempt, maxAttempts, error }` | Worker attempt failed; retrying. |
| `worker:complete` | `{ issueNumber, durationMs }` | Issue verified, merged, and closed. |
| `baton:handoff` | `BatonHandoffPayload` | Emitted between issues with transition pacing. |
| `baton:blocked` | `{ issueNumber, reason, evidence }` | Gate or verification failure; baton halted. |
| `baton:finish` | `BatonFinishPayload` | All issues completed or stopped on blocker. |

### Handoff Transition & Pacing Controller (`src/ui/handoff-transition.ts`)
Between completed issues, `BatonRunner` emits `'baton:handoff'` containing:
- Completed issue metrics (duration, PR number, tokens, branch).
- Next issue preview (gating status, labels, parent info, acceptance criteria).

If interactive pacing is enabled, Sandcastle displays a visual countdown banner (default 3 seconds) with hotkey controls:
- `Space` or `Enter`: Skip countdown and advance immediately.
- `s`: Skip next issue without executing.
- `a`, `q`, or `Ctrl+C`: Abort baton run safely.

---

## 4. Gating & Safety Engine (`src/core/gating-evaluator.ts`)

Sandcastle never executes an issue unless all safety preconditions are met.

### Gating Statuses

| Status | Condition | Action |
| :--- | :--- | :--- |
| `READY` | Issue is `OPEN`, labeled `ready-for-agent` and `AFK`, and has no open blockers. | Proceed with execution. |
| `PARENT` | Issue has parent/epic label (`parent`, `epic`, `wayfinder:map`). | Skipped in queue unless expanded with `--expand-children`. |
| `HITL` | Issue requires human intervention (`wayfinder:grilling`, `wayfinder:prototype`). | Skipped in queue. |
| `BLOCKED` | Issue has label `status blocked`. | Halts baton; blocker protocol activated. |
| `WAITING` | Issue lists prerequisite dependencies (`Blocked by #N`) that are still open. | Halts baton until prerequisites close. |
| `UNGATED` | Issue is missing `ready-for-agent` or `AFK` labels. | Halts baton. |
| `CLOSED` | Issue is already closed. | Skipped in queue. |

### Dependency & Parent Issue Syntax
- **Prerequisites**: `Blocked by: #12`, `Depends on #13`, `Prerequisites: #14, #15`.
- **Parent / Epics**: `Part of #40`, `Parent: #41`, `Parent Issue: #42`, `Epic: #43`.

---

## 5. Process Supervisor (`src/core/process-supervisor.ts`)

Subprocesses are managed by `ProcessSupervisor` with strict signal safety, retry policies, and watchdog timeouts.

### Subprocess Safety
- **Orchestration**: Powered by `execa` v9 with `killDescendants: true`.
- **Signal Trapping**: Intercepts `SIGINT` and `SIGTERM`. Flushes terminal buffers and restores cursor visibility (`\x1b[?25h`). If the child process does not exit within a 5-second grace period, force-kills the process tree.
- **Dual-Tier Watchdogs**: Watches both Antigravity's internal print timeout (`--print-timeout 30m`) and an outer supervisor timer.

### Quota Detection & Auto-Pause
- Evaluates exit codes and output for HTTP 429 and rate-limiting patterns.
- When quota exhaustion is detected, the supervisor pauses without burning retry attempts.
- Normalizes reset timestamps using time-decay calculations from `last_statusline_input.json`.
- Resumes execution automatically once quota is restored.

---

## 6. Antigravity CLI Interop (`src/services/antigravity-service.ts`)

Sandcastle drives Google Antigravity via its CLI (`agy`):

```bash
agy \
  --dangerously-skip-permissions \
  --print-timeout 30m \
  --model "Gemini 3.8 Flash (High)" \
  --prompt "<interpolated worker prompt>" \
  --add-dir "/path/to/project"
```

### Model Normalization
Model identifiers and aliases are normalized into recognized Antigravity models:
- Default: `Gemini 3.8 Flash (High)` (aliases: `3.8-flash`, `gemini-3.8-flash`, `default`).
- Flash: `Gemini 3.7 Flash (High)` (aliases: `3.7-flash`, `flash`).
- Pro: `Gemini 3.1 Pro (High)` (aliases: `3.1-pro`, `pro`).
- Third-Party: `Claude Sonnet 4.6 (Thinking)`, `Claude Opus 4.6 (Thinking)`, `GPT-OSS 120B (Medium)`.
