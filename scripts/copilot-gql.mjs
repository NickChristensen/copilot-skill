#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ENV_PATH = path.join(ROOT, ".env");
const OPERATIONS_DIR = path.join(ROOT, "references", "runtime", "copilot-api", "operations");
const REQUESTS_DIR = path.join(ROOT, "references", "runtime", "copilot-api", "examples", "requests");
const CACHE_DIR = path.join(ROOT, "cache");
const ENUM_VALUES_PATH = path.join(ROOT, "references", "runtime", "copilot-api", "enum-values.json");
const SEMANTICS_PATH = path.join(ROOT, "references", "runtime", "copilot-api", "operation-semantics.json");
const GRAPHQL_URL = "https://app.copilot.money/api/graphql";
const TOKEN_URL = "https://securetoken.googleapis.com/v1/token";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUIRED_CACHE_FILES = ["accounts.json", "categories.json", "category-tree.json", "recurrings.json"];

function printHelp() {
  console.log(`copilot-gql: run Copilot Money GraphQL operations

Usage:
  copilot-gql list [--descriptions]
  copilot-gql show <OperationName>
  copilot-gql run <OperationName> [--vars-json '<json>' | --vars-file <file>] [--operation-name <name>] [--no-hydrate] [--refresh-cache | --no-refresh]
  copilot-gql raw --query-file <file> [--vars-json '<json>' | --vars-file <file>] [--operation-name <name>] [--no-hydrate] [--refresh-cache | --no-refresh]
  copilot-gql refresh-cache
  copilot-gql token
  copilot-gql help

Examples:
  copilot-gql list
  copilot-gql list --descriptions
  copilot-gql show TransactionsFeed
  copilot-gql run TransactionsFeed
  copilot-gql run TransactionsFeed --no-hydrate
  copilot-gql run TransactionsFeed --refresh-cache
  copilot-gql run TransactionsFeed --vars-json '{"filter":{"dates":[{"start":"2026-02-01","end":"2026-02-28"}]}}'
  copilot-gql run TransactionSummary --vars-json '{"filter":{}}'
  copilot-gql raw --query-file ./references/runtime/copilot-api/operations/Tags.graphql --vars-file ./references/runtime/copilot-api/examples/requests/Tags.request.json
  copilot-gql refresh-cache
`);
}

function fail(message, code = 1) {
  console.error(`Error: ${message}`);
  process.exit(code);
}

function parseDotEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnv() {
  const parsed = parseDotEnv(ENV_PATH);
  if (!process.env.COPILOT_API_KEY && parsed.COPILOT_API_KEY) process.env.COPILOT_API_KEY = parsed.COPILOT_API_KEY;
  if (!process.env.COPILOT_REFRESH_TOKEN && parsed.COPILOT_REFRESH_TOKEN) process.env.COPILOT_REFRESH_TOKEN = parsed.COPILOT_REFRESH_TOKEN;
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function loadVars(opts, fallbackOperationName) {
  if (opts["vars-json"]) {
    try {
      return JSON.parse(opts["vars-json"]);
    } catch {
      fail("--vars-json must be valid JSON");
    }
  }
  if (opts["vars-file"]) {
    const fp = path.resolve(process.cwd(), String(opts["vars-file"]));
    if (!fs.existsSync(fp)) fail(`vars file not found: ${fp}`);
    const body = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (body && typeof body === "object" && "variables" in body) return body.variables ?? {};
    return body;
  }
  if (fallbackOperationName) {
    const reqPath = path.join(REQUESTS_DIR, `${fallbackOperationName}.request.json`);
    if (fs.existsSync(reqPath)) {
      const body = JSON.parse(fs.readFileSync(reqPath, "utf8"));
      if (body && typeof body === "object" && "variables" in body) return body.variables ?? {};
    }
  }
  return {};
}

function utcMidnightSecondsFromDateOnly(value) {
  if (typeof value !== "string") return value;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    fail(`invalid date-only value: ${value}`);
  }

  return Math.floor(date.getTime() / 1000);
}

