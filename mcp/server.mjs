#!/usr/bin/env node
/**
 * yrdsl MCP server (stdio).
 *
 * Lets Claude Desktop edit your local yrdsl-self-hosted repo. Edits
 * site.json + items.json directly, optionally git commit + push.
 *
 * Wire into Claude Desktop's `claude_desktop_config.json` like:
 *
 *   {
 *     "mcpServers": {
 *       "yrdsl": {
 *         "command": "node",
 *         "args": ["/absolute/path/to/your-fork/mcp/server.mjs"],
 *         "env": { "YRDSL_REPO": "/absolute/path/to/your-fork" }
 *       }
 *     }
 *   }
 *
 * If YRDSL_REPO is unset the server falls back to the directory above
 * this file, which works when Claude spawns it from inside the cloned
 * repo.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const REPO = process.env.YRDSL_REPO
  ? resolve(process.env.YRDSL_REPO)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SITE_PATH = join(REPO, 'site.json');
const ITEMS_PATH = join(REPO, 'items.json');

if (!existsSync(SITE_PATH) || !existsSync(ITEMS_PATH)) {
  console.error(`yrdsl-mcp: site.json/items.json not found in ${REPO}.`);
  console.error('Set YRDSL_REPO to your forked yrdsl-self-hosted repo path.');
  process.exit(1);
}

// ─── JSON helpers ──────────────────────────────────────────────────────────
function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
function writeJSON(path, obj) {
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function findItem(items, id) {
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) throw new Error(`No item with id "${id}".`);
  return idx;
}

// ─── Tool input schemas ────────────────────────────────────────────────────
const AddItemArgs = z.object({
  title: z.string().min(1),
  price: z.number().nonnegative(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
  image: z.string().optional(),
  id: z.string().optional(),
});

const UpdateItemArgs = z.object({
  id: z.string(),
  title: z.string().optional(),
  price: z.number().nonnegative().optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
  image: z.string().optional(),
});

const IdArg = z.object({ id: z.string() });

const MarkReservedArgs = z.object({
  id: z.string(),
  price: z.number().nonnegative().optional(),
  on: z.string().optional(),
  note: z.string().optional(),
});

const UpdateSiteArgs = z.object({
  siteName: z.string().optional(),
  subtitle: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  theme: z.enum(['conservative', 'retro', 'hip', 'artsy']).optional(),
  currency: z.string().length(3).optional(),
  language: z.string().optional(),
  contact: z
    .object({
      email: z.string().email().optional(),
      sms: z.string().optional(),
      whatsapp: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
});

const CommitArgs = z.object({
  message: z.string().optional(),
  push: z.boolean().optional(),
});

// ─── Tool handlers ─────────────────────────────────────────────────────────
const tools = {
  list_items: {
    description: 'List every item in items.json (id, title, price, reserved status).',
    schema: z.object({}),
    handler: () => {
      const items = readJSON(ITEMS_PATH);
      return items.map((i) => ({
        id: i.id,
        title: i.title,
        price: i.price,
        reserved: !!i.reserved,
      }));
    },
  },

  get_item: {
    description: 'Get one item by id with all fields.',
    schema: IdArg,
    handler: (args) => {
      const items = readJSON(ITEMS_PATH);
      return items[findItem(items, args.id)];
    },
  },

  add_item: {
    description:
      'Append a new item to items.json. Generates an id from the title if not provided. ' +
      'Sets `added` to today.',
    schema: AddItemArgs,
    handler: (args) => {
      const items = readJSON(ITEMS_PATH);
      const id =
        args.id ??
        args.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 40);
      if (items.some((i) => i.id === id)) {
        throw new Error(`Item id "${id}" already exists. Pass a unique id or change the title.`);
      }
      const item = {
        id,
        title: args.title,
        price: args.price,
        tags: args.tags ?? [],
        added: todayISO(),
        ...(args.image ? { image: args.image } : {}),
        ...(args.description ? { description: args.description } : {}),
        reserved: null,
      };
      items.push(item);
      writeJSON(ITEMS_PATH, items);
      return item;
    },
  },

  update_item: {
    description: 'Patch fields on an existing item. Pass only the fields you want to change.',
    schema: UpdateItemArgs,
    handler: (args) => {
      const items = readJSON(ITEMS_PATH);
      const idx = findItem(items, args.id);
      const { id: _, ...patch } = args;
      items[idx] = { ...items[idx], ...patch };
      writeJSON(ITEMS_PATH, items);
      return items[idx];
    },
  },

  delete_item: {
    description: 'Remove an item from items.json entirely.',
    schema: IdArg,
    handler: (args) => {
      const items = readJSON(ITEMS_PATH);
      const idx = findItem(items, args.id);
      const removed = items.splice(idx, 1)[0];
      writeJSON(ITEMS_PATH, items);
      return { removed };
    },
  },

  mark_reserved: {
    description:
      'Mark an item as reserved. Defaults price to the listed price and date to today.',
    schema: MarkReservedArgs,
    handler: (args) => {
      const items = readJSON(ITEMS_PATH);
      const idx = findItem(items, args.id);
      items[idx].reserved = {
        on: args.on ?? todayISO(),
        price: args.price ?? items[idx].price,
        ...(args.note ? { note: args.note } : {}),
      };
      writeJSON(ITEMS_PATH, items);
      return items[idx];
    },
  },

  unreserve: {
    description: 'Clear the reserved field on an item (back to available).',
    schema: IdArg,
    handler: (args) => {
      const items = readJSON(ITEMS_PATH);
      const idx = findItem(items, args.id);
      items[idx].reserved = null;
      writeJSON(ITEMS_PATH, items);
      return items[idx];
    },
  },

  get_site: {
    description: 'Read site.json (sale name, location, theme, contact info, etc).',
    schema: z.object({}),
    handler: () => readJSON(SITE_PATH),
  },

  update_site: {
    description:
      'Patch fields on site.json. Pass only what you want to change. ' +
      "`contact` is merged shallowly: passing `{ email: 'x' }` keeps existing sms/whatsapp.",
    schema: UpdateSiteArgs,
    handler: (args) => {
      const site = readJSON(SITE_PATH);
      const { contact, ...rest } = args;
      Object.assign(site, rest);
      if (contact) site.contact = { ...(site.contact ?? {}), ...contact };
      writeJSON(SITE_PATH, site);
      return site;
    },
  },

  commit_and_push: {
    description:
      'git add -A, commit with the given message (default: "update yard sale"), and push to origin.',
    schema: CommitArgs,
    handler: (args) => {
      const message = args.message ?? 'update yard sale';
      const push = args.push !== false;
      execFileSync('git', ['add', '-A'], { cwd: REPO, stdio: 'pipe' });
      // status --porcelain returns empty if nothing staged.
      const status = execFileSync('git', ['status', '--porcelain'], {
        cwd: REPO,
        encoding: 'utf8',
      });
      if (!status.trim()) {
        return { committed: false, pushed: false, note: 'Nothing to commit.' };
      }
      execFileSync('git', ['commit', '-m', message], { cwd: REPO, stdio: 'pipe' });
      if (push) {
        execFileSync('git', ['push'], { cwd: REPO, stdio: 'pipe' });
      }
      return { committed: true, pushed: push, message };
    },
  },
};

// ─── Wire to MCP ───────────────────────────────────────────────────────────
const server = new Server(
  { name: 'yrdsl-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(tools).map(([name, t]) => ({
    name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.schema),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools[req.params.name];
  if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
  const args = tool.schema.parse(req.params.arguments ?? {});
  try {
    const result = await tool.handler(args);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: err.message ?? String(err) }],
    };
  }
});

// Tiny zod -> JSON-schema converter (just the cases we use, no deps).
function zodToJsonSchema(schema) {
  const def = schema._def;
  if (def.typeName === 'ZodObject') {
    const properties = {};
    const required = [];
    for (const [k, v] of Object.entries(def.shape())) {
      properties[k] = zodToJsonSchema(v);
      if (!v.isOptional()) required.push(k);
    }
    return {
      type: 'object',
      properties,
      ...(required.length ? { required } : {}),
    };
  }
  if (def.typeName === 'ZodOptional') return zodToJsonSchema(def.innerType);
  if (def.typeName === 'ZodString') return { type: 'string' };
  if (def.typeName === 'ZodNumber') return { type: 'number' };
  if (def.typeName === 'ZodBoolean') return { type: 'boolean' };
  if (def.typeName === 'ZodArray') return { type: 'array', items: zodToJsonSchema(def.type) };
  if (def.typeName === 'ZodEnum') return { type: 'string', enum: def.values };
  return {};
}

const transport = new StdioServerTransport();
await server.connect(transport);
