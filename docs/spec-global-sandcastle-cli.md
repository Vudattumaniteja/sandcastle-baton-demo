# Spec: Global TypeScript Sandcastle CLI Orchestrator

## Problem Statement

Engineering teams and solo developers using autonomous AI coding agents (such as Google Antigravity `agy`) face severe operational friction when executing multi-issue project backlogs:

1. **Manual Context & Handoff Overhead**: Running agent sessions requires manual issue reading, manual workspace prep, continuous prompting, manual test running, branching, PR opening, and merging.
2. **Context Bleed & Session Degradation**: Running multiple consecutive tasks within a single monolithic LLM session degrades reasoning quality, consumes excessive tokens, and risks cross-task hallucinations.
3. **Platform Inconsistency**: Existing orchestration scripts (such as PowerShell-only scripts) are non-portable across macOS, Linux, and Windows development environments.
4. **Poor Observability & Rate Limit Frustration**: Developers lack an interactive terminal onboarding experience, live progress visualization, and graceful automated pause/recovery when hitting LLM API quota limits (HTTP 429).
5. **Safety & Gating Gaps**: Agents launched without strict precondition checks can pick up blocked or under-specified issues, causing git conflicts, breaking main branches, or wasting tokens.

## Solution

A standalone, cross-platform, global TypeScript CLI (`sandcastle` and `sc`) distributed via npm, npx, and npm link.

- **Interactive Wizard Default**: Running `sandcastle` without arguments in a Git workspace launches a guided TUI wizard powered by `@clack/prompts` that validates repository health, displays backlog issues with color-coded gating badges (`[READY]`, `[WAITING]`, `[BLOCKED]`, `[UNGATED]`), allows dynamic model and reasoning effort selection with live quota indicators, and executes the baton with dynamic multi-phase progress spinners.
- **Scriptable Headless Mode**: Full POSIX CLI subcommands (`sandcastle run`, `sandcastle status`, `sandcastle watch`, `sandcastle doctor`, `sandcastle config`) for programmatic, automated, and scheduled CI/CD or local background operations.
- **Autonomous Worker Contract**: Runs isolated Antigravity (`agy`) CLI subagent sessions sequentially. Each session follows a strict contract (Read -> Minimal Impl -> Verify Tests -> Git Branch & Commit -> Create PR -> Auto-Merge -> Close Issue).
- **Resilient Process Supervision**: Subprocess orchestration powered by `execa` (v9) with `killDescendants: true`, signal traps (`SIGINT`, `SIGTERM`), TTY ANSI color preservation, dual-tier watchdog timeouts, and smart 429 quota pause-and-resume.

## User Stories

