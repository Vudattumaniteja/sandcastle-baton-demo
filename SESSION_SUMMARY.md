# Sandcastle Baton Orchestration on Google Antigravity: Session Report

**Date:** August 14, 2026  
**Target Repository:** [`Vudattumaniteja/sandcastle-baton-demo`](https://github.com/Vudattumaniteja/sandcastle-baton-demo)  
**Status:** Completed (100% Success Across 4/4 Issues)

---

## 1. Executive Summary & Objective

The objective of this session was to:
1. Locate the **Sandcastle** sequential issue-baton skill on the local filesystem.
2. Adapt the skill from OpenAI Codex's `create_thread` model to **Google Antigravity** (`agy`).
3. Build a PowerShell orchestrator (`sandcastle.ps1`) to run unattended sequential issue batons in isolated sessions.
4. Create a testbed repository and backlog of 4 connected, progressively complex issues.
5. Run the full autonomous loop, verifying that Antigravity successfully implements, tests, creates PRs, merges them, closes issues, and advances to subsequent issues without human intervention.

---

## 2. Skill Discovery & Antigravity Adaptation

### Discovery
The original skill was located in `C:\Users\Manit\.skills-backup\sandcastle\SKILL.md`. In Codex, Sandcastle relied on the `create_thread` tool to start clean context windows for every issue.

### Antigravity Adaptation
In Google Antigravity, we established two execution models:

1. **In-Session Subagent Orchestrator (`invoke_subagent`)**:
   - The parent agent coordinates the backlog.
   - For each issue, it spawns an isolated subagent worker (`TypeName: "self"`) with its own conversation ID and clean context window.
   - When the subagent finishes and closes the issue, the coordinator spawns a brand new subagent for the next issue.
2. **Headless CLI Loop (`sandcastle.ps1`)**:
   - Executes each issue in a standalone Antigravity CLI process:
     ```powershell
     agy --dangerously-skip-permissions --print-timeout 30m --prompt "..."
     ```
   - Automatically checks GitHub gates, monitors exit codes, verifies issue closure on GitHub, and advances.

### Files Created for the Skill:
- [`.agents/skills/sandcastle/SKILL.md`](file:///C:/Users/Manit/Desktop/sandcastle/.agents/skills/sandcastle/SKILL.md) (Standard workspace discovery)
- [`SKILL.md`](file:///C:/Users/Manit/Desktop/sandcastle/SKILL.md) (Root copy)
- [`.agents/skills/sandcastle/agents/openai.yaml`](file:///C:/Users/Manit/Desktop/sandcastle/.agents/skills/sandcastle/agents/openai.yaml)

---

## 3. Autonomous Orchestrator Development (`sandcastle.ps1`)

We developed [`sandcastle.ps1`](file:///C:/Users/Manit/Desktop/sandcastle/sandcastle.ps1) to manage the issue loop:

- **Pre-flight Checks**: Validates `gh` CLI installation and active authentication.
- **Repository Detection**: Auto-detects the active git repo or accepts `-Repo`.
- **Issue Gate Verification**: Queries `gh issue view` for `ready-for-agent` and `AFK` labels.
- **Isolated Process Spawning**: Calls `agy` with the Sandcastle prompt in non-interactive print mode.
- **Post-Run Verification**: Confirms that GitHub issue state changed to `CLOSED`.
- **Automatic Increment**: Advances `$currentIssue++` and moves to the next open issue.
- **Blocker Safety**: If an issue fails gates or is tagged `status blocked`, halts the loop immediately.

---

## 4. Testbed Repository: `TaskVault`

We created a public GitHub repository [`Vudattumaniteja/sandcastle-baton-demo`](https://github.com/Vudattumaniteja/sandcastle-baton-demo) containing `TaskVault`: a lightweight key-value ledger and state vault using Node.js ES Modules and the native `node --test` runner.

### Initial State:
- Baseline key-value store (`set`, `get`, `has`, `delete`, `size`, `clear`).
- 5 baseline passing unit tests in `src/vault.test.js`.
- Gating labels created on GitHub: `ready-for-agent`, `AFK`, `status blocked`, `sandcastle`.

---

## 5. The 4 Interconnected Issues

We created 4 connected issues with progressive complexity:

| # | Issue Title | Description & Dependencies | Labels |
| :--- | :--- | :--- | :--- |
| **[#1](https://github.com/Vudattumaniteja/sandcastle-baton-demo/issues/1)** | `feat: Add Time-To-Live (TTL) expiration support` | Added `options.ttlMs`, `isExpired()`, and lazy cleanup on `get()` and `has()`. | `ready-for-agent`, `AFK`, `sandcastle` |
| **[#2](https://github.com/Vudattumaniteja/sandcastle-baton-demo/issues/2)** | `feat: Implement Tagging and Multi-Tag Query Filtering` | Added `options.tags`, `findByTag()`, and `findByAllTags()`, respecting TTL expiration from Issue #1. | `ready-for-agent`, `AFK`, `sandcastle` |
| **[#3](https://github.com/Vudattumaniteja/sandcastle-baton-demo/issues/3)** | `feat: Implement Tamper-Evident SHA-256 Audit Hash Chain` | Added cryptographic blockchain mutation ledger blocks and `verifyIntegrity()` using `node:crypto`. | `ready-for-agent`, `AFK`, `sandcastle` |
| **[#4](https://github.com/Vudattumaniteja/sandcastle-baton-demo/issues/4)** | `feat: Add Vault Snapshot Export/Import with Checksum Validation` | Export/import serialization with root SHA-256 checksum and audit log integrity validation. | `ready-for-agent`, `AFK`, `sandcastle` |

---

## 6. Full Autonomous Execution & Results

The baton loop was executed via:
```powershell
.\sandcastle.ps1 -Repo "Vudattumaniteja/sandcastle-baton-demo" -StartIssue 1
```

### Sequence of Results:
1. **Issue #1**:
   - Worker implemented TTL and lazy cleanup in `src/vault.js`.
   - Added 7 unit tests (12 total passing).
   - Opened **PR #5**, merged into `main`, and closed Issue #1.
2. **Issue #2**:
   - Worker implemented tagging and multi-tag filtering in `src/vault.js`.
   - Added 6 unit tests (18 total passing).
   - Opened **PR #6**, merged into `main`, and closed Issue #2.
3. **Issue #3**:
   - Worker implemented cryptographic audit block chain and `verifyIntegrity()` in `src/vault.js`.
   - Added 10 unit tests (28 total passing).
   - Opened **PR #7**, merged into `main`, and closed Issue #3.
4. **Issue #4**:
   - Worker implemented snapshot export/import and checksum verification in `src/vault.js`.
   - Added 7 unit tests (35 total passing).
   - Opened **PR #8**, merged into `main`, and closed Issue #4.

---

## 7. Final Project State

### Verification Suite (`npm test`):
```text
✔ TaskVault Baseline (5 tests)
✔ TaskVault TTL Support (7 tests)
✔ TaskVault Tagging Support (6 tests)
✔ TaskVault Audit Hash Chain (10 tests)
✔ TaskVault Snapshot Export & Import (7 tests)

Total: 35 tests, 5 suites, 0 failures (100% green).
```

### Git Commit History on `main`:
- `4f69254` Merge pull request #8 from Vudattumaniteja/issue-4-snapshot-export-import
- `a19d7da` feat(#4): Add Vault Snapshot Export/Import with Checksum Validation
- `15c094d` Merge pull request #7 from Vudattumaniteja/issue-3-audit-hash-chain
- `f8c10cb` feat(#3): Implement Tamper-Evident SHA-256 Audit Hash Chain for Ledger Mutations
- `7c50ddf` Merge pull request #6 from Vudattumaniteja/issue-2-tagging-filtering
- `18d4e82` feat(#2): Implement Tagging and Multi-Tag Query Filtering
- `89d7713` fix(orchestrator): fix string interpolation and baton advance in sandcastle.ps1
- `a18fdf4` Merge pull request #5 from Vudattumaniteja/issue-1-ttl-expiration
- `2cd2c16` feat(#1): Add Time-To-Live (TTL) expiration support to TaskVault entries
- `56ae454` feat: initial TaskVault baseline with test suite and sandcastle runner

---

## 8. How to Use on Future Repositories

1. Copy `.agents/skills/sandcastle/SKILL.md` and `sandcastle.ps1` into the target repo root.
2. Label candidate backlog issues on GitHub with `ready-for-agent` and `AFK`.
3. Run:
   ```powershell
   .\sandcastle.ps1 -Repo "<owner>/<repo>" -StartIssue <issue_number>
   ```
