# regpick

[![npm version](https://img.shields.io/npm/v/regpick.svg)](https://www.npmjs.com/package/regpick)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Lightweight CLI for selecting and installing registry entries from shadcn-compatible registries (v2). It supports local directory-based item JSON files, remote registries, and interactive component management.

## Features

- **Interactive CLI**: Beautiful prompts using `@clack/prompts`.
- **shadcn/ui compatible**: Works seamlessly with v2 registries.
- **Smart Updates**: Keep track of installed components via `regpick-lock.json` and update them interactively with built-in diff viewing.
- **Dependency Management**: Automatically detects and prompts to install missing `dependencies` and `devDependencies`.
- **Registry Aliases**: Configure shortcuts for your frequently used registries.
- **Component Packing**: Easily turn your local components into a distributable `registry.json`.

## Quick Start

The easiest way to use `regpick` is via `npx` or your preferred package runner.

```bash
# Initialize configuration in your project
npx regpick init
```

## Use Cases

`regpick` adapts to your workflow, whether you are exploring components manually or automating your CI/CD.

### 1. Interactive Component Addition
Browse and select components to install interactively.
```bash
npx regpick add <registry-url-or-alias>
```

### 2. Check Available Components
List all items available in a registry before adding them.
```bash
npx regpick list <registry-url-or-alias>
```

### 3. Keep Components Up-to-Date
Check for upstream updates to your installed components and review code diffs before applying changes.
```bash
npx regpick update
```

### 4. Create Your Own Registry
Scan a local directory of components and pack them into a distributable `registry.json`.
```bash
npx regpick pack ./src/components/ui
```

## CLI Flags & Automation

You can run `regpick` in a non-interactive or scriptable way using CLI flags:

- `--cwd=<path>`: Change the working directory (useful in monorepos).
- `--yes`: Skip confirmation prompts (e.g., dependency installation, overwrite confirmation). Assumes "yes" or default configuration.
- `--all`: Select all items available in the registry during the `add` command.
- `--select=a,b,c`: Comma-separated list of items to explicitly select without showing the interactive menu.

## Configuration

`regpick` uses a configuration file (e.g., `regpick.config.json` or `regpick.json`) at the root of your project. You can generate this by running `regpick init`.

<details>
  <summary>Click to view a basic configuration example</summary>

```json
{
  "registries": {
    "ui": "https://ui.shadcn.com/r"
  },
  "targetsByType": {
    "registry:component": "src/components/ui"
  },
  "overwritePolicy": "prompt",
  "packageManager": "auto"
}
```

</details>

For a full list of configuration options, including advanced settings like import aliases (`aliases`) and security policies (`allowOutsideProject`), please see the [Configuration Reference](./docs/CONFIGURATION_REFERENCE.md).

## Lockfile (`regpick-lock.json`)

When you install components, `regpick` generates a lockfile to track the source and content hash of each installed item. This allows the `update` command to detect upstream changes and offer interactive updates with diff viewing.

---

For a detailed behavioral breakdown of every command (Success & Error stories), see the [Command Stories Documentation](./docs/COMMANDS_STORIES.md).
