---
name: verify-sandcastle
description: Project-local verification skill to drive and verify the Sandcastle CLI commands, doctor preflights, and baton runs.
disable-model-invocation: true
---

# Verify Sandcastle CLI

Use this skill to verify the behavior of the Sandcastle CLI commands before committing changes or releasing.

## 1. Launch

Sandcastle is a compiled TypeScript CLI. To launch and verify the current build:

```bash
# 1. Build the distribution bundle
npm run build

# 2. Verify packaging smoke test
node scripts/verify-build.mjs
```

The CLI entrypoint is at `dist/bin/sandcastle.js`. You can execute it directly with `node`:

```bash
node dist/bin/sandcastle.js --help
```

---

## 2. Doctor

Run this read-only check first whenever diagnosing issues:

```bash
node dist/bin/sandcastle.js doctor
```

**Success Signal**: Output ends with `✔ Workspace preflight diagnostics passed.` and exit code `0`.

---

## 3. Drive

To drive features programmatically:

- **Dry-run Baton**: Run issue execution safely without modifying git or contacting Antigravity:
  ```bash
  node dist/bin/sandcastle.js run 1,2 --mode dry-run --json
  ```
- **Inspect Status**:
  ```bash
  node dist/bin/sandcastle.js status --json
  ```
- **Inspect Config**:
  ```bash
  node dist/bin/sandcastle.js config list --json
  ```
- **Update Check**:
  ```bash
  node dist/bin/sandcastle.js update --check --json
  ```

---

## 4. Evidence

All verification runs should capture output to `.sandcastle/test-evidence/`:

```bash
# Example capturing proof of dry-run execution
mkdir -p .sandcastle/test-evidence
node dist/bin/sandcastle.js run 1 --mode dry-run --json > .sandcastle/test-evidence/run-dry.json
```

Proof is valid when:
- The JSON contains `"success": true`.
- `"mode": "dry-run"` is confirmed.
- Process exit code is `0`.

---

## 5. Cleanup

After verification runs:
- Delete temporary state in `.sandcastle/test-evidence/` if not needed.
- Ensure no lingering worker processes exist.

---

## 6. Feature Map

See [`features/README.md`](features/README.md) for detailed verification recipes for each CLI subcommand.
