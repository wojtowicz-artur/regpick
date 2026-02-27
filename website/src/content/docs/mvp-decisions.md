---
title: MVP Decisions
---

This file closes the open items from the implementation plan for prototype scope.

## 1) `regpick.json` contract

- Formalized via `regpick.config.schema.json`.
- Supported fields:
  - `registries` (alias -> URL/path),
  - `targetsByType`,
  - `overwritePolicy` (`prompt` | `overwrite` | `skip`),
  - `packageManager` (`auto` | `npm` | `yarn` | `pnpm`),
  - `preferManifestTarget`,
  - `allowOutsideProject`.

## 2) `registry.json` support scope (MVP)

- Supported inputs:
  - top-level object with `items[]`,
  - top-level array of items,
  - single item JSON with `files[]`.
- Supported `items[]` entries:
  - inline entries containing `files[]`,
  - references via `url` / `href` / `path` to separate item JSON files.

## 3) Target path priority

Order used by installer:
1. `file.target` from manifest if `preferManifestTarget = true`,
2. `targetsByType[itemType] + basename(file.path)` if mapped,
3. `file.target` if present and not already used,
4. fallback `src/<basename>`.

## 4) Overwrite behavior

- `overwritePolicy = prompt`: per-file interactive choice (`overwrite` / `skip` / `abort`).
- `overwritePolicy = overwrite`: overwrite silently.
- `overwritePolicy = skip`: skip existing files.
- `--yes` bypasses overwrite prompt with overwrite behavior.

## 5) Dependency installation rules

- Candidate deps come from selected item `dependencies` and `devDependencies`.
- Existing declarations are read from project `package.json`.
- Missing packages can be installed after prompt.
- Package manager detection:
  - `pnpm-lock.yaml` -> `pnpm`,
  - `yarn.lock` -> `yarn`,
  - `package-lock.json` -> `npm`,
  - fallback `npm`.

## 6) Offline/cache for MVP

- No cache layer in MVP.
- Rationale: keep prototype minimal and deterministic.

## 7) Path security

- Writes outside the project root are blocked by default.
- Can be relaxed with `allowOutsideProject: true` for advanced use.
- Relative traversal (`../`) is effectively blocked by absolute path boundary check.

## 8) Versioning policy for MVP

- Config schema is versioned by package release (`regpick` semver).
- For MVP, no separate manifest protocol version pinning beyond compatibility parser logic.

## 9) Runtime adapters and error model

- Runtime side effects are routed through adapter ports in `src/shell/runtime/ports.ts`:
  - `FileSystemPort`,
  - `HttpPort`,
  - `PromptPort`,
  - `ProcessPort`.
- Commands receive adapters through `CommandContext.runtime` instead of importing IO libraries directly.
- The app now uses a shared typed result model from `src/core/result.ts` (`Result`, `ok`, `err`).
- Domain and shell errors are mapped to `AppError` in `src/core/errors.ts` and surfaced consistently in CLI output.
