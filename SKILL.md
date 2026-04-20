---
name: yrdsl-self-hosted
description: Edit a static yard sale site. Updates site.json / items.json, adds photos to public/photos/, and pushes via git so GitHub Pages rebuilds.
---

# Running this yard sale with Claude

You're inside a yrdsl-self-hosted template repo. This is a static yard sale
site that deploys to GitHub Pages. The whole sale is two JSON files plus
photos. There's no database, no API, no auth.

## The layout

```
site.json           # the sale's metadata: name, location, contact info
items.json          # the array of items for sale
public/photos/      # photo files, referenced from items.json
src/vendor/         # the renderer (don't edit)
mcp/                # stdio MCP server for Claude Desktop (optional)
.github/workflows/  # auto-deploys on push to main
```

## Common things the user will ask you to do

### Add an item
Edit `items.json` to append a new entry. The shape is:

```json
{
  "id": "short-unique-id",
  "title": "Human-readable title",
  "price": 45,
  "tags": ["furniture", "kitchen"],
  "added": "2026-04-20",
  "image": "photos/thing.jpg",
  "description": "A paragraph describing the item.",
  "reserved": null
}
```

Generate a kebab-case `id` from the title (e.g. `toaster-01`). `added` is
today's ISO date. If the user gives you a photo, save it under
`public/photos/` and reference it as `photos/<file>` (relative path, no leading slash. The browser resolves it against the page URL, which works whether the site is deployed to a GH Pages subpath or a custom domain root).

### Mark an item reserved
Set the `reserved` field on the matching item:

```json
"reserved": { "on": "2026-04-20", "price": 40 }
```

`on` is the date the reservation happened. `price` is the final agreed
price (may differ from the listed price; the card strikes through the
original).

### Mark an item sold (remove it)
Delete the entry from `items.json` entirely, or leave it reserved so the
gallery shows "it went for $X."

### Change the sale's name, contact info, or theme
Edit `site.json`. Theme is one of: `conservative`, `retro`, `hip`,
`artsy`. Contact accepts `email`, `sms`, `whatsapp` (digits only, no
`+`), and an optional `notes` field.

### Deploy the changes
After editing, run:

```bash
git add -A && git commit -m "add toaster" && git push
```

The GH Action in `.github/workflows/deploy.yml` builds and publishes to
GitHub Pages on each push to `main`. Usually live in under a minute.

## Schema reference

The full JSON shape is defined in `src/vendor/core/sale.ts` as zod
schemas (SaleSite, SaleItem, SaleContact). If you're unsure about an
optional field, read that file. `src/main.tsx` parses both JSON files
through those schemas at boot, so syntax errors surface in the browser
console immediately.

## What not to do

- Don't edit anything under `src/vendor/`. That's the shared renderer
  from the yard-sale monorepo; changes will be overwritten on the next
  vendor refresh.
- Don't edit anything under `mcp/`. That's the Claude Desktop MCP
  server; same rule. If the user asks you to tweak the MCP server,
  point them at the upstream repo instead.
- Don't commit `dist/` or `node_modules/`. They're in `.gitignore`.
- Don't break the schema. Run `node scripts/validate.mjs` after edits to
  catch shape errors before pushing.
