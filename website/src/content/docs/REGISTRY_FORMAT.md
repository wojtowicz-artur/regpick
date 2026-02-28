---
title: Registry Format
---

`regpick` uses a registry format compatible with **shadcn-ui v2**. However, it extends the way you can serve and define registries to allow more flexible local development and directory-based structures.

## Supported Registry Sources

You can provide a registry source in three ways:

1. **HTTP URL**: A fully qualified remote URL serving a `registry.json` (e.g., `https://ui.shadcn.com/r`).
2. **Local File**: A path to a local `.json` file containing the registry definition (e.g., `./my-registry/registry.json`).
3. **Local Directory**: A path to a local directory (e.g., `./tebra-icon-registry/registry`). When a directory is provided, `regpick` will scan it for `.json` files, treating each file as a single component definition (a "fat item"). This is great for keeping your registry definitions split into smaller, manageable files.

> [!NOTE]
> `regpick` natively understands both single large `registry.json` arrays as well as directories containing multiple `.json` files.

## Registry Item Structure (shadcn v2 compatible)

Whether it's inside an array in `registry.json` or as a standalone file in a directory, an item looks like this:

```json
{
  "name": "button",
  "title": "Button",
  "description": "A button component.",
  "type": "registry:component",
  "dependencies": ["@radix-ui/react-slot"],
  "devDependencies": [],
  "registryDependencies": [],
  "files": [
    {
      "path": "ui/button.tsx",
      "type": "registry:component",
      "target": "components/ui/button.tsx"
    }
  ]
}
```

### Key properties

- `name`: The unique identifier for the component.
- `type`: Used to determine the target installation folder based on your `targetsByType` configuration.
- `dependencies` & `devDependencies`: Packages that `regpick` will automatically prompt to install.
- `files`: The source files for the component.
  - `path`: The path relative to the registry root (or the file itself if local).
  - `target` (optional): If `preferManifestTarget` is enabled in your config, `regpick` will use this path instead of the one inferred from `targetsByType`.
  - `url` (optional): A remote URL for the file content. `regpick` automatically converts GitHub web URLs (`blob/...`) to raw content URLs.
  - `content` (optional): You can embed the file contents directly as a string to avoid additional network/file reads.

## GitHub Integration

`regpick` natively supports GitHub URLs. You can use standard "web" links to files in your manifest, and they will be automatically resolved to their raw counterparts:

```json
{
  "name": "my-component",
  "files": [
    {
      "url": "https://github.com/user/repo/blob/main/src/component.tsx"
    }
  ]
}
```

This works for both the registry source itself and individual file URLs within the registry.

## The `pack` Command

To make it incredibly easy to create your own registries, `regpick` includes a `pack` command.

```bash
regpick pack ./src/components/ui
```

### How `pack` works:

> [!WARNING]
> The static analysis used by `pack` is designed for simple imports. It may miss dynamically resolved modules or complex `require` statements. Always verify the generated `registry.json`.

1. It recursively scans the specified directory for `.ts` and `.tsx` files.
2. It reads each file and uses static analysis to automatically extract external `import` statements, transforming them into the `dependencies` array.
3. It bundles all these components into a single valid `registry.json` file inside your current working directory.
4. The generated `registry.json` is fully shadcn-compatible and can be immediately distributed or uploaded.
