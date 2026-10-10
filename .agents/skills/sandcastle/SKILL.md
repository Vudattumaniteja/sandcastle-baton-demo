---
name: sandcastle
description: Sequential GitHub issue baton orchestrator. One isolated agent session/subagent works one issue, closes it after verified implementation and PR merge, then automatically initiates a fresh session for the next issue.
disable-model-invocation: false
---

# Sandcastle Issue Baton

Run a sequential GitHub issue baton where each issue is implemented in a completely clean, isolated context window. One worker works one issue, verifies it, merges the PR, closes the issue, and then hands off to a fresh session for the next issue.

## Inputs

- **Repository**: GitHub repo URL or `owner/repo`
- **Starting Issue**: Issue number (e.g. `#10`) or issue URL

If either is missing, request it before starting.

> **Deep Modules Notice**: Packages are deep modules: see [src/packages/README.md](../../../src/packages/README.md) before adding or importing one.

---

## Issue Gate

Before implementation, inspect the issue using GitHub CLI:
```bash
gh issue view <issue-number> --repo <repo> --json title,body,labels,state,comments
```

Only work the issue when **all** of the following conditions are met:
1. The issue is `OPEN`.
2. It has the label `ready-for-agent`.
3. It has the label `AFK` (or lowercase `afk`).
4. Any prerequisite issues mentioned in the body/comments are closed.

### If Gating Fails:
- If labels are missing: add `status blocked` label, comment explaining the missing gate labels, and STOP.
- If dependencies are open: comment with blocker details, add `status blocked`, and STOP.
- Do NOT proceed to coding or the next issue when blocked.

---

## Execution Modes in Antigravity

### Mode A: In-Session Subagent Baton (Recommended inside Antigravity)
When invoked inside an active Antigravity session (CLI, IDE, or App), the parent agent acts as the **Baton Coordinator**:

1. **Gate Check**: Check issue `#N` using `gh issue view`.
2. **Spawn Worker Subagent**: Use `invoke_subagent` to spawn a clean-context worker:
   - **TypeName**: `"self"`
   - **Role**: `Sandcastle Worker - Issue #<N>`
   - **Prompt**:
     ```text
     You are the Sandcastle Worker for Issue #<N> on repository <repo>.
     Follow the Sandcastle Worker Contract strictly:
     1. Read issue #<N> details with `gh issue view <N> --comments`.
     2. Implement the smallest complete solution satisfying acceptance criteria.
     3. Run local verifications (unit tests, build, lint, typecheck).
     4. Commit changes with message referencing #<N>.
     5. Push branch and open a PR with `gh pr create`.
     6. Merge the PR with `gh pr merge --merge` (or squash if repo convention).
     7. Close issue #<N> with `gh issue close <N>` and a completion summary comment.
     8. If blocked at any point, add label `status blocked`, comment with the blocker, and exit.
     ```
3. **Wait & Evaluate**: Once the subagent finishes:
   - Verify that issue `#N` is closed via `gh issue view <N>`.
   - If closed successfully: increment issue number (`N = N + 1`), find the next open gated issue, and spawn a **brand new subagent** for issue `#(N+1)`.
   - If blocked: report the blocker summary to the user and stop the baton.

### Mode B: Standalone CLI Runner (`sandcastle` / `sc`)
When running headlessly or sequentially from the terminal, use the global TypeScript CLI runner:
```bash
# Run all ready issues in backlog order
sandcastle run --all

# Or resume sequentially from a specific issue onward
sandcastle run <number>

# Or run an isolated single issue
sandcastle run --only <number>
```


---

## Worker Contract (Subagent / Worker Step-by-Step)

1. **Orientation**: Read issue body, inspect target directories, check existing test suites.
2. **Implementation**:
   - Keep changes tightly scoped to the issue requirements.
   - Do not perform extraneous refactors or touch unrelated files.
3. **Verification**:
   - Run existing project tests (e.g., `npm test`, `pytest`, `py -m unittest`, `cargo test`, `go test`).
   - Run build/typecheck where available.
   - Verify `git diff --check`.
4. **Git & PR Flow**:
   - Create and checkout a descriptive branch: `git checkout -b issue-<number>-<short-description>`
   - Stage and commit: `git commit -m "fix(#<number>): <summary>"`
   - Push: `git push origin issue-<number>-<short-description>`
   - Open PR:
     ```bash
     gh pr create --title "Fix: Issue #<number> - <title>" --body "Closes #<number>. Summary of changes: ... Verification passed: ..."
     ```
5. **Merge & Close**:
   - Merge PR: `gh pr merge --merge`
   - Close Issue:
     ```bash
     gh issue close <number> --comment "Completed in PR #<pr_number>. Verified tests passed."
     ```
   - Switch back to `main` and sync: `git checkout main && git pull origin main`

---

## Blocked State Contract

When an issue cannot be safely or automatically completed:
1. Label the issue: `gh issue edit <number> --add-label "status blocked"`
2. Comment with:
   - Exact failure or blocker encountered.
   - Evidence / command output.
   - Clear instructions on what human intervention is needed to unblock.
3. Halt the baton loop immediately. Do NOT move to the next issue.