function normalizeTransactionDateFilters(variables) {
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) return variables;

  const dates = variables.filter?.dates;
  if (!Array.isArray(dates)) return variables;

  return {
    ...variables,
    filter: {
      ...variables.filter,
      dates: dates.map((range) => {
        if (!range || typeof range !== "object" || Array.isArray(range)) return range;
        return {
          ...range,
          start: utcMidnightSecondsFromDateOnly(range.start),
          end: utcMidnightSecondsFromDateOnly(range.end)
        };
      })
    }
  };
}

function loadQueryFromOperation(op) {
  const queryPath = path.join(OPERATIONS_DIR, `${op}.graphql`);
  if (!fs.existsSync(queryPath)) {
    fail(`operation query file not found: ${queryPath}`);
  }
  return fs.readFileSync(queryPath, "utf8");
}

function loadQueryFromFile(fp) {
  const full = path.resolve(process.cwd(), fp);
  if (!fs.existsSync(full)) fail(`query file not found: ${full}`);
  return fs.readFileSync(full, "utf8");
}

function loadSemanticsRegistry() {
  if (!fs.existsSync(SEMANTICS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(SEMANTICS_PATH, "utf8"));
  } catch {
    return null;
  }
}

function listOperations(showDescriptions = false) {
  if (!fs.existsSync(OPERATIONS_DIR)) {
    fail(`operations directory not found: ${OPERATIONS_DIR}`);
  }
  const semantics = showDescriptions ? loadSemanticsRegistry() : null;
  const ops = fs
    .readdirSync(OPERATIONS_DIR)
    .filter((f) => f.endsWith(".graphql"))
    .map((f) => f.replace(/\.graphql$/, ""))
    .sort((a, b) => a.localeCompare(b));
  for (const op of ops) {
    if (!showDescriptions) {
      console.log(op);
      continue;
    }
    const desc = semantics?.operations?.[op]?.description || "";
    if (desc) {
      console.log(`${op}\t${desc}`);
    } else {
      console.log(op);
    }
  }
}

function printSemantics(op) {
  const semantics = loadSemanticsRegistry();
  const entry = semantics?.operations?.[op];
  if (!entry) return;

  if (entry.description) {
    console.log(`description: ${entry.description}`);
  }
  if (Array.isArray(entry.good_for) && entry.good_for.length > 0) {
    console.log("good_for:");
    for (const item of entry.good_for) {
      console.log(`  - ${item}`);
    }
  }
  if (Array.isArray(entry.related) && entry.related.length > 0) {
    console.log(`related: ${entry.related.join(", ")}`);
  }
}

function showOperation(op) {
  const queryPath = path.join(OPERATIONS_DIR, `${op}.graphql`);
  if (!fs.existsSync(queryPath)) fail(`operation query file not found: ${queryPath}`);
  const reqPath = path.join(REQUESTS_DIR, `${op}.request.json`);
  const query = fs.readFileSync(queryPath, "utf8");

  console.log(`operation: ${op}`);
  console.log(`query_file: ${queryPath}`);
  if (fs.existsSync(reqPath)) {
    const body = JSON.parse(fs.readFileSync(reqPath, "utf8"));
    console.log(`request_file: ${reqPath}`);
    console.log(`variables: ${JSON.stringify(body.variables ?? {}, null, 2)}`);
  } else {
    console.log("request_file: (none)");
    console.log("variables: {}");
  }
  printSemantics(op);
  printEnumHints(query);
  console.log("query:");
  console.log(query);
}

function normalizeGraphqlType(typeName) {
  return typeName.replace(/[!\[\]\s]/g, "");
}

