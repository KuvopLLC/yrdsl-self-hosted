# yrdsl-self-hosted

[![Deploy](https://github.com/KuvopLLC/yrdsl-self-hosted/actions/workflows/deploy.yml/badge.svg)](https://github.com/KuvopLLC/yrdsl-self-hosted/actions/workflows/deploy.yml)

Template repo for running a single digital yard sale on GitHub Pages. A sale is
one web page listing items with photos, prices, short descriptions, and
contact buttons (email, SMS, WhatsApp). Data lives in two JSON files
(`site.json`, `items.json`) plus a `public/photos/` folder. GitHub
Actions builds the site on every push.

Example: <https://mreider.github.io/yrdsl-example/>.

The hosted version is at <https://yrdsl.app>.

## Stand it up

1. Click **Use this template** at the top of this repo. Name your new
   repo whatever you want.
2. Clone your fork locally.
3. Edit `site.json` (sale name, location, contact info, theme) and
   `items.json` (items, prices, tags, photos).
4. Drop photos into `public/photos/` and reference them from
   `items.json` as `photos/<filename>` (relative path, no leading
   slash). External URLs also work.
5. In your repo's **Settings → Pages**, set source to **GitHub Actions**.
6. Commit and push. The `deploy.yml` workflow validates the JSON,
   builds with Vite, and publishes at
   `https://<your-username>.github.io/<your-repo>/`.

## Edit locally

```bash
pnpm install
pnpm dev
```

Opens on <http://localhost:5173>. Hot-reloads on JSON changes.

To validate the JSON shapes without booting the dev server:

```bash
pnpm validate
```

Same check CI runs before deploy.

## Import an existing sale (from hosted or another self-hosted)

If you have an export ZIP from <https://yrdsl.app> or from another
self-hosted repo, drop it in with:

```bash
pnpm import path/to/sale.zip
```

Runs the same schema + photo-ref checks the hosted importer runs,
then overwrites `site.json`, `items.json`, and `public/photos/`.
Everything the script replaces goes into `.yrdsl-backup/<timestamp>/`
first (gitignored) so you can roll back. Pass `--force` to skip the
backup. Does not auto-commit: review with `git diff --staged` before
pushing.

## Edit with Claude

Two paths.

### Claude Code

Open your fork in Claude Code. The `SKILL.md` at the repo root tells
Claude the file layout. Claude uses its built-in Read/Edit/Write/Bash
tools; nothing else to install.

### Claude Desktop via MCP

This repo ships the `yrdsl-mcp` server at `mcp/`. It also works
against hosted yrdsl.app sales.

One-time setup:

```bash
cd mcp
pnpm install
```

Add to Claude Desktop's config (macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`,
Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "yrdsl": {
      "command": "node",
      "args": ["/absolute/path/to/your-fork/mcp/dist/index.js"],
      "env": { "YRDSL_REPO": "/absolute/path/to/your-fork" }
    }
  }
}
```

Restart Claude Desktop.

**About `commit_and_push`:** the MCP does not carry a GitHub token. It
runs `git push` in the fork's directory using whatever credentials the
local git already has (SSH key, gh-CLI helper, HTTPS token). If
`git push` works in your terminal from that directory, it works from
Claude. If not, run `gh auth login` (or set up SSH) first.

To use the MCP against a hosted sale instead, swap the `env` block:

```json
"env": {
  "YRDSL_API_TOKEN": "yrs_live_...",
  "YRDSL_SALE_ID": "01ABC..."
}
```

Generate the token at <https://app.yrdsl.app/tokens>. The sale id is in
the editor URL: `app.yrdsl.app/sales/<id>`.

## Custom domain

1. Add a `CNAME` file at the repo root containing your domain.
2. Point a CNAME DNS record at `<your-username>.github.io`.
3. In **Settings → Pages**, add the custom domain.
4. In `.github/workflows/deploy.yml`, remove the `GH_PAGES_BASE` env var
   so Vite builds with `base = "/"`.

## File layout

```
site.json            # sale metadata
items.json           # array of items
public/photos/       # photo files referenced from items.json
src/vendor/          # vendored renderer (do not edit)
.github/workflows/   # deploy workflow
SKILL.md             # instructions for Claude Code
scripts/validate.mjs # JSON validation
mcp/                 # MCP server for Claude Desktop
```

## JSON shape

`site.json` and `items.json` validate against the schemas in
`src/vendor/core/sale.ts`. The hosted yrdsl.app produces the same
shapes, so data moves between modes losslessly.

## Upstream

The renderer source lives at <https://github.com/KuvopLLC/yrdsl> under
`packages/viewer`. A CI job on the upstream repo refreshes
`src/vendor/` here when the renderer changes.

## Contact

[matt@mreider.com](mailto:matt@mreider.com).

## License

Apache 2.0. Operated by [Kuvop LLC](https://oss.kuvop.com).
