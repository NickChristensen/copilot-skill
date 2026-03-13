# Agent Notes

Runtime discoveries, worked examples, and agent guidance not yet hardened into scripts.
Update this file as new patterns emerge.

---

## Cache Files

Run `node scripts/sync-cache.mjs` to populate (or refresh) three lookup files in `cache/`:

| File | Contents |
|------|----------|
| `cache/accounts.json` | `id → {name, type, subType, mask}` — all 23 accounts across checking, credit, investment, mortgage, real estate |
| `cache/categories.json` | `id → {name, parentId, parentName}` — all 34 categories (flat); subcategories include parent info for rollups |
| `cache/category-tree.json` | `id → {name, children: [{id, name}]}` — top-level categories with subcategories nested |

These change infrequently. Re-run sync when Nick adds a new account or changes categories.

### Using the cache for transaction hydration

Transactions from `TransactionsFeed` / `Transactions` return `accountId` and `categoryId` as
opaque IDs. To get human-readable names, load the cache files and join:

```js
import fs from "node:fs";
const accounts   = JSON.parse(fs.readFileSync("cache/accounts.json",   "utf8"));
const categories = JSON.parse(fs.readFileSync("cache/categories.json", "utf8"));

// Hydrate a transaction node:
const account  = accounts[tx.accountId]?.name  ?? tx.accountId;
const category = categories[tx.categoryId]?.name ?? "Uncategorized";
const parent   = categories[tx.categoryId]?.parentName ?? null;
```

### Category rollups

To aggregate spending by top-level category (e.g. "Household"), use `category-tree.json`
to find all child IDs, then sum transactions whose `categoryId` is in that set:

```js
const tree = JSON.parse(fs.readFileSync("cache/category-tree.json", "utf8"));

// Find all categoryIds that belong to "Household"
const householdEntry = Object.entries(tree).find(([, v]) => v.name === "Household");
const householdIds = new Set([
  householdEntry[0],
  ...householdEntry[1].children.map(c => c.id)
]);

// Sum transactions
const total = transactions
  .filter(tx => householdIds.has(tx.categoryId))
  .reduce((sum, tx) => sum + tx.amount, 0);
```

---

## Known API Quirks

- `categories` (plural) is a valid root query — returns all top-level categories with
  `childCategories`. The captured operations didn't include this; use `raw` with
  `--operation-name GetCategories`.
- `category { name }` is a valid field but the default `CategoryKeyMetrics` query doesn't
  request it. Add it manually when needed.
- `TransactionsFeed` default vars include `"month": true` which injects `TransactionMonth`
  group nodes. Pass `"month": false` to get a clean list of transactions only, but for
  review-state workflows prefer `Transactions` because it returns a plain transaction list.
- `Transactions` accepts a server-side review-state filter via `filter.isReviewed`.
  - Example unreviewed query:
    `node scripts/copilot-gql.mjs run Transactions --vars-json '{"filter":{"isReviewed":false},"sort":[{"direction":"DESC","field":"DATE"}],"first":100}' | jq`
  - For presentation, hydrate `accountId` / `categoryId` through `cache/accounts.json` and
    `cache/categories.json`.
- `Accounts` default vars filter to `"type": "INVESTMENT"`. Pass `"filter": null` to get
  all account types.
- `raw` command requires `--operation-name` to match the query's operation name, otherwise
  Copilot returns a 500.
