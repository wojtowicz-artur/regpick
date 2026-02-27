---
title: Command Stories
---

This document explores the `regpick` CLI through a behavior-driven perspective, outlining the "Success Story" (happy path) and "Errors Story" (unhappy paths and edge cases) for each command.

---

## `init`

**Description:** Bootstraps the project with a `regpick.config.json` configuration file.

### 🟢 Success Story
The user runs `regpick init`. The CLI checks the project root and confirms no configuration file exists. It then presents a series of interactive prompts:
1. **Package Manager:** The user selects their preferred package manager (e.g., `pnpm`, or leaves it as `auto`).
2. **Components Folder:** The user inputs the path to their UI components directory (defaulting to `src/components/ui`).
3. **Overwrite Policy:** The user chooses how file conflicts should be handled (`prompt`, `overwrite`, or `skip`).

After completing the prompts, `regpick` creates `regpick.config.json` in the current directory and displays a success message: *"Created regpick.config.json"*.

### 🔴 Errors Story

> [!WARNING]
> `regpick` is designed to fail gracefully. In all the scenarios below, it aborts execution before making partial changes to prevent a corrupted state.

- **Config Already Exists:** If `regpick.config.json` already exists, the CLI prompts the user to confirm an overwrite. If the user selects "No", the CLI gracefully exits with a no-op message: *"Keeping existing configuration."*
- **User Cancellation:** If at any point during the interactive prompts (package manager, folder, policy) the user presses `Ctrl+C` or cancels the prompt, the operation safely aborts with an `[UserCancelled]` error, and no file is written.
- **Filesystem Permissions:** If the current directory is not writable, the underlying filesystem call fails, and `regpick` prints a clear filesystem error before exiting with code 1.

---

## `list`

**Description:** Displays all available components from a remote registry or local path.

### 🟢 Success Story
The user runs `regpick list ui` (where `ui` is a valid alias in `regpick.config.json` pointing to `https://ui.shadcn.com/r`). The CLI reads the configuration, resolves the alias to the URL, and fetches the remote registry JSON. It parses the `items` array and successfully logs a formatted list to the console, showing each component's name, type, and the number of files it includes (e.g., `- button (registry:component, files: 1)`). It finishes with *"Listed X item(s)."*

### 🔴 Errors Story
- **Missing Source:** If the user runs `regpick list` without specifying a source and cancels the subsequent interactive prompt asking for the URL/path, the CLI returns an `[UserCancelled]` error.
- **Invalid Alias/Network Failure:** If the provided source is an invalid URL, or if the network request fails (e.g., offline or 404), the `loadRegistry` operation returns an error, and the CLI outputs the failure reason.
- **Empty Registry:** If the registry is successfully fetched but the `items` array is empty, the CLI issues a warning: *"No items found in registry."*

---

## `add`

**Description:** Interactively selects, downloads, and installs components, their dependencies, and updates the lockfile.

### 🟢 Success Story
The user runs `regpick add my-registry`. The CLI resolves the registry, loads the items, and presents an interactive multi-select menu. The user selects `button` and `card`. 
1. **Confirmation:** The CLI asks for confirmation to install 2 items. The user confirms.
2. **Conflict Resolution:** The CLI calculates the installation plan. It finds that `button.tsx` already exists. Since the `overwritePolicy` is set to `prompt`, it asks the user what to do. The user chooses to "Overwrite".
3. **Dependencies:** The CLI detects that `card` requires `framer-motion`. It prompts the user to install the missing dependency via the configured package manager. The user agrees.
4. **Execution:** The CLI downloads the files, applies configured aliases to the source code, writes the files to `src/components/ui/`, updates `regpick-lock.json` with the new file hashes, and runs `npm install framer-motion`. 
The CLI concludes with *"Installed 2 item(s), wrote 3 file(s)."*

