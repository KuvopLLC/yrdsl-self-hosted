#!/usr/bin/env node
/**
 * Import a yrdsl export ZIP into this self-hosted repo. Symmetric with
 * the hosted-side POST /sales/import: same schemas, same strictness.
 *
 * Usage:
 *   pnpm import ~/Downloads/my-sale.zip
 *   pnpm import --force ~/Downloads/my-sale.zip
 *
 * The default run refuses to overwrite without first moving the existing
 * `site.json`, `items.json`, and the entire `public/photos/` directory
 * into `.yrdsl-backup/<timestamp>/`. Pass `--force` to skip the backup.
 *
 * Other files under `public/` (CNAME, favicon, etc.) are left alone.
 *
 * Does NOT auto-commit. Prints a suggested `git add -A && git diff --staged`
 * so the user reviews before pushing.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ─── Args ───────────────────────────────────────────────────────────────
const rawArgs = process.argv.slice(2);
let force = false;
const positional = [];
for (const a of rawArgs) {
  if (a === '--force') force = true;
  else if (a === '-h' || a === '--help') {
    console.log(
      'Usage: pnpm import [--force] <path-to-zip>\n' +
        '  Imports a yrdsl export ZIP into this repo. Backs up existing\n' +
        '  site.json / items.json / public/photos/* before overwriting.\n' +
        '  --force skips the backup.',
    );
    process.exit(0);
  } else positional.push(a);
}
if (positional.length !== 1) {
  console.error('Expected exactly one argument: path to the ZIP file.');
  console.error('Run `pnpm import --help` for usage.');
  process.exit(2);
}
const zipPath = resolve(positional[0]);
if (!existsSync(zipPath)) {
  console.error(`No such file: ${zipPath}`);
  process.exit(2);
}

// ─── Schemas (inline; mirrors validate.mjs fallback) ────────────────────
const ReservationInfo = z.object({
  on: z.string(),
  price: z.number(),
  note: z.string().optional(),
});
const SaleItem = z.object({
  id: z.string(),
  slug: z.string().optional(),
  title: z.string(),
  price: z.number(),
  tags: z.array(z.string()).default([]),
  added: z.string(),
  image: z.string().optional(),
  images: z.array(z.string()).optional(),
  description: z.string().optional(),
  reserved: ReservationInfo.nullable().optional(),
  sortOrder: z.number().int().optional(),
  updatedAt: z.string().optional(),
});
const SaleContact = z.object({
  email: z.string().email().optional(),
  sms: z.string().optional(),
  whatsapp: z.string().optional(),
  useRelay: z.boolean().optional(),
  notes: z.string().optional(),
});
const SaleSite = z
  .object({
    siteName: z.string(),
    subtitle: z.string().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    endsAt: z.string().optional(),
    contact: SaleContact.optional(),
    theme: z.enum(['conservative', 'retro', 'hip', 'artsy']).default('conservative'),
    currency: z.string().length(3).default('USD'),
    language: z.string().default('en'),
  })
  .passthrough();

// ─── Unzip ──────────────────────────────────────────────────────────────
const zipBytes = new Uint8Array(readFileSync(zipPath));
let entries;
try {
  entries = unzipSync(zipBytes);
} catch (e) {
  console.error(`❌ Not a valid ZIP: ${e.message}`);
  process.exit(1);
}

const issues = [];
const siteBytes = entries['site.json'];
const itemsBytes = entries['items.json'];
if (!siteBytes) issues.push({ path: 'site.json', msg: 'missing from ZIP' });
if (!itemsBytes) issues.push({ path: 'items.json', msg: 'missing from ZIP' });
if (issues.length) fail(issues);

let site;
let items;
try {
  site = JSON.parse(new TextDecoder().decode(siteBytes));
} catch (e) {
  issues.push({ path: 'site.json', msg: `JSON parse: ${e.message}` });
}
try {
  items = JSON.parse(new TextDecoder().decode(itemsBytes));
} catch (e) {
  issues.push({ path: 'items.json', msg: `JSON parse: ${e.message}` });
}
if (issues.length) fail(issues);

const siteR = SaleSite.safeParse(site);
if (!siteR.success) {
  for (const z of siteR.error.issues) {
    issues.push({
      path: `site.json${z.path.length ? `.${z.path.join('.')}` : ''}`,
      msg: z.message,
    });
  }
}
const itemsR = SaleItem.array().safeParse(items);
if (!itemsR.success) {
  for (const z of itemsR.error.issues) {
    issues.push({
      path: `items.json${z.path.length ? `[${z.path.join('].[')}]` : ''}`,
      msg: z.message,
    });
  }
}
if (issues.length) fail(issues);

// ─── Photo refs must resolve inside the ZIP ─────────────────────────────
// Self-hosted convention (from validate.mjs): leading slash OK, external
// http(s) pass through, everything else looks in `public/`.
let photoCount = 0;
for (let i = 0; i < itemsR.data.length; i++) {
  const item = itemsR.data[i];
  const refs = [];
  if (item.image) refs.push({ field: 'image', ref: item.image });
  (item.images ?? []).forEach((r, j) => refs.push({ field: `images[${j}]`, ref: r }));
  for (const { field, ref } of refs) {
    if (ref.startsWith('http://') || ref.startsWith('https://')) continue;
    const stripped = ref.replace(/^\//, '');
    const zipKey = `public/${stripped}`;
    if (!entries[zipKey]) {
      issues.push({
        path: `items.json[${i}].${field}`,
        msg: `references ${ref} but ${zipKey} is not in the ZIP`,
      });
    } else {
      photoCount++;
    }
  }
}
if (issues.length) fail(issues);

// ─── Backup existing files ──────────────────────────────────────────────
const existingSite = resolve(root, 'site.json');
const existingItems = resolve(root, 'items.json');
const photosDir = resolve(root, 'public/photos');

if (!force) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backup = resolve(root, '.yrdsl-backup', stamp);
  mkdirSync(backup, { recursive: true });
  if (existsSync(existingSite)) renameSync(existingSite, join(backup, 'site.json'));
  if (existsSync(existingItems)) renameSync(existingItems, join(backup, 'items.json'));
  if (existsSync(photosDir)) {
    mkdirSync(join(backup, 'public'), { recursive: true });
    renameSync(photosDir, join(backup, 'public', 'photos'));
  }
  console.log(`backed up prior files to ${backup.replace(`${root}/`, '')}`);
} else {
  console.log('--force: skipping backup.');
}

// ─── Write new files ────────────────────────────────────────────────────
writeFileSync(existingSite, new TextDecoder().decode(siteBytes));
writeFileSync(existingItems, new TextDecoder().decode(itemsBytes));

mkdirSync(photosDir, { recursive: true });
// Ensure any other public/ paths in the ZIP also land, in case the hosted
// exporter starts bundling non-photo assets later.
let writtenFiles = 0;
for (const [key, bytes] of Object.entries(entries)) {
  if (!key.startsWith('public/')) continue;
  const dest = resolve(root, key);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
  writtenFiles++;
}

// ─── Summary ────────────────────────────────────────────────────────────
console.log('');
console.log(`✅ imported ${itemsR.data.length} items · ${photoCount} photo refs ·`);
console.log(`   ${writtenFiles} public/ file(s) written.`);
console.log('');
console.log('Review the diff before committing:');
console.log('  git add -A');
console.log('  git diff --staged | less');
console.log('  git commit -m "import from zip"');

// ─── Helpers ────────────────────────────────────────────────────────────
function fail(list) {
  console.error(`❌ Import rejected (${list.length} issue${list.length === 1 ? '' : 's'}):`);
  for (const i of list) console.error(`  ${i.path}: ${i.msg}`);
  process.exit(1);
}
