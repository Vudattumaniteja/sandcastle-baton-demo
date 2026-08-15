# Google Antigravity Interoperability Protocol

This guide specifies how Sandcastle interfaces with Google Antigravity (`agy` CLI and agent subagent architectures), including model normalization, quota pool tracking, and execution patterns.

---

## Overview

Sandcastle integrates with Google Antigravity through two primary execution patterns:
1. **In-Session Subagent Baton**: Orchestrated by a parent agent session inside Antigravity using `invoke_subagent` and [`SKILL.md`](file:///C:/Users/Manit/Desktop/sandcastle/SKILL.md).
2. **Headless CLI Worker Engine**: Driven externally by the TypeScript CLI ([`src/services/antigravity-service.ts`](file:///C:/Users/Manit/Desktop/sandcastle/src/services/antigravity-service.ts)), which spawns isolated `agy` CLI sub-processes.

---

## 1. Dual Execution Patterns

```mermaid
flowchart TD
    subgraph Pattern A: In-Session Subagent Orchestrator
        P["Parent Antigravity Agent"] -->|1. Evaluates Issue Gates| G1["GitHub API (`gh`)"]
        P -->|2. `invoke_subagent`| W1["Worker Subagent (Issue #1)"]
        W1 -->|3. Executes Worker Contract| G1
        W1 -->|4. PR Merged & Closed| P
        P -->|5. `invoke_subagent`| W2["Fresh Worker Subagent (Issue #2)"]
    end

    subgraph Pattern B: Headless CLI Process Engine
        CLI["`sandcastle run` (Node.js)"] -->|Spawns isolated process| AGY["`agy --prompt ... --model ...`"]
        AGY -->|Executes Worker Contract| G2["GitHub API (`gh`)"]
        AGY -->|Process Exits 0| CLI
        CLI -->|Spawns next process| AGY2["`agy (Issue #2)`"]
    end
```

### Pattern A: In-Session Subagent Baton (`invoke_subagent`)

When Sandcastle runs inside an active interactive Antigravity session (CLI, App, or IDE extension):
- The active agent assumes the role of **Baton Coordinator**.
- For each unblocked issue, the coordinator invokes a fresh subagent:
  ```json
  {
    "TypeName": "self",
    "Role": "Sandcastle Worker - Issue #<N>",
    "Prompt": "You are the Sandcastle Worker for Issue #<N> on repository <repo>.\nStrictly follow the Sandcastle Worker Contract: read issue, implement minimal solution, verify tests, commit, PR, merge, and close."
  }
  ```
- **Context Isolation**: Each subagent gets a pristine context window. The parent coordinator maintains high-level state without ingesting source file diffs or compilation outputs into its own conversation window.

### Pattern B: Headless CLI Worker Engine (`sandcastle run`)

When Sandcastle executes from the terminal or in CI pipelines:
- `AntigravityService` builds typed CLI arguments and spawns child `agy` processes via `execa` ([`src/services/antigravity-service.ts`](file:///C:/Users/Manit/Desktop/sandcastle/src/services/antigravity-service.ts)):
  ```bash
  agy --dangerously-skip-permissions \
      --print-timeout 30m \
      --model "Gemini 3.7 Flash (High)" \
      --prompt "Use sandcastle skill. Repository: <repo> Issue: #<N>..."
  ```
- `ProcessSupervisor` monitors the child process tree with `killDescendants: true`, enforcing watchdog timeouts and handling automatic retries.

---

## 2. Model Resolution & Effort Formatting (`resolveAgyModel`)

Antigravity CLI commands require precise model identifiers with embedded reasoning effort indicators. The helper function `resolveAgyModel` ([`src/services/antigravity-service.ts`](file:///C:/Users/Manit/Desktop/sandcastle/src/services/antigravity-service.ts)) resolves user shorthand, aliases, and effort levels into canonical model strings:

| User Input / Alias | Effort | Canonical Antigravity Model String |
| :--- | :--- | :--- |
| `""` *(omitted)* | `high` | `Gemini 3.7 Flash (High)` |
| `""` *(omitted)* | `medium` | `Gemini 3.7 Flash (Medium)` |
| `""` *(omitted)* | `low` | `Gemini 3.7 Flash (Low)` |
| `flash`, `3.7-flash` | `high` | `Gemini 3.7 Flash (High)` |
| `pro`, `3.1-pro` | `high` | `Gemini 3.1 Pro (High)` |
| `pro`, `3.1-pro` | `low` | `Gemini 3.1 Pro (Low)` |
| `sonnet`, `claude-sonnet` | Any | `Claude Sonnet 4.6 (Thinking)` |
| `opus`, `claude-opus` | Any | `Claude Opus 4.6 (Thinking)` |
| `gpt-oss`, `120b` | Any | `GPT-OSS 120B (Medium)` |

```typescript
import { resolveAgyModel } from 'sandcastle';

// Examples
resolveAgyModel('flash', 'high');    // => 'Gemini 3.7 Flash (High)'
resolveAgyModel('pro', 'low');        // => 'Gemini 3.1 Pro (Low)'
resolveAgyModel('sonnet');            // => 'Claude Sonnet 4.6 (Thinking)'
```

---

## 3. Live Quota Pool Tracking (`last_statusline_input.json`)

Antigravity maintains real-time rate limit and token quota telemetry in `last_statusline_input.json` within its application directory:

### Candidate Discovery Paths
1. `process.env.GEMINI_APP_DIR/last_statusline_input.json`
2. `~/.gemini/antigravity-cli/last_statusline_input.json`
3. `~/.gemini/antigravity/last_statusline_input.json`
4. `~/.antigravity/last_statusline_input.json`

### Telemetry Payload Structure

```json
{
  "quota": {
    "gemini-5h": {
      "remaining_fraction": 0.84,
      "reset_in_seconds": 2520
    },
    "3p-5h": {
      "remaining_fraction": 0.45,
      "reset_in_seconds": 1080
    }
  },
  "current_model": "Gemini 3.7 Flash (High)"
}
```

### Quota Pool Mapping:
- **Gemini Models** (`Gemini 3.7 Flash`, `Gemini 3.1 Pro`, `3.6 Flash`, `3.5 Flash`): Mapped to `gemini-5h` or `gemini-weekly` pool.
- **Third-Party Models** (`Claude Sonnet`, `Claude Opus`, `GPT-OSS`): Mapped to `3p-5h` or `3p-weekly` pool.

The Sandcastle interactive wizard and live watch monitor read this file to display live badge indicators (e.g. `[84% quota] (Resets in 42m)`).

---

## Context Pointers & Related Documentation

| Document | Description | Reached When |
| :--- | :--- | :--- |
| [SKILL.md](file:///C:/Users/Manit/Desktop/sandcastle/SKILL.md) | Agent skill definition for in-session Antigravity baton execution. | Invoking Sandcastle as a native agent skill. |
| [worker-contract.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/agents/worker-contract.md) | Specification of the 7-phase contract executed by Antigravity workers. | Reviewing worker execution rules. |
| [interactive-wizard.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/user/interactive-wizard.md) | How the wizard displays discovered Antigravity models and quotas. | Using the interactive terminal wizard. |
| [configuration.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/user/configuration.md) | Persisting default Antigravity models and reasoning effort settings. | Configuring model defaults permanently. |
