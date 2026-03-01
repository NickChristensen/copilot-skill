---
name: copilot-money-api
description: Retrieve ground-truth financial data from copilot.money to support answers to user questions about their finances. Use when a user asks about balances, accounts, holdings, cost basis, categorized spending, recurring payments, institutions, transaction history, portfolio trends, allocation, or other personal-finance questions that require facts from Copilot. This skill helps the agent identify what data exists in Copilot, which GraphQL operations expose it, and how to fetch it with the local authenticated runner before any downstream analysis.
---

# Copilot Money API

Use this skill to retrieve authenticated financial data from `https://app.copilot.money/api/graphql` using the repository's captured API artifacts.

Copilot is the source-of-truth hub for the user's financial data: accounts, balances, holdings, transactions, categories, recurring payments, and institution links.

Use this skill to:

- identify what kinds of data Copilot can provide for a question
- choose the right operation and required IDs
- fetch the data with the local runner

Do not use this skill to teach or perform financial analysis. After retrieval, another skill or the base agent can interpret the results.

## Ground Truth First

When a user asks a finance question:

1. Translate the question into the facts you need.
2. Retrieve those facts from Copilot when the captured API supports them.
3. Separate retrieved facts from any later interpretation.
4. If Copilot does not directly expose the needed fact, say so plainly instead of inferring it.

## Workflow

1. Classify the user request:
   - balances or account metadata
   - holdings or position data
   - transactions or category spending
   - recurring-payment data
   - institution or provider mapping
2. Load the smallest supporting reference that matches the request.
3. Discover IDs before deeper queries when the operation requires `accountId`, `itemId`, `institutionId`, `securityId`, `categoryId`, or `recurringId`.
4. Prefer cataloged operations and example requests over raw queries.
5. Retrieve facts and stop at the data boundary.

## Prompt Router

Use these mappings before browsing the whole runtime tree:

| User asks about... | Primary operation(s) | Also load |
|---|---|---|
| Spending totals, merchant search, recent transactions | `TransactionSummary`, `TransactionsFeed` | `references/runtime/copilot-api/use-cases.md` |
| Account trend, live balance, comparing accounts | `Accounts` -> `Institution` -> `BalanceHistory` / `AccountLiveBalance` | `references/runtime/copilot-api/use-cases.md` |
| Portfolio trend or top performers | `InvestmentBalance`, `InvestmentLiveBalance`, `TopMovers` | `references/runtime/copilot-api/use-cases.md` |
| Cost basis, average cost, position-level holdings | `Holdings` | `references/runtime/copilot-api/use-cases.md` |
| Allocation or composition data | `InvestmentAllocation`, `AggregatedHoldings` | `references/runtime/copilot-api/use-cases.md` |
| Recurring-payment behavior | `Recurrings`, `RecurringKeyMetrics`, `MostRecentTransaction` | `references/runtime/copilot-api/use-cases.md` |
| Unknown operation or variable shape | `list`, `show <OperationName>` | `references/runtime/copilot-api/operation-semantics.json`, `references/runtime/copilot-api/enum-values.json` |

## Load Guidance

- If the user asks a natural-language finance question, read `references/runtime/copilot-api/use-cases.md` first.
- If you know the likely operation but need field intent or nearby alternatives, inspect `references/runtime/copilot-api/operation-semantics.json`.
- If an operation uses enum variables such as `timeFrame` or mover filters, run `show <OperationName>` before overriding variables.
- Do not load raw capture artifacts for normal analysis. Use `references/capture/*` only when expanding the API surface.

## Quick Start

1. Use the local Node runner in `scripts/copilot-gql.mjs`.
2. Discover operations with `list` and inspect with `show`.
3. Read enum hints from `show` output before crafting custom variables.
4. Use operation semantics and use-case recipes to select the right operation quickly.
5. Override variables only when needed.
6. Use raw mode only for uncataloged queries.

Use this command pattern:

```bash
node scripts/copilot-gql.mjs run TransactionsFeed | jq
node scripts/copilot-gql.mjs run TransactionSummary --vars-json '{"filter":{}}' | jq
node scripts/copilot-gql.mjs list
node scripts/copilot-gql.mjs list --descriptions
node scripts/copilot-gql.mjs show TransactionsFeed
node scripts/copilot-gql.mjs show AggregatedHoldings
```

## Scope And Limits

- Supported well:
  - retrieving balances, holdings, allocation data, cost basis, account histories, transactions, categories, recurrings, and institution links
- Supported partially:
  - category-specific spending when you already have a `categoryId`
  - provider or brokerage comparisons after discovering account and institution IDs
  - net-worth-like retrieval using a combination of investment and account history endpoints
- Not directly supported by the captured surface:
  - financial planning logic
  - portfolio recommendations
  - retirement scenario modeling
  - A guaranteed net-worth history series across every asset/liability type
  - Category lookup by category name alone

When support is partial, retrieve the closest faithful data and leave interpretation to another skill.

## Canonical Inputs

- Operation catalog: `references/runtime/copilot-api/copilot-api.operations.yaml`
- Auth spec: `references/runtime/copilot-api/copilot-auth.yaml`
- Enum candidates: `references/runtime/copilot-api/enum-values.json`
- Operation semantics: `references/runtime/copilot-api/operation-semantics.json`
- Use-case recipes: `references/runtime/copilot-api/use-cases.md`
- Query documents: `references/runtime/copilot-api/operations/*.graphql`
- Example requests: `references/runtime/copilot-api/examples/requests/*.request.json`
- Capture workflow notes: `references/capture/README.md`

## Execute Known Operations

Use request examples to avoid reconstructing variables manually:

```bash
node scripts/copilot-gql.mjs run Tags | jq
node scripts/copilot-gql.mjs run Account --vars-file references/runtime/copilot-api/examples/requests/Account.request.json | jq
node scripts/copilot-gql.mjs raw --query-file references/runtime/copilot-api/operations/Transactions.graphql --vars-file references/runtime/copilot-api/examples/requests/Transactions.request.json | jq
```

## Decision Rules

- Use `Holdings` for symbol-level cost basis, average cost, quantity, and total return.
- Use `TopMovers` for "best performers today" style questions.
- Use `InvestmentBalance` for portfolio trend questions and `BalanceHistory` for single-account trend questions.
- Use `TransactionSummary` for totals and `TransactionsFeed` when the user also needs examples, merchants, or transaction-level evidence.
- Use `InvestmentAllocation` to fetch current allocation data.
- If the user asks for "net worth," do not substitute investment balance unless you explicitly label it as an approximation.
- If the user asks for recommendations, scenarios, or advice, use this skill only to gather facts for another skill.

## Safety Rules

- Never print token values.
- Never commit unredacted secrets or raw authorization headers.
- Redact account IDs, item IDs, and security IDs in shared examples unless explicitly asked to keep them.
- Treat `.env` as source-only for `API_KEY` and `REFRESH_TOKEN`; do not cat the file contents.
- Never guess category IDs, security IDs, or institution mappings.
- Never mix retrieved facts with advice as if Copilot returned the advice.
- Never claim complete net-worth coverage unless the retrieved operations actually cover all relevant account classes.

## Capture Expansion Workflow

When asked to discover new operations:

1. Use headed browser automation to navigate target views.
2. Diff new captured traffic against the previous baseline.
3. Extract new `operationName`, `query`, and variable patterns.
4. Update:

- fresh browser-captured GraphQL traffic gathered during update work
- `references/runtime/copilot-api/operations/*.graphql`
- `references/runtime/copilot-api/copilot-api.operations.yaml`
- `references/runtime/copilot-api/examples/requests/*.request.json`

## References

- Folder guide: `references/README.md`
- Operation groups and exploration order: `references/runtime/operation-groups.md`
- Reusable runner templates: `references/runtime/runner-templates.md`
