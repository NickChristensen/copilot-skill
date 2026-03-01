#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ENV_PATH = path.join(ROOT, ".env");
const OPERATIONS_DIR = path.join(ROOT, "references", "runtime", "copilot-api", "operations");
const REQUESTS_DIR = path.join(ROOT, "references", "runtime", "copilot-api", "examples", "requests");
const ENUM_VALUES_PATH = path.join(ROOT, "references", "runtime", "copilot-api", "enum-values.json");
const SEMANTICS_PATH = path.join(ROOT, "references", "runtime", "copilot-api", "operation-semantics.json");
const GRAPHQL_URL = "https://app.copilot.money/api/graphql";
const TOKEN_URL = "https://securetoken.googleapis.com/v1/token";

function printHelp() {
  console.log(`copilot-gql: run Copilot Money GraphQL operations

Usage:
  copilot-gql list [--descriptions]
  copilot-gql show <OperationName>
  copilot-gql run <OperationName> [--vars-json '<json>' | --vars-file <file>] [--operation-name <name>]
  copilot-gql raw --query-file <file> [--vars-json '<json>' | --vars-file <file>] [--operation-name <name>]
  copilot-gql token
  copilot-gql help

Examples:
  copilot-gql list
  copilot-gql list --descriptions
  copilot-gql show TransactionsFeed
  copilot-gql run TransactionsFeed
  copilot-gql run TransactionSummary --vars-json '{"filter":{}}'
  copilot-gql raw --query-file ./references/runtime/copilot-api/operations/Tags.graphql --vars-file ./references/runtime/copilot-api/examples/requests/Tags.request.json
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

async function executeGraphql({ operationName, query, variables }) {
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
    fail(`graphql request failed (${res.status}): ${txt.slice(0, 500)}`);
  }
  console.log(txt);
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
    const variables = loadVars(args, op);
    const operationName = String(args["operation-name"] || op);
    await executeGraphql({ operationName, query, variables });
    return;
  }

  if (cmd === "raw") {
    const queryFile = args["query-file"];
    if (!queryFile) fail("missing --query-file for raw");
    const query = loadQueryFromFile(String(queryFile));
    const variables = loadVars(args);
    const operationName = String(args["operation-name"] || "RawOperation");
    await executeGraphql({ operationName, query, variables });
    return;
  }

  fail(`unknown command: ${cmd}`);
}

main().catch((err) => fail(err?.message || String(err)));
