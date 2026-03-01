#!/usr/bin/env node
/**
 * sync-cache.mjs
 * Fetches accounts and categories (including subcategories) from the Copilot
 * API and writes:
 *   cache/accounts.json       — id → {name, type, subType, mask}
 *   cache/categories.json     — id → {name, parentId, parentName}  (flat, all levels)
 *   cache/category-tree.json  — id → {name, children: [{id, name}]}  (top-level only)
 *
 * Run manually after adding accounts or changing categories:
 *   node scripts/sync-cache.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE_DIR = path.join(ROOT, "cache");
const RUNNER = path.join(ROOT, "scripts", "copilot-gql.mjs");

fs.mkdirSync(CACHE_DIR, { recursive: true });

function run(args) {
  const result = execFileSync("node", [RUNNER, ...args], { cwd: ROOT, encoding: "utf8" });
  return JSON.parse(result);
}

// ── Accounts ──────────────────────────────────────────────────────────────────
console.error("Fetching accounts...");
const accountsData = run(["run", "Accounts", "--vars-json", JSON.stringify({ filter: null })]);
const accounts = {};
for (const acct of accountsData.data?.accounts ?? []) {
  if (acct.id && acct.name) {
    accounts[acct.id] = { name: acct.name, type: acct.type, subType: acct.subType, mask: acct.mask ?? null };
  }
}
console.error(`  → ${Object.keys(accounts).length} accounts`);

// ── Categories ────────────────────────────────────────────────────────────────
console.error("Fetching categories...");
const CAT_QUERY = path.join(CACHE_DIR, "_cats.graphql");
fs.writeFileSync(CAT_QUERY,
  `query GetCategories {\n  categories {\n    id\n    name\n    childCategories { id name __typename }\n    __typename\n  }\n}`
);
const catResult = execFileSync(
  "node", [RUNNER, "raw", "--query-file", CAT_QUERY, "--operation-name", "GetCategories"],
  { cwd: ROOT, encoding: "utf8" }
);
fs.unlinkSync(CAT_QUERY);

const rawCats = JSON.parse(catResult).data?.categories ?? [];

// Flat map: id → {name, parentId, parentName}
const categories = {};
// Tree map: id → {name, children: [{id, name}]}
const categoryTree = {};

for (const cat of rawCats) {
  if (!cat.id || !cat.name) continue;
  categories[cat.id] = { name: cat.name, parentId: null, parentName: null };
  categoryTree[cat.id] = {
    name: cat.name,
    children: (cat.childCategories ?? []).map(s => ({ id: s.id, name: s.name }))
  };
  for (const sub of cat.childCategories ?? []) {
    if (sub.id && sub.name) {
      categories[sub.id] = { name: sub.name, parentId: cat.id, parentName: cat.name };
    }
  }
}
console.error(`  → ${Object.keys(categories).length} categories (${rawCats.length} top-level)`);

// ── Write cache ───────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(CACHE_DIR, "accounts.json"), JSON.stringify(accounts, null, 2));
fs.writeFileSync(path.join(CACHE_DIR, "categories.json"), JSON.stringify(categories, null, 2));
fs.writeFileSync(path.join(CACHE_DIR, "category-tree.json"), JSON.stringify(categoryTree, null, 2));
console.error("Cache written to cache/accounts.json, cache/categories.json, cache/category-tree.json");
console.log(JSON.stringify({ accounts: Object.keys(accounts).length, categories: Object.keys(categories).length }));
