# API Use Cases

Use these recipes for "grab-and-go" workflows.

## 1) Discover Account IDs For A Provider (e.g., E-Trade)

1. List candidate investment accounts:
```bash
node scripts/copilot-gql.mjs run Accounts --vars-json '{"filter":{"type":"INVESTMENT"},"accountLink":false}' | jq
```
2. Inspect account/institution metadata:
```bash
node scripts/copilot-gql.mjs run Account --vars-json '{"itemId":"<item_id>","id":"<account_id>","accountLink":true}' | jq
```
3. If needed, resolve institution details:
```bash
node scripts/copilot-gql.mjs run Institution --vars-json '{"id":"<institution_id>"}' | jq
```

## 2) Holdings Snapshot For One Investment Account

```bash
node scripts/copilot-gql.mjs run AggregatedHoldings --vars-json '{"timeFrame":"ONE_WEEK","filter":"LAST_PRICE","accountId":"<account_id>","itemId":"<item_id>"}' | jq
node scripts/copilot-gql.mjs run InvestmentAllocation --vars-json '{"filter":{"accountId":"<account_id>","itemId":"<item_id>"}}' | jq
```

## 3) Portfolio Trend + Movers

```bash
node scripts/copilot-gql.mjs run InvestmentBalance --vars-json '{"timeFrame":"ONE_MONTH"}' | jq
node scripts/copilot-gql.mjs run InvestmentLiveBalance | jq
node scripts/copilot-gql.mjs run TopMovers --vars-json '{"filter":"MY_EQUITY_CHANGE"}' | jq
```

## 4) Account Balance Trend + Live Value

```bash
node scripts/copilot-gql.mjs run BalanceHistory --vars-json '{"itemId":"<item_id>","accountId":"<account_id>","timeFrame":"ONE_MONTH"}' | jq
node scripts/copilot-gql.mjs run AccountLiveBalance --vars-json '{"itemId":"<item_id>","accountId":"<account_id>"}' | jq
```

## 5) Transaction Search + Summary

```bash
node scripts/copilot-gql.mjs run TransactionsFeed --vars-json '{"month":true,"filter":{"matchString":"costco"},"sort":[{"direction":"DESC","field":"DATE"}],"first":25}' | jq
node scripts/copilot-gql.mjs run TransactionSummary --vars-json '{"filter":{"matchString":"costco"}}' | jq
```

## 6) Category Detail Drilldown

```bash
node scripts/copilot-gql.mjs run CategoryKeyMetrics --vars-json '{"id":"<category_id>"}' | jq
node scripts/copilot-gql.mjs run TransactionsFeed --vars-json '{"month":true,"filter":{"categoryIds":["<category_id>"]},"sort":[{"direction":"DESC","field":"DATE"}],"first":25}' | jq
node scripts/copilot-gql.mjs run Recurrings --vars-json '{"filter":{"categoryId":"<category_id>"}}' | jq
```

## 7) Recurring Detail Analysis

```bash
node scripts/copilot-gql.mjs run RecurringKeyMetrics --vars-json '{"id":"<recurring_id>","keyMetricsFrequency":"MONTHLY"}' | jq
node scripts/copilot-gql.mjs run MostRecentTransaction --vars-json '{"filter":{"recurringId":"<recurring_id>"}}' | jq
node scripts/copilot-gql.mjs run Transactions --vars-json '{"filter":{"recurringIds":["<recurring_id>"]},"first":25}' | jq
```

## 8) Holding Price Trace

```bash
node scripts/copilot-gql.mjs run SecurityPricesHighFrequency --vars-json '{"id":"<security_id>","timeFrame":"ONE_DAY"}' | jq
```