function extractOperationVariables(query) {
  const out = [];
  const headerMatch = query.match(/^(query|mutation)\s+\w+\s*\(([\s\S]*?)\)\s*\{/m);
  if (!headerMatch) return out;
  const varsBlock = headerMatch[2];
  const rx = /\$(\w+)\s*:\s*([A-Za-z0-9_!\[\]]+)/g;
  let m;
  while ((m = rx.exec(varsBlock)) !== null) {
    out.push({
      name: m[1],
      declaredType: m[2],
      baseType: normalizeGraphqlType(m[2])
    });
  }
  return out;
}

function loadEnumRegistry() {
  if (!fs.existsSync(ENUM_VALUES_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(ENUM_VALUES_PATH, "utf8"));
  } catch {
    return null;
  }
}

function printEnumHints(query) {
  const registry = loadEnumRegistry();
  if (!registry) return;
  const vars = extractOperationVariables(query);
  if (vars.length === 0) return;

  const hints = [];
  for (const v of vars) {
    const fromType = registry.byEnumType?.[v.baseType];
    const byVar = registry.byVariableName?.[v.name];
    const fromVarType = byVar?.enumType ? registry.byEnumType?.[byVar.enumType] : null;
    const values = fromType?.values || fromVarType?.values;
    if (!values || values.length === 0) continue;
    hints.push({
      variable: v.name,
      type: v.baseType,
      enumType: fromType ? v.baseType : byVar.enumType,
      values
    });
  }

  if (hints.length === 0) return;
  console.log("enum_hints:");
  for (const h of hints) {
    console.log(`  $${h.variable} (${h.type}) -> ${h.enumType}: ${h.values.join(", ")}`);
  }
}

function cachePath(file) {
  return path.join(CACHE_DIR, file);
}

function inspectCacheFreshness({ force = false } = {}) {
  if (force) {
    return { shouldRefresh: true, reason: "forced" };
  }

  const now = Date.now();
  const missing = [];
  const stale = [];

  for (const file of REQUIRED_CACHE_FILES) {
    const fp = cachePath(file);
    if (!fs.existsSync(fp)) {
      missing.push(file);
      continue;
    }
    const ageMs = now - fs.statSync(fp).mtimeMs;
    if (ageMs > CACHE_MAX_AGE_MS) stale.push(file);
  }

  if (missing.length > 0) {
    return { shouldRefresh: true, reason: `missing ${missing.join(", ")}` };
  }
  if (stale.length > 0) {
    return { shouldRefresh: true, reason: `stale ${stale.join(", ")}` };
  }
  return { shouldRefresh: false, reason: "fresh" };
}

function loadCache({ failOnMissing = true } = {}) {
  const accountsPath = cachePath("accounts.json");
  const categoriesPath = cachePath("categories.json");
  const recurringsPath = cachePath("recurrings.json");

  const missing = [];
  if (!fs.existsSync(accountsPath)) missing.push("accounts.json");
  if (!fs.existsSync(categoriesPath)) missing.push("categories.json");
  if (!fs.existsSync(recurringsPath)) missing.push("recurrings.json");

  if (missing.length > 0) {
    if (!failOnMissing) {
      console.error(`⚠️  Cache files missing: ${missing.join(", ")}. Output will not be hydrated.`);
      return null;
    }
    fail(
      `Cache files missing: ${missing.join(", ")}.\n` +
      `Run: node scripts/copilot-gql.mjs refresh-cache\n` +
      `Then retry your command.`
    );
  }

  try {
    const accounts = JSON.parse(fs.readFileSync(accountsPath, "utf8"));
    const categories = JSON.parse(fs.readFileSync(categoriesPath, "utf8"));
    const recurrings = JSON.parse(fs.readFileSync(recurringsPath, "utf8"));

    return { accounts, categories, recurrings };
  } catch (err) {
    if (!failOnMissing) {
      console.error(`⚠️  Failed to read cache files: ${err?.message || String(err)}. Output will not be hydrated.`);
      return null;
    }
    throw err;
  }
}

function hydrateTransaction(tx, { accounts, categories, recurrings }) {
  const hydrated = { ...tx };

  // Hydrate account name
  if (tx.accountId) {
    if (accounts[tx.accountId]) {
      hydrated.accountName = accounts[tx.accountId].name;
    } else {
      console.error(`⚠️  Missing cache key: accountId "${tx.accountId}". Run: node scripts/copilot-gql.mjs refresh-cache`);
    }
  }

  // Hydrate category display with emoji
  if (tx.categoryId) {
    if (categories[tx.categoryId]) {
      const { emoji, name } = categories[tx.categoryId];
      hydrated.categoryDisplay = `${emoji || ""} ${name}`;
    } else {
      console.error(`⚠️  Missing cache key: categoryId "${tx.categoryId}". Run: node scripts/copilot-gql.mjs refresh-cache`);
    }
  }

  // Hydrate display name from recurring
  if (tx.recurringId) {
    if (recurrings[tx.recurringId]) {
      const {emoji, name} = recurrings[tx.recurringId];
      hydrated.displayName = `${emoji} ${name} (${tx.name})`;
    } else {
      console.error(`⚠️  Missing cache key: recurringId "${tx.recurringId}". Run: node scripts/copilot-gql.mjs refresh-cache`);
      hydrated.displayName = tx.name;
    }
  } else {
    hydrated.displayName = tx.name;
  }

  return hydrated;
}

function isTransaction(obj) {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.id === "string" &&
    typeof obj.accountId === "string" &&
    typeof obj.categoryId === "string" &&
    typeof obj.date === "string"
  );
}

