---
title: How-to Guides
---

This section provides practical, step-by-step instructions on how to solve specific, common problems using `regpick`.

## 1. How to automate installation in CI/CD pipelines

By default, `regpick` is interactive and will wait for user input (e.g., asking which components to install or whether to overwrite files). This will stall automated scripts.

To run `regpick` fully unattended, combine the `--yes` flag with `--select` or `--all`.

**Scenario:** You want to always install the latest versions of a specific set of components during a build step.

```bash
npx regpick add ui --select=button,input,dialog --yes
```

> [!NOTE]
> The `--yes` flag will automatically:
>
> - Skip the component selection menu.
> - Auto-install any missing dependencies using your default package manager.
> - Obey your `overwritePolicy` (if it's set to `"prompt"`, `--yes` acts as an automatic "overwrite").

## 2. How to use `regpick` in a Monorepo

If you have a monorepo structure (e.g., using Turborepo or PNPM workspaces), you often run scripts from the root directory but want to apply changes to a specific package (like `apps/frontend`).

Instead of writing `cd apps/frontend && npx regpick ...`, you can use the `--cwd` flag.

```bash
npx regpick add ui --cwd=./apps/frontend
```

`regpick` will correctly resolve the `regpick.config.json` inside `apps/frontend` and install the components relative to that package.

## 3. How to rewrite import paths (Aliases)

When downloading components from public registries, they often come with hardcoded import paths that might not match your project's architecture.

**Scenario:** A component uses `import { cn } from "@/lib/utils"`, but your project keeps utilities in `~/src/helpers/utils`.

You don't need to manually fix this after every installation. Open your `regpick.config.json` and add the `aliases` property:

```json
{
  "registries": { ... },
  "targetsByType": { ... },
  "aliases": {
    "@/lib/utils": "~/src/helpers/utils"
  }
}
```

Now, every time you run `regpick add`, it will parse the downloaded TypeScript/React files and securely rewrite the import statements on the fly before saving the files to your disk.

## 4. How to create a local registry from your existing components

You don't need to host a JSON file online to use `regpick`. You can point it directly to a local directory or pack your components.

**Option A: Scan a directory**
If you have a folder full of individual JSON items, just add it to your config:

```json
"registries": {
  "my-local-registry": "./packages/ui/registry"
}
```

**Option B: Generate a `registry.json` from source code**
If you just have a folder of raw `.tsx` files and want to distribute them, use the `pack` command:

```bash
npx regpick pack ./src/components/ui
```

This will statically analyze your files, extract their dependencies, and output a fully formed `registry.json` file in your root directory.
