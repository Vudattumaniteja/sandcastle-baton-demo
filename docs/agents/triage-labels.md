# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

## Sandcastle Autonomous Baton Labels

| Label in our tracker | Meaning / Gating Condition                                                       |
| -------------------- | -------------------------------------------------------------------------------- |
| `AFK` / `afk`        | Authorized for unattended, autonomous execution by background agent orchestrator |
| `status blocked`     | Hard halt: execution encountered a blocker or failing gate; requires human review|
| `sandcastle`         | Managed under the Sandcastle autonomous issue baton                              |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.