function hydrateResponse(data, cache) {
  if (!data || typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map(item => hydrateResponse(item, cache));
  }

  if (isTransaction(data)) {
    return hydrateTransaction(data, cache);
  }

  const result = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = hydrateResponse(value, cache);
  }
  return result;
}

async function refreshIdToken() {
  const apiKey = process.env.COPILOT_API_KEY;
  const refreshToken = process.env.COPILOT_REFRESH_TOKEN;
  if (!apiKey || !refreshToken) {
    fail("missing COPILOT_API_KEY or COPILOT_REFRESH_TOKEN (set env vars or .env)");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const res = await fetch(`${TOKEN_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.id_token) {
    const msg = json?.error?.message || `token refresh failed (${res.status})`;
    fail(msg);
  }
  return { idToken: json.id_token, expiresIn: json.expires_in };
}

async function requestGraphql({ operationName, query, variables }) {
  const { idToken } = await refreshIdToken();
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({ operationName, variables, query })
  });

  const txt = await res.text();
  if (!res.ok) {
    throw new Error(`graphql request failed (${res.status}): ${txt.slice(0, 500)}`);
  }

  const json = JSON.parse(txt);
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    const messages = json.errors
      .map((err) => err?.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(`graphql ${operationName} returned errors: ${messages || JSON.stringify(json.errors).slice(0, 500)}`);
  }

  return json;
}

function expectArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`cache refresh expected ${label} to be an array`);
  }
  return value;
}

function writeJsonAtomic(file, value) {
  const target = cachePath(file);
  const tmp = path.join(CACHE_DIR, `.${file}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, target);
}

async function refreshCache() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  console.error("Refreshing cache...");

  const accountsQuery = loadQueryFromOperation("Accounts");
  const recurringsQuery = loadQueryFromOperation("Recurrings");
  const categoriesQuery = `query GetCategories {
  categories {
    id
    name
    icon {
      ... on EmojiUnicode {
        unicode
        __typename
      }
      __typename
    }
    childCategories {
      id
      name
      icon {
        ... on EmojiUnicode {
          unicode
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
}`;

  const [accountsData, categoriesData, recurringsData] = await Promise.all([
    requestGraphql({
      operationName: "Accounts",
      query: accountsQuery,
      variables: { filter: null }
    }),
    requestGraphql({
      operationName: "GetCategories",
      query: categoriesQuery,
      variables: {}
    }),
    requestGraphql({
      operationName: "Recurrings",
      query: recurringsQuery,
      variables: {}
    })
  ]);

  const rawAccounts = expectArray(accountsData.data?.accounts, "data.accounts");
  const rawCats = expectArray(categoriesData.data?.categories, "data.categories");
  const rawRecurrings = expectArray(recurringsData.data?.recurrings, "data.recurrings");

  const accounts = {};
  for (const acct of rawAccounts) {
    if (acct.id && acct.name) {
      accounts[acct.id] = { name: acct.name, type: acct.type, subType: acct.subType, mask: acct.mask ?? null };
    }
  }

  const categories = {};
  const categoryTree = {};
  for (const cat of rawCats) {
    if (!cat.id || !cat.name) continue;
    const parentEmoji = cat.icon?.unicode ?? null;
    categories[cat.id] = { name: cat.name, parentId: null, parentName: null, emoji: parentEmoji };
    categoryTree[cat.id] = {
      name: cat.name,
      emoji: parentEmoji,
      children: (cat.childCategories ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        emoji: s.icon?.unicode ?? null
      }))
    };
    for (const sub of cat.childCategories ?? []) {
      if (sub.id && sub.name) {
        categories[sub.id] = {
          name: sub.name,
          parentId: cat.id,
          parentName: cat.name,
          emoji: sub.icon?.unicode ?? null
        };
      }
    }
  }

  const recurrings = {};
  for (const r of rawRecurrings) {
    if (r.id && r.name) {
      recurrings[r.id] = {
        name: r.name,
        emoji: r.icon?.unicode,
        frequency: r.frequency,
        amount: r.nextPaymentAmount,
        categoryId: r.categoryId,
        state: r.state
      };
    }
  }

  writeJsonAtomic("accounts.json", accounts);
  writeJsonAtomic("categories.json", categories);
  writeJsonAtomic("category-tree.json", categoryTree);
  writeJsonAtomic("recurrings.json", recurrings);

  console.error(
    `Cache refreshed: ${Object.keys(accounts).length} accounts, ` +
    `${Object.keys(categories).length} categories, ${Object.keys(recurrings).length} recurrings`
  );

  return {
    accounts: Object.keys(accounts).length,
    categories: Object.keys(categories).length,
    recurrings: Object.keys(recurrings).length
  };
}

