# ADR 0002: CLI Flag Semantics and Wizard UX for Sequential Resumption vs Single-Issue Execution

## Status
Accepted

## Context
Sandcastle orchestrates GitHub issue execution through isolated worker sessions. When invoking the CLI or interactive wizard, users need clear mechanisms to distinguish between running a single isolated issue (e.g. for testing a fix) and sequentially resuming the backlog from a specific issue number onward.

Previously, positional arguments defaulted ambiguously to single-issue execution in the CLI while lacking a dedicated flag for sequential resumption. In the wizard, users could only pick "All Ready Issues" or an individual issue without an option to resume from that offset.

## Decision
1. **CLI Flag Semantics (`sandcastle run`)**:
   - Positional `sandcastle run <num>` defaults to sequential backlog resumption starting from `<num>` onward.
   - `-f, --from <num>` provides an explicit alias for backlog resumption starting from `<num>`.
   - `-o, --only <issues...>` runs an isolated single issue or a comma-separated list of cherry-picked issues in specified order (e.g. `--only 42,45`), then halts.
   - `-a, --all` runs all open ready issues from the lowest number onward.
2. **Conflict Resolution & Zero-Argument Handling**:
   - Mutually exclusive flags (e.g. `--from` and `--only`, or positional target with `--only`) immediately exit with code 1 and a descriptive error.
   - In an interactive TTY, invoking `sandcastle run` with zero arguments redirects to the interactive wizard. In non-interactive environments, it exits with code 1 and usage instructions.
3. **Queue Resolution & Safety Gating**:
   - Resumption via `--from <num>` collects all open issues where `number >= <num>`, sorted ascending by issue number. If `<num>` is already closed, it begins at the lowest open issue greater than `<num>`.
   - Parent issues are skipped automatically in queue traversal without blocking the baton.
   - All executions (including `--only`) enforce standard Sandcastle issue gates (`OPEN`, `ready-for-agent`, `AFK`, prerequisite checks).
4. **Interactive Wizard UX (`@clack/prompts`)**:
   - Selecting an individual issue opens a 2-option prompt: *"Run only issue #<num>"* (default) vs *"Resume backlog from #<num> onward"*.
   - Selecting *"All Ready Issues"* advances directly to model selection without an extra prompt.
5. **Telemetry & State Tracking**:
   - `WizardManifest`, `BatonRunnerOptions`, and `BatonRunSnapshot` record the explicit scope `{ type: 'from' | 'only' | 'all', target?: ... }` for unambiguous terminal banners and telemetry files.

## Consequences
- CLI and CI scripts have explicit, non-conflicting flags for both single-issue and sequential runs.
- Interactive users have a safe default in the wizard while retaining one-click access to backlog resumption.
- Telemetry and status displays accurately report whether a run is an isolated test or a sequential backlog sweep.
