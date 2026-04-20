# yrdsl-self-hosted

A yard sale you self-host. One sale, two JSON files, zero backend.
GitHub Pages serves it; GitHub Actions deploys it; Claude can edit it.

**Live demo:** <https://mreider.github.io/yrdsl-example/>

## What you get

- A clean, themeable gallery of your stuff with search, tag chips, sort,
  and a deep-link-able item modal.
- Direct contact: buyers email, text, or WhatsApp you. No platform inbox.
- Four themes (`conservative`, `retro`, `hip`, `artsy`).
- Multi-language support: add a `_de` / `_es` / etc. sibling key for any
  text field in `site.json` and the locale picker handles the rest.

No database, no auth, no Worker, no email service, no billing.

## Stand it up

1. **Use this template** (button at the top of this repo) → create your
   own repo. Name it whatever you want.
2. Clone your new repo locally.
3. Edit `site.json` (your sale's name, location, contact info, theme).
4. Edit `items.json` (your items, prices, photos).
5. Drop photos into `public/photos/` and reference them as
   `photos/<filename>` from `items.json` (relative path, no leading
   slash. External URLs work too.).
6. Commit and push:
   ```bash
   git add -A && git commit -m "my sale" && git push
   ```
7. In your repo's **Settings → Pages**, set source to **GitHub Actions**.

The first push triggers `.github/workflows/deploy.yml` which validates
the JSON, builds with Vite, and publishes. Usually live in under a
minute at `https://<your-username>.github.io/<your-repo>/`.

## Edit locally first

```bash
pnpm install
pnpm dev
```

Opens on <http://localhost:5173>. Hot-reloads on JSON changes.

To check the JSON shapes without booting the dev server:

```bash
pnpm validate
```

This is the same check the CI runs before deploy.

## Edit with Claude

Two paths, pick whichever fits your workflow:

### Claude Code (easiest, no install)

Open this repo in Claude Code. The `SKILL.md` at the repo root tells
Claude the file layout and the common edit patterns. Claude uses its
built-in Read/Edit/Write/Bash tools, so nothing else needs to be
installed.

### Claude Desktop via MCP (works from the desktop app chat)

This repo ships an MCP server at `mcp/server.mjs` that exposes typed
tools (`add_item`, `mark_reserved`, `update_site`, `commit_and_push`,
etc.) to Claude Desktop. One-time setup:

```bash
cd mcp
pnpm install
```

Then add this to your Claude Desktop config (macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`,
Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "yrdsl": {
      "command": "node",
      "args": ["/absolute/path/to/your-fork/mcp/server.mjs"],
      "env": { "YRDSL_REPO": "/absolute/path/to/your-fork" }
    }
  }
}
```

Restart Claude Desktop. You'll see the "yrdsl" server listed in the
MCP menu; Claude can now edit the sale directly from any chat.

### Prompts that work well

- *"Add a toaster for $25, tags kitchen + appliance, using the photo I
  just saved as toaster.jpg."*
- *"Mark the couch reserved for $400 as of today."*
- *"Switch the theme to retro."*
- *"Commit and push."*

## Custom domain

1. Add a `CNAME` file at the repo root with your domain (e.g.
   `sale.mydomain.com`).
2. Point a CNAME DNS record at `<your-username>.github.io`.
3. In **Settings → Pages**, add the custom domain.
4. In `.github/workflows/deploy.yml`, remove the `GH_PAGES_BASE` env var
   so Vite builds with `base = "/"`.

## File layout

```
site.json           # the sale's metadata
items.json          # the array of items
public/photos/      # photo files referenced from items.json
src/vendor/         # the renderer (don't edit; vendored from the upstream repo)
.github/workflows/  # auto-deploys on push to main
SKILL.md            # tells Claude how to edit this repo
scripts/validate.mjs # pre-deploy JSON validation
```

## JSON shape

`site.json` and `items.json` validate against the zod schemas in
`src/vendor/core/sale.ts`. The same shapes are produced by the hosted
version of yrdsl.app, so you can move data between modes losslessly. See
the [PRD §4.4](https://github.com/KuvopLLC/yard-sale/blob/main/PRD.md#44-distribution-modes)
for the full hosted-vs-self-hosted comparison.

## Want the hosted version instead?

If you'd rather have multi-sale accounts, email confirmation, Claude
over MCP from your phone, and metered billing, sign up at
<https://yrdsl.app>. Operated by Kuvop LLC.

## Upstream

The renderer source lives at <https://github.com/KuvopLLC/yard-sale> in
`packages/viewer`. To pull a new version into your fork's `src/vendor/`,
copy the files over and bump the deps in `package.json`. A vendor-refresh
script is planned but not built.

## License

Apache 2.0. Part of the [Kuvop OSS](https://oss.kuvop.com) family.