1. As a developer running `sandcastle` in my terminal without arguments, I want an interactive guided wizard to launch, so that I can easily configure and run a baton without memorizing CLI flags.
2. As a developer in the interactive wizard, I want my Git repository, current branch, and GitHub auth status validated automatically, so that I am alerted to workspace issues before running any agent.
3. As a developer selecting an issue in the wizard, I want to see color-coded status badges (`[READY]`, `[WAITING]`, `[BLOCKED]`, `[UNGATED]`), so that I immediately know which issues satisfy the Sandcastle baton gates.
4. As a developer selecting an issue, I want blocked issues to display their open blocker prerequisites, so that I understand why an issue cannot yet be executed.
5. As a developer selecting a model, I want to see dynamically discovered Antigravity models along with live quota percentages and reset countdowns, so that I pick the best available model.
6. As a developer configuring a run, I want to choose the reasoning effort (`High [Recommended for AFK]`, `Medium`, `Low`), so that I can balance speed and deep reasoning.
7. As a developer launching a run, I want to review a launch manifest summary card before confirming, so that I can verify all parameters before any agent executes.
8. As a developer observing a run, I want a live multi-phase animated spinner showing current baton stages (Inspecting -> Implementing -> Testing -> Branch & PR -> Merging -> Closing), so that I know exactly what the agent is doing.
9. As a CI engineer, I want to run `sandcastle run 17 --mode afk` in non-interactive environments, so that single issues can be resolved autonomously in headless pipelines.
10. As a developer with a backlog of ready tickets, I want to execute `sandcastle run --all`, so that Sandcastle automatically processes each unblocked ticket sequentially until the queue is empty.
11. As a cautious developer, I want to specify `--mode dry-run`, so that I can inspect the planned execution order and gating evaluations without spawning live agent processes or mutating git/GitHub state.
12. As a developer supervising an agent, I want to specify `--mode supervised`, so that I am prompted to approve branch creation, PR creation, and merge actions.
13. As a developer running a long baton session, I want to run `sandcastle status`, so that I can see a fast snapshot card of active session state, current issue, elapsed time, and retry counts.
14. As a developer tracking live agent progress, I want to run `sandcastle watch` to open an alternate-screen terminal monitor, so that I can view streaming reasoning, tool calls, and token gauges without cluttering my primary terminal history.
15. As a developer onboarding to a new machine, I want to run `sandcastle doctor`, so that I can verify prerequisites including Git, `gh` auth, `agy` CLI, Node.js version, and workspace gate assets (`SKILL.md`, `CONTEXT.md`).
16. As a developer with custom preferences, I want to configure defaults via `sandcastle config set model gemini-2.5-pro` and `.sandcastle/config.json`, so that I do not need to pass flags repeatedly.
17. As a developer experiencing an agent implementation or test failure, I want Sandcastle to retry the task up to 2 times with failure feedback, so that transient agent errors can self-correct.
18. As a developer whose issue repeatedly fails verification, I want Sandcastle to label the issue `status blocked`, post a diagnostic comment to GitHub with error logs, and halt the baton, so that broken code is never merged into the main branch.
19. As a developer who hits an LLM quota rate limit (HTTP 429), I want Sandcastle to pause execution with a live countdown timer until quota reset and resume automatically, so that rate limits do not burn retry attempts.
20. As a developer pressing `Ctrl+C`, I want all background child processes, compilers, test runners, and `agy` agent trees terminated immediately and cleanly, so that orphan processes do not linger in the background.
21. As a developer running on Windows, macOS, or Linux, I want identical CLI behavior, terminal color rendering, and path handling, so that my team enjoys a consistent cross-platform experience.
22. As a developer using `npx`, I want `npx sandcastle` to start instantly with zero runtime dependency downloads, so that I can run Sandcastle in ephemeral environments effortlessly.
23. As a developer with a global install, I want both `sandcastle` and `sc` command aliases available, so that I can type shorter commands during daily development.
24. As a developer writing TypeScript automation scripts, I want to import `{ BatonRunner } from 'sandcastle'`, so that I can programmatically control baton execution in custom workflows.
25. As a repository maintainer, I want every closed baton issue to have an associated merged PR and structured audit log comment, so that repository history remains clean, traceable, and auditable.

## Implementation Decisions

### 1. High-Level Modular Architecture

The Sandcastle CLI is structured into clean separation of concerns:
- **Executable Entrypoint (`src/bin/sandcastle.ts`)**: Shebang-injected entrypoint resolving CLI arguments via `commander` or launching the interactive wizard when invoked without arguments in a TTY.
- **Command Adapters (`src/commands/`)**: Lightweight, thin command adapters (`run.ts`, `wizard.ts`, `status.ts`, `watch.ts`, `doctor.ts`, `config.ts`) that parse inputs and invoke core orchestrators.
- **Core Domain Orchestration (`src/core/`)**: Deep orchestration logic including `BatonRunner` (event-driven sequential state machine), `GatingEvaluator` (verifies `OPEN`, `ready-for-agent`, `AFK`, and blocker closure), `ProcessSupervisor` (handles timeouts, retries, and quota pause/resume), and `TranscriptTailer` (parses active session JSONL logs).
- **Service Adapters with Dependency Injection (`src/services/`)**:
  - `GitHubService`: Interacts with GitHub via `gh` CLI for issues, labels, comments, PRs, and merge operations.
  - `AntigravityService`: Manages local `agy` subagent execution, dynamic model discovery, reasoning effort flags, and quota status.
  - `GitService`: Handles repository preflight, branch creation, commit status, and remote synchronization.
  - `ConfigService`: Resolves hierarchical configuration (CLI flags > `.sandcastle/config.json` > `~/.sandcastle/config.json` > defaults).
- **Presentation & UI (`src/ui/`)**: Reusable terminal UI components using `@clack/prompts` and `picocolors` for wizard flows, snapshot cards, watch monitors, and formatted diagnostic messages.
- **Strict TypeScript Schemas (`src/types/`)**: Domain interfaces, event schemas, config definitions, and transcript parser types.

### 2. Interactive Wizard Flow (Variant A: Linear Guided Wizard)

When executed interactively without arguments, Sandcastle follows the validated Linear Guided Wizard flow:
1. **Banner & Preflight**: Renders logo, version, and verifies Git workspace, active branch, and `gh` authentication.
2. **Issue Selection**: Displays open backlog issues with inline gating badges (`[READY]`, `[WAITING]`, `[BLOCKED]`, `[UNGATED]`) and prerequisite hints.
3. **Model Discovery & Selection**: Queries available models dynamically, displaying quota percentage and reset countdowns.
4. **Reasoning Effort Selection**: Offers `High [Recommended for AFK Coding]`, `Medium`, and `Low` effort options.
5. **Mode Selection**: Allows choosing between `Autonomous AFK`, `Supervised`, and `Dry Run`.
6. **Launch Manifest**: Displays a structured summary note card of all parameters and prompts for final confirmation.
7. **Execution Phase**: Launches the baton with dynamic animated spinners updating across the 6 worker contract phases.

