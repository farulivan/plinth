#!/usr/bin/env node
// I sum the JS and CSS a tenant build actually asks the browser to load and
// compare the totals against bundle-budget.json, failing non-zero when over.
// Pass --write to rebaseline after intentional growth. The built site's
// directory is the first positional argument.
//
// I rejected size-limit, bundlewatch and bundle-stats: each needs a config
// language or an account token for an extra check that this covers. The point
// of the gate is "did the bundle suddenly bloat?", which compares cleanly
// against a committed JSON.
//
// Unlike the norven original this walks the emitted HTML and counts only
// referenced assets, rather than summing dist/_astro/* wholesale. Astro emits
// its React client runtime (~190 KB) whenever the react integration is
// registered, even though every renderer component is server-rendered and no
// page carries a `client:` directive — so nothing ever fetches it. Counting it
// would fail the gate over bytes no visitor transfers, and the obvious way to
// "fix" that failure would be to delete something that is actually shipping.

import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const budgetPath = fileURLToPath(new URL("../bundle-budget.json", import.meta.url));
const writeMode = process.argv.includes("--write");
const distDir = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

if (!distDir) {
  console.error("usage: check-bundle-budget.mjs <dist-dir> [--write]");
  process.exit(1);
}

const human = (n) => `${(n / 1024).toFixed(1)} KB`;

async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else found.push(full);
  }
  return found;
}

/** Every /_astro asset the HTML references, whether as a module script, a
 * stylesheet, or a modulepreload hint — a preloaded chunk is transferred even
 * though it carries no `src`. */
function referencedAssets(html) {
  const refs = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/_astro\/[^"]+\.(?:js|css))"/g)) {
    refs.add(match[1]);
  }
  return refs;
}

let files;
try {
  files = await walk(distDir);
} catch (err) {
  if (err && err.code === "ENOENT") {
    console.error(`${distDir} not found — build the tenant fixture first.`);
    process.exit(1);
  }
  throw err;
}

const pages = files.filter((file) => file.endsWith(".html"));
if (pages.length === 0) {
  console.error(`No HTML found under ${distDir} — nothing to measure.`);
  process.exit(1);
}

const referenced = new Set();
for (const page of pages) {
  for (const ref of referencedAssets(await readFile(page, "utf8"))) referenced.add(ref);
}

const totals = { js: 0, css: 0 };
for (const ref of referenced) {
  const full = join(distDir, ref.slice(1));
  const ext = ref.split(".").pop();
  if (ext !== "js" && ext !== "css") continue;
  totals[ext] += (await stat(full)).size;
}

const orphaned = files
  .filter((file) => /\.(js|css)$/.test(file))
  .filter((file) => !referenced.has(`/${relative(distDir, file)}`));

if (writeMode) {
  const next = {
    _comment:
      "Bundle size budgets in bytes for the JS/CSS a tenant build references. Re-baseline with `pnpm check:bundle <dist> --write`.",
    js: totals.js,
    css: totals.css,
  };
  await writeFile(budgetPath, JSON.stringify(next, null, 2) + "\n");
  console.warn(`Wrote bundle-budget.json — JS ${human(totals.js)}, CSS ${human(totals.css)}`);
  process.exit(0);
}

const budget = JSON.parse(await readFile(budgetPath, "utf8"));
let failed = false;
for (const ext of ["js", "css"]) {
  const actual = totals[ext];
  const max = budget[ext];
  const pct = Math.round((actual / max) * 100);
  const label = `${ext.toUpperCase()}: ${human(actual)} / ${human(max)} (${pct}%)`;
  if (actual > max) {
    console.error(`✗ ${label} — over budget by ${human(actual - max)}`);
    failed = true;
  } else {
    console.warn(`✓ ${label}`);
  }
}

console.warn(`  measured across ${pages.length} page(s), ${referenced.size} referenced asset(s)`);
for (const file of orphaned) {
  console.warn(`  not referenced by any page, excluded: ${relative(distDir, file)}`);
}

if (failed) {
  console.error("");
  console.error("If the growth is intentional, rebaseline with:");
  console.error(`  pnpm check:bundle ${distDir} --write`);
  process.exit(1);
}