function maybeRefreshCache(args, hydrate) {
  if (args["no-refresh"]) return Promise.resolve({ refreshed: false, skipped: true });
  if (!hydrate && !args["refresh-cache"]) return Promise.resolve({ refreshed: false, skipped: true });

  const freshness = inspectCacheFreshness({ force: Boolean(args["refresh-cache"]) });
  if (!freshness.shouldRefresh) return Promise.resolve({ refreshed: false, skipped: false });

  console.error(`Cache refresh started (${freshness.reason})...`);
  return refreshCache()
    .then((result) => ({ refreshed: true, ...result }))
    .catch((err) => {
      console.error(`⚠️  Cache refresh failed: ${err?.message || String(err)}. Continuing with existing cache.`);
      return { refreshed: false, failed: true };
    });
}

async function executeGraphql({ operationName, query, variables }, { hydrate = true, args = {} } = {}) {
  const cacheRefresh = maybeRefreshCache(args, hydrate);
  const data = await requestGraphql({ operationName, query, variables });

  if (hydrate) {
    await cacheRefresh;
    const cache = loadCache({ failOnMissing: false });
    if (!cache) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    const hydrated = hydrateResponse(data, cache);
    console.log(JSON.stringify(hydrated, null, 2));
  } else {
    await cacheRefresh;
    console.log(JSON.stringify(data));
  }
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }

  if (cmd === "token") {
    const tok = await refreshIdToken();
    console.log(JSON.stringify({ ok: true, expires_in: tok.expiresIn }, null, 2));
    return;
  }

  if (cmd === "refresh-cache") {
    const result = await refreshCache();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === "list") {
    listOperations(Boolean(args.descriptions));
    return;
  }

  if (cmd === "show") {
    const op = args._[1];
    if (!op) fail("missing operation name for show");
    showOperation(op);
    return;
  }

  if (cmd === "run") {
    const op = args._[1];
    if (!op) fail("missing operation name for run");
    const query = loadQueryFromOperation(op);
    const variables = normalizeTransactionDateFilters(loadVars(args, op));
    const operationName = String(args["operation-name"] || op);
    await executeGraphql({ operationName, query, variables }, { hydrate: !args["no-hydrate"], args });
    return;
  }

  if (cmd === "raw") {
    const queryFile = args["query-file"];
    if (!queryFile) fail("missing --query-file for raw");
    const query = loadQueryFromFile(String(queryFile));
    const variables = normalizeTransactionDateFilters(loadVars(args));
    const operationName = String(args["operation-name"] || "RawOperation");
    await executeGraphql({ operationName, query, variables }, { hydrate: !args["no-hydrate"], args });
    return;
  }

  fail(`unknown command: ${cmd}`);
}

main().catch((err) => fail(err?.message || String(err)));
