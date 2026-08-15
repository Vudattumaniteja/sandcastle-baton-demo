# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (standard for Sandcastle):

```
/
├── CONTEXT.md
├── AGENTS.md
├── SKILL.md
├── docs/adr/
│   └── 0001-powershell-and-subagent-baton-architecture.md
├── docs/user/
│   ├── getting-started.md
│   ├── interactive-wizard.md
│   ├── cli-reference.md
│   └── configuration.md
├── docs/agents/
│   ├── domain.md
│   ├── worker-contract.md
│   ├── antigravity-interop.md
│   ├── issue-authoring.md
│   ├── issue-tracker.md
│   └── triage-labels.md
├── .agents/skills/sandcastle/
└── src/
```

## Context Pointers

| Guide | Description | Reached When |
| :--- | :--- | :--- |
| [getting-started.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/user/getting-started.md) | Quickstart, prerequisites, install, doctor. | Setting up Sandcastle environment. |
| [interactive-wizard.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/user/interactive-wizard.md) | Clack-powered TUI wizard, badges, quota indicators, spinners. | Running interactive terminal workflows. |
| [cli-reference.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/user/cli-reference.md) | Subcommands, options, exit codes, JSON schemas. | Automating headless baton executions. |
| [configuration.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/user/configuration.md) | 4-tier configuration hierarchy and settings. | Persisting global or local configuration. |
| [worker-contract.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/agents/worker-contract.md) | Authoritative 7-phase worker lifecycle & blocker protocol. | Executing or auditing worker agent runs. |
| [antigravity-interop.md](file:///C:/Users/Manit/Desktop/sandcastle/docs/agents/antigravity-interop.md) | Antigravity CLI, subagents, model resolution, quota pools. | Interfacing with Google Antigravity runtime. |

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0001 (powershell-and-subagent-baton-architecture) — but worth reopening because…_
