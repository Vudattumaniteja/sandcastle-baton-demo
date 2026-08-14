# ADR 0001: PowerShell CLI and Antigravity Subagent Baton Architecture

## Status
Accepted

## Context
When executing multi-issue development workflows, monolithic agent context windows suffer from progressive degradation ("context bloat", token exhaustion, regression of early requirements).
To solve this, Sandcastle introduces an isolated sequential baton model: each issue is assigned to an isolated worker session with a clean context window.

## Decision
1. Provide a dual-mode execution strategy:
   - **Mode A (In-Session)**: Orchestrator agent spawns fresh subagents (`invoke_subagent`) per issue.
   - **Mode B (Headless CLI)**: Standalone PowerShell orchestrator (`sandcastle.ps1`) executing `agy` subprocesses per issue.
2. Enforce strict gate labels (`ready-for-agent` + `AFK`) before executing any issue.
3. Halt the baton immediately upon encountering `status blocked` or test verification failure.

## Consequences
- Issues must be clearly specified and labeled prior to baton execution.
- Context is guaranteed fresh for every issue.
- Eliminates cross-issue pollution and context degradation.
