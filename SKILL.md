---
name: copilot-money-api
description: Work with the Copilot Money production GraphQL API using the local captured operation catalog and Firebase token refresh flow. Use when an agent needs to query Copilot data directly with the local Node runner, validate auth, run known operations from the captured spec, or expand/update API capture artifacts in this repository.
---

# Copilot Money API

Use this skill to run authenticated GraphQL requests against `https://app.copilot.money/api/graphql` using the repository's captured API artifacts.

## Quick Start

1. Use the local Node runner in `scripts/copilot-gql.mjs`.
2. Discover operations with `list` and inspect with `show`.
3. Read enum hints from `show` output before crafting custom variables.
4. Override variables only when needed.
5. Use raw mode only for uncataloged queries.

Use this command pattern:

```bash
node scripts/copilot-gql.mjs run TransactionsFeed | jq
node scripts/copilot-gql.mjs run TransactionSummary --vars-json '{"filter":{}}' | jq
node scripts/copilot-gql.mjs list
node scripts/copilot-gql.mjs show TransactionsFeed
node scripts/copilot-gql.mjs show AggregatedHoldings
```

## Canonical Inputs

- Operation catalog: `references/copilot-api/copilot-api.operations.yaml`
- Auth spec: `references/copilot-api/copilot-auth.yaml`
- Enum candidates: `references/copilot-api/enum-values.json`
- Query documents: `references/copilot-api/operations/*.graphql`
- Example requests: `references/copilot-api/examples/requests/*.request.json`
- Raw capture log: `references/copilot-captured-graphql-ops.raw.json`

## Execute Known Operations

Use request examples to avoid reconstructing variables manually:

```bash
node scripts/copilot-gql.mjs run Tags | jq
node scripts/copilot-gql.mjs run Account --vars-file references/copilot-api/examples/requests/Account.request.json | jq
node scripts/copilot-gql.mjs raw --query-file references/copilot-api/operations/Transactions.graphql --vars-file references/copilot-api/examples/requests/Transactions.request.json | jq
```

## Capture Expansion Workflow

When asked to discover new operations:

1. Use headed browser automation to navigate target views.
2. Diff new captured traffic against the previous baseline.
3. Extract new `operationName`, `query`, and variable patterns.
4. Update:
- `references/copilot-captured-graphql-ops.raw.json`
- `references/copilot-api/operations/*.graphql`
- `references/copilot-api/copilot-api.operations.yaml`
- `references/copilot-api/examples/requests/*.request.json`

## Safety Rules

- Never print token values.
- Never commit unredacted secrets or raw authorization headers.
- Redact account IDs, item IDs, and security IDs in shared examples unless explicitly asked to keep them.
- Treat `.env` as source-only for `API_KEY` and `REFRESH_TOKEN`; do not cat the file contents.

## References

- Operation groups and exploration order: `references/operation-groups.md`
- Reusable runner templates: `references/runner-templates.md`