### 3. Execution Engine, Subprocess Management & Signal Safety

- Spawns `agy` CLI subagent processes using `execa` (v9) with `killDescendants: true` ensuring all grandchild processes (Node, Git, test runners, compilers) are reliably killed across Windows, macOS, and Linux.
- Injects `FORCE_COLOR: '3'` and `COLORTERM: 'truecolor'` in the child environment to preserve ANSI formatting during live streaming.
- Central signal registry traps `SIGINT`, `SIGTERM`, and `SIGHUP` to trigger graceful termination (`AbortController`) with a 5-second escalation window before hard termination, always restoring terminal cursor visibility (`\x1b[?25h`) and exiting alternate screen buffers.
- Dual-tier timeout enforcement: Passes `--print-timeout` to the inner `agy` process alongside an outer watchdog timer in `ProcessSupervisor`.

### 4. Failure, Retry & Quota Handling

- **Code / Verification Failures**: Up to 2 retries per issue. On failure, error details are fed back into the next attempt prompt. If retries are exhausted, the issue is labeled `status blocked`, a diagnostic comment is posted to GitHub, and the orchestrator halts with exit code 2.
- **Quota Limits (HTTP 429)**: Quota errors are detected as infrastructure events (zero retry penalty). The orchestrator enters an auto-pause state displaying a live countdown timer and resumes automatically upon quota refresh.

### 5. Packaging, Binary Aliasing & Zero-Dependency Distribution

- Registers dual binary entrypoints `sandcastle` and `sc` in `package.json["bin"]`.
- Bundled with `tsup` using `noExternal: [/.*/]` to produce a single self-contained pure ESM executable (`dist/bin/sandcastle.js`) with zero runtime `node_modules` overhead, ensuring instant `npx` execution.
- Emits dual targets: CLI standalone executable (`dist/bin/sandcastle.js`) and typed programmatic library (`dist/index.js` + `dist/index.d.ts`).
- Compile-time version injection via `define: { __SANDCASTLE_VERSION__: JSON.stringify(pkg.version) }` eliminates runtime `package.json` disk reads for `--version`.
- Automated prepack verification script (`npm run build:verify`) validates LF shebang formatting, `--help`, and `--version` smoke tests.

## Testing Decisions

### What Makes a Good Test

Tests must verify external observable behaviors, exit codes, state transitions, and contract adherence rather than private implementation details. Tests should run reliably in CI without requiring live GitHub API tokens or running billable LLM agent sessions.

### Seams and Test Strategy

- **Primary Seam (Highest Seam - CLI & Baton Orchestrator)**:
  - Test `sandcastle run`, `sandcastle status`, `sandcastle doctor`, and `sandcastle config` by injecting mock service adapters (`MockGitHubService`, `MockAntigravityService`, `MockGitService`, and in-memory file systems).
  - Verify complete lifecycle state transitions: issue evaluation -> worker invocation -> PR creation -> auto-merge -> issue close.
- **Gating Evaluator Seam**:
  - Unit test issue gating rules against synthetic issue dependency graphs (unblocked issues, issues with missing `ready-for-agent`/`AFK` labels, issues blocked by open prerequisites).
- **Process Supervisor & Signal Seam**:
  - Test subprocess watchdog timeouts, retry limit enforcement, 429 quota pause/resume logic, and clean signal termination (`SIGINT` process tree cleanup).
- **Build & Packaging Seam**:
  - Smoke test bundled binaries for valid LF shebang headers, executable permissions, `--version`, and `--help` exit codes.

### Prior Art

- Legacy `sandcastle.ps1` end-to-end baton workflow tests.
- Standard Node.js CLI testing practices utilizing Vitest, mock streams, and temporary Git test fixtures.

## Out of Scope

- Multi-agent runners outside Google Antigravity (e.g. Claude Code, bespoke Python agent harnesses).
- Desktop GUI applications (Electron or Tauri).
- Multi-tenant cloud orchestration servers or remote webhook receivers.
- Native OS audio / desktop notification daemons (deferred to future minor releases).

## Further Notes

- Supersedes the legacy PowerShell orchestrator (`sandcastle.ps1`), providing a unified cross-platform toolchain.
- Implements the validated architectural decisions from Wayfinder Map #16, Prototype #17, Research #18, Grilling #19, and Packaging #20.