### ⚡ Automation Story (Non-Interactive)
> [!NOTE]  
> The `--yes` flag assumes the default, safe behavior (like overwriting files if your policy allows it). Always use with caution in production.

The user runs `regpick add my-registry --yes --select=button,card`. 
The CLI resolves the registry and immediately targets the specified components, skipping the interactive menu.
1. **Confirmation:** Bypassed due to the `--yes` flag.
2. **Conflict Resolution:** If `button.tsx` exists, the `--yes` flag forces an automatic overwrite, bypassing the `overwritePolicy` prompt.
3. **Dependencies:** When `framer-motion` is detected as missing, the CLI automatically proceeds with the installation via the configured package manager.
4. **Execution:** Files are written, lockfiles updated, and dependencies installed entirely without human intervention. This flow is ideal for initialization scripts or CI pipelines.

### 🔴 Errors Story
- **Selection Cancelled:** The user cancels the component selection menu, resulting in `[UserCancelled]`.
- **No Items Selected:** The user submits the selection menu without selecting any items. The CLI gracefully aborts with *"No items selected."*
- **Registry Unreachable:** The target registry URL is down or malformed. The CLI halts early and prints the fetch error.
- **Conflict Abort:** When prompted about an existing file conflict, the user selects "Abort installation". The CLI stops immediately without writing any files or lockfiles.
- **Dependency Install Failure:** If the underlying package manager fails to install the dependencies (e.g., due to network issues or peer dependency conflicts), the CLI reports the error, though the component files themselves might have already been written.

---

## `update`

**Description:** Checks installed components against their original registries for updates and applies them.

### 🟢 Success Story
The user runs `regpick update`. The CLI reads `regpick-lock.json` and groups installed components by their source registry. It fetches the latest registries and computes the hash of the remote files. 
It detects that the remote hash for `button` differs from the local lockfile hash. It prompts the user: *"What do you want to do with button?"* 
The user selects "Show diff". The CLI prints a color-coded inline diff showing the exact code changes. The user then confirms the update. `regpick` overwrites the local `button.tsx`, updates the lockfile hash, and finishes with *"Updated 1 components."*

### 🔴 Errors Story
- **No Components Installed:** The lockfile is empty or missing. The CLI outputs: *"No components installed. Nothing to update."*
- **Registry Offline:** While iterating through sources, one registry fails to load. The CLI prints a warning: *"Failed to load registry [URL]"* and safely skips to the next source.
- **User Skip/Cancel:** When prompted with an available update, the user selects "Skip" or presses `Ctrl+C`. The CLI leaves the component untouched and proceeds to the next one (or exits if cancelled).
- **Filesystem Error:** The CLI lacks permission to overwrite the file during the update execution phase. The command fails, printing the FS error, and the lockfile remains unchanged to prevent desync.

---

## `pack`

**Description:** Scans a local directory for components and generates a distributable `registry.json`.

### 🟢 Success Story
The user runs `regpick pack ./src/components/ui`. The CLI verifies the target is a valid directory and recursively scans for `.ts` and `.tsx` files. It reads `button.tsx` and `dialog.tsx`, automatically parsing their source code to extract `import` statements and map them to `dependencies` (e.g., discovering `import * as React from "react"` or `import { clsx } from "clsx"`). 
It generates a valid `registry.json` array containing all discovered components, complete with relative paths and dependencies, and writes the file to the current working directory. The CLI outputs: *"Packed 2 components into registry.json"*.

### 🔴 Errors Story
- **Invalid Directory:** The user runs `regpick pack ./non-existent-dir`. The CLI fails immediately with an `[ValidationError] Target is not a directory`.
- **No Files Found:** The specified directory exists but contains no `.ts` or `.tsx` files. The CLI prints a warning: *"No .ts or .tsx files found."* and exits gracefully without generating a JSON file.
- **Read/Write Errors:** If the CLI encounters permission issues while reading the source files or writing the final `registry.json` to the current working directory, it halts and reports the standard filesystem error.
