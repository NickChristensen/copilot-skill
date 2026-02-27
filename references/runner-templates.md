# Runner Templates

Prefer the Node runner:

```bash
node scripts/copilot-gql.mjs help
node scripts/copilot-gql.mjs list
node scripts/copilot-gql.mjs show TransactionsFeed
node scripts/copilot-gql.mjs show AggregatedHoldings
node scripts/copilot-gql.mjs token
node scripts/copilot-gql.mjs run TransactionsFeed | jq
node scripts/copilot-gql.mjs run TransactionSummary --vars-json '{"filter":{}}' | jq
```

Use raw mode when needed:

```bash
node scripts/copilot-gql.mjs raw \
  --query-file references/copilot-api/operations/Tags.graphql \
  --vars-file references/copilot-api/examples/requests/Tags.request.json \
  --operation-name Tags \
  | jq
```
