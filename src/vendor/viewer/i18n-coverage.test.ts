import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ja from './locales/ja.json';
import pt from './locales/pt.json';
import zh from './locales/zh.json';

/**
 * i18n coverage test: validates that all translation keys used in code
 * have corresponding entries in all locale files, and that all locale
 * entries are actually used in the codebase.
 */

const LOCALES = { en, de, es, fr, ja, pt, zh };

function scanCodeForKeys(): Set<string> {
  const keys = new Set<string>();
  const srcDir = join(__dirname);

  // Scan all TypeScript/JavaScript files for t() and tPlural() calls
  function scanDir(dir: string) {
    const files = readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = join(dir, file.name);

      // Skip node_modules, test files, and i18n files themselves
      if (
        file.name.startsWith('.') ||
        file.name === 'node_modules' ||
        file.name === 'locales' ||
        file.name.endsWith('.test.ts')
      ) {
        continue;
      }

      if (file.isDirectory()) {
        scanDir(fullPath);
      } else if (file.isFile() && (file.name.endsWith('.ts') || file.name.endsWith('.tsx'))) {
        try {
          const content = readFileSync(fullPath, 'utf8');

          // Match t('key.path', ...) or t("key.path", ...) or tPlural('key.path', ...)
          const tMatches = content.match(/\bt\(['"`]([\w.]+)['"`]/g) || [];
          for (const m of tMatches) {
            const key = m.match(/['"`]([\w.]+)['"`]/)?.[1];
            if (key) keys.add(key);
          }

          // Also match t(expr as MessageKey, ...) where expr is a string literal
          const tAsMatches = content.match(/\bt\(['"]([\w.]+)['"] as MessageKey/g) || [];
          for (const m of tAsMatches) {
            const key = m.match(/['"]([\w.]+)['"]/)?.[1];
            if (key) keys.add(key);
          }

          // tPlural calls use dynamic keys like `${baseKey}_${rule}`
          // but we can look for the base keys referenced
          const tPluralMatches = content.match(/\btPlural\(['"`]([\w.]+)['"`]/g) || [];
          for (const m of tPluralMatches) {
            const key = m.match(/['"`]([\w.]+)['"`]/)?.[1];
            if (key) {
              // tPlural appends _one, _other, _zero etc based on plural rules
              keys.add(`${key}_one`);
              keys.add(`${key}_other`);
            }
          }
        } catch {
          // Skip files that can't be read
        }
      }
    }
  }

  scanDir(srcDir);
  return keys;
}

describe('i18n: translation coverage', () => {
  const codeKeys = scanCodeForKeys();
  const enKeys = Object.keys(en as Record<string, unknown>);
  const allLocaleKeys = new Map(
    Object.entries(LOCALES).map(([locale, catalog]) => [
      locale,
      new Set(Object.keys(catalog as Record<string, unknown>)),
    ]),
  );

  it('all keys in code have translations in all locales', () => {
    const missing: Record<string, string[]> = {};

    for (const key of codeKeys) {
      for (const [locale, keys] of allLocaleKeys) {
        if (!keys.has(key)) {
          if (!missing[key]) missing[key] = [];
          missing[key].push(locale);
        }
      }
    }

    if (Object.keys(missing).length > 0) {
      const report = Object.entries(missing)
        .map(([key, locales]) => `  ${key}: missing in ${locales.join(', ')}`)
        .join('\n');
      expect.fail(
        `Missing translations:\n${report}\n\nAdd them to packages/viewer/src/locales/{locale}.json`,
      );
    }
  });

  it('all keys in locales are used in code', () => {
    const unused = enKeys.filter((key) => !codeKeys.has(key));

    if (unused.length > 0) {
      const report = unused.map((key) => `  ${key}`).join('\n');
      expect.fail(
        `Unused translation keys in en.json:\n${report}\n\nRemove them or add code that uses them.`,
      );
    }
  });

  it('all locales have the same keys as English', () => {
    const enSet = new Set(enKeys);
    const issues: string[] = [];

    for (const [locale, keys] of allLocaleKeys) {
      if (locale === 'en') continue;

      const missing = enKeys.filter((k) => !keys.has(k));
      const extra = Array.from(keys).filter((k) => !enSet.has(k));

      if (missing.length > 0) {
        issues.push(`${locale}: missing keys ${missing.map((k) => `'${k}'`).join(', ')}`);
      }
      if (extra.length > 0) {
        issues.push(`${locale}: extra keys ${extra.map((k) => `'${k}'`).join(', ')}`);
      }
    }

    if (issues.length > 0) {
      expect.fail(`Locale inconsistencies:\n  ${issues.join('\n  ')}`);
    }
  });
});
