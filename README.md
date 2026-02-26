# regpick

Lightweight CLI for selecting and installing registry entries from shadcn-compatible registries (v2), with support for local directory-based fat item JSON files.

## Commands

- `regpick init`
- `regpick list [registry-name-or-url]`
- `regpick add [registry-name-or-url]`

## Quick start

```bash
cd /path/to/project
cd /path/to/packages/regpick
npm run build
node ./dist/index.mjs init
node ./dist/index.mjs list tebra
node ./dist/index.mjs add tebra
```

## Config (`regpick.json`)

```json
{
  "registries": {
    "tebra": "./tebra-icon-registry/registry"
  },
  "targetsByType": {
    "registry:icon": "src/components/ui/icons",
    "registry:component": "src/components/ui",
    "registry:file": "src/components/ui"
  },
  "overwritePolicy": "prompt",
  "packageManager": "auto",
  "preferManifestTarget": true,
  "allowOutsideProject": false
}
```

Optional JSON schema path (if the file is available in your project):

```json
{
  "$schema": "./packages/regpick/regpick.config.schema.json"
}
```

## Notes

- Supports:
  - full `registry.json` (with inline item definitions),
  - item references (`url` / `href`) in `items[]`,
  - single item JSON (`registry:file` style),
  - directory source containing many item JSON files.
- For safety, path traversal writes outside project root are blocked by default.
