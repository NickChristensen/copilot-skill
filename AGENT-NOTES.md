# Agent Notes

Runtime discoveries, worked examples, and agent guidance not yet hardened into scripts.
Update this file as new patterns emerge.

---

## Cache Files

Hydrated `copilot-gql` commands automatically refresh missing or stale lookup files in `cache/`.
Run `node scripts/copilot-gql.mjs refresh-cache` to populate or refresh them manually:

| File | Contents |
|------|----------|
| `cache/accounts.json` | `id → {name, type, subType, mask}` — cached account metadata |
| `cache/categories.json` | `id → {name, parentId, parentName, emoji}` — flat category metadata; subcategories include parent info for rollups |
| `cache/category-tree.json` | `id → {name, emoji, children: [{id, name, emoji}]}` — top-level categories with subcategories nested |
| `cache/recurrings.json` | `id → {name, emoji, frequency, amount, categoryId, state}` — recurring-payment metadata |

These change infrequently. The runner treats cache files older than seven days as stale. Use `--refresh-cache` to force a refresh before hydration, or `--no-refresh` to skip automatic refresh for a command.

### Category rollups

To aggregate spending by top-level category, use `category-tree.json`
to find all child IDs, then sum transactions whose `categoryId` is in that set:

```js
const tree = JSON.parse(fs.readFileSync("cache/category-tree.json", "utf8"));

// Find all categoryIds that belong to the requested top-level category
const categoryEntry = Object.entries(tree).find(([, v]) => v.name === targetCategoryName);
const categoryIds = new Set([
  categoryEntry[0],
  ...categoryEntry[1].children.map(c => c.id)
]);

// Sum transactions
const total = transactions
  .filter(tx => categoryIds.has(tx.categoryId))
  .reduce((sum, tx) => sum + tx.amount, 0);
```

---

## Known API Quirks

- `categories` (plural) is a valid root query — returns all top-level categories with
  `childCategories`. The captured operations didn't include this; use `raw` with
  `--operation-name GetCategories`.
- Transaction date filters accept `YYYY-MM-DD` strings in `filter.dates[].start` and
  `filter.dates[].end`; the runner converts them to UTC-midnight Unix seconds. Copilot
  treats those bounds as inclusive date labels. Transaction `date` fields are returned
  as date-only strings, not timezone-adjusted timestamps.
- `category { name }` is a valid field but the default `CategoryKeyMetrics` query doesn't
  request it. Add it manually when needed.
- `TransactionsFeed` default vars include `"month": true` which injects `TransactionMonth`
  group nodes. Pass `"month": false` to get a clean list of transactions only, but for
  review-state workflows prefer `Transactions` because it returns a plain transaction list.
- `Transactions` accepts a server-side review-state filter via `filter.isReviewed`.
  - Example unreviewed query:
    `node scripts/copilot-gql.mjs run Transactions --vars-json '{"filter":{"isReviewed":false},"sort":[{"direction":"DESC","field":"DATE"}],"first":100}' | jq`
  - Fields like `displayName`, `categoryDisplay`, and `accountName` are automatically augmented with cached data. Pass `--no-hydrate` to get raw output.
- `Accounts` default vars filter to `"type": "INVESTMENT"`. Pass `"filter": null` to get
  all account types.
- `raw` command requires `--operation-name` to match the query's operation name, otherwise
  Copilot returns a 500.
