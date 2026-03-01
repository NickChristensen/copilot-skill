---
name: copilot-money-api
description: Analyze and retrieve copilot.money financial data for practical user questions such as holdings performance, portfolio allocation, account balance trends, transaction summaries, category spending, and recurring-payment behavior. Use when a user asks for portfolio/holdings status (for example "how are my holdings doing today?"), investment composition/optimization checks, account-level drilldowns, or spending/recurring insights. This skill maps those intents to captured GraphQL operations and executes them via the local Node runner with authenticated token refresh.
---

# Copilot Money API

Use this skill to run authenticated GraphQL requests against `https://app.copilot.money/api/graphql` using the repository's captured API artifacts.

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

## Safety Rules

- Never print token values.
- Never commit unredacted secrets or raw authorization headers.
- Redact account IDs, item IDs, and security IDs in shared examples unless explicitly asked to keep them.
- Treat `.env` as source-only for `API_KEY` and `REFRESH_TOKEN`; do not cat the file contents.

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
