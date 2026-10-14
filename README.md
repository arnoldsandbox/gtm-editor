# GTM Editor

Look up, view, edit, extract, combine and download Google Tag Manager container
components or whole containers, producing JSON that imports cleanly into GTM
(Admin → Import Container).

Two front ends share one library:

| Package | What it is |
|---|---|
| `packages/core` | Parse, index, validate, auto-fix, extract, combine and serialize GTM exports (`exportFormatVersion: 2`). No UI or Node dependencies. |
| `packages/cli` | `gtm-editor` command-line tool built on core. |
| `apps/web` | Browser app built on core. Files are processed locally and never uploaded. |

## Getting started

```sh
pnpm install
pnpm dev                 # web app at http://localhost:5173
pnpm build               # build core and CLI
node packages/cli/dist/main.js --help
pnpm test
```

## CLI

```sh
gtm-editor inspect container.json                 # summary + problems
gtm-editor validate container.json [--json]       # exit 1 if it would not import cleanly
gtm-editor list container.json tag -s awct        # search entities of one kind
gtm-editor show container.json tag "GA4 - Config" # one entity, its references and what uses it
gtm-editor extract container.json --tag 12 --tag "Ads - Linker" -o bundle.json
gtm-editor combine base.json other.json --tag "GA4 Event - lead" --on-conflict rename -o merged.json
gtm-editor fix container.json -o fixed.json       # enable missing built-ins, normalize exportTime, ...
```

Entities are selected by ID or exact name. Commands that write a container refuse
to write one that has validation errors.

## How import validity is checked

- **Structure:** Zod schemas for the envelope, every entity kind and the recursive
  parameter tree. IDs must be numeric strings. Unknown fields are kept as they are,
  so a file that is loaded and saved without edits comes back byte for byte.
- **References:** firing/blocking trigger IDs, trigger-group members, setup/teardown
  tags (linked by name), `{{Variable}}` names in any string, `cvt_<container>_<template>`
  types and folder IDs must all resolve. Built-in triggers (All Pages, Initialization,
  Consent Initialization) and `{{_event}}` resolve without entries. A `{{Page Path}}`
  style reference to a built-in that is not enabled is an error that `fix` repairs.
- **Uniqueness:** names and IDs are unique within each kind.

**Extract** takes the selection plus everything it depends on, including nested
variables, templates, folders and the built-ins it uses. **Combine** gives incoming
entities fresh IDs, rewires every reference, merges same-name folders and settles
name clashes by `rename` (default), `keepBase` or `replace`.

## Tests

`packages/core/test/fixtures/sample-web.json` is a synthetic container committed to
the repo. To also test against real exports, drop them into `fixtures/private/`
(git-ignored); the suite then checks they round-trip byte for byte, that every tag
extracts to a valid container, and that every pair combines into a valid one.
