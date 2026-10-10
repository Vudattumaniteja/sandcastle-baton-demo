# Sandcastle Packages (`src/packages/`)

Packages in Sandcastle are **deep modules**: substantial behavior behind a minimal, clean public interface.

## Directory Layout

Each package under `src/packages/` follows a strict layout:

```text
src/packages/<name>/
  index.ts           # Primary public entry point
  <feature>.ts       # Additional targeted public entry points (optional)
  lib/               # Private implementation details (hidden from outsiders)
```

For example:
- `src/packages/orchestrator/index.ts` & `prompt.ts` & `gating.ts` (Entry points)
- `src/packages/orchestrator/lib/` (Private parsing and queue engines)

## The 4 Boundary Rules

Boundary rules are enforced by [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) via `.dependency-cruiser.cjs`:

1. **Entry-point boundary from app**: Code outside a package (`src/commands/`, `src/core/`, `src/services/`, etc.) may only import root entry points of a package (`src/packages/<pkg>/*.ts`), never private files in `lib/` or subfolders.
2. **Entry-point boundary across packages**: Packages may import other packages only through their root entry points, never reaching into peer `lib/` internals.
3. **Tests through entry points**: Test suites exercise packages through their root entry points or co-located fixtures.
4. **No circular dependencies**: Dependency cycles between modules are forbidden.

## Discouraging Giant Barrel Files

Packages should **not** create bloated, 70+ symbol barrel files re-exporting entire internal directory trees. Instead:
- Expose focused entry points (e.g. `index.ts`, `prompt.ts`, `gating.ts`, `models.ts`).
- Keep internal implementation functions and utilities private in `lib/`.

## Running Boundary Checks

To verify all architectural boundaries:

```bash
npm run lint:boundaries
```

Or run the full verification lever:

```bash
npm run verify
```
