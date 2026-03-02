# API Use Cases

Use these recipes to translate common finance questions into Copilot data retrieval steps.

## Before You Start

- If a query needs `accountId`, `itemId`, `institutionId`, `securityId`, `categoryId`, or `recurringId`, discover it first instead of guessing.
- If the user asks for a category by plain-English name, be explicit that category-name lookup is not yet captured in the API artifacts.
- If the user asks for "net worth," verify whether they really mean investment portfolio value, one account's balance, or true cross-account net worth.
- Stop after data retrieval. Use another skill for financial analysis, recommendations, planning, or scenario modeling.

## 1) Discover Account IDs For A Provider Or Brokerage (e.g., E-Trade)

Question shape:

- "compare the performance of my Wells Fargo account and E-Trade account over the last year"
- "which investment accounts do I have at E-Trade?"

Needed data:

- candidate accounts
- `accountId` and `itemId`
- institution/provider linkage

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

Retrieval notes:

- `Accounts` gives the broad inventory.
- `Account` confirms per-account metadata when you already have candidate IDs.
- `Institution` resolves provider names and metadata.

## 2) Holdings Snapshot For One Investment Account

Question shape:

- "show me the holdings in my E-Trade account"
- "what does this investment account hold right now?"

Needed data:

- account-scoped holdings
- account-scoped allocation data

```bash
node scripts/copilot-gql.mjs run AggregatedHoldings --vars-json '{"timeFrame":"ONE_WEEK","filter":"LAST_PRICE","accountId":"<account_id>","itemId":"<item_id>"}' | jq
node scripts/copilot-gql.mjs run InvestmentAllocation --vars-json '{"filter":{"accountId":"<account_id>","itemId":"<item_id>"}}' | jq
```

Retrieval notes:

- `AggregatedHoldings` gives summarized position data for the selected account.
- `InvestmentAllocation` gives account-scoped composition breakdown.

## 3) Portfolio Trend + Movers

Question shape:

- "how has my portfolio trended over the last 30 days?"
- "what are my top performing stocks today?"

Needed data:

- portfolio value time series
- current investment balance snapshot
- mover list for the portfolio

```bash
node scripts/copilot-gql.mjs run InvestmentBalance --vars-json '{"timeFrame":"ONE_MONTH"}' | jq
node scripts/copilot-gql.mjs run InvestmentLiveBalance | jq
node scripts/copilot-gql.mjs run TopMovers --vars-json '{"filter":"MY_EQUITY_CHANGE"}' | jq
```

Retrieval notes:

- `InvestmentBalance` gives the historical series.
- `InvestmentLiveBalance` gives the freshest investment total.
- `TopMovers` gives the ranked mover set for downstream analysis.
- If the user says "today," `TopMovers` is usually the first retrieval target.

## 4) Account Balance Trend + Live Value

Question shape:

- "how has my Wells Fargo account trended over the last year?"
- "compare my Wells Fargo account and E-Trade account over the last year"

Needed data:

- account history series
- latest live balance
- provider/account identity for each compared account

```bash
node scripts/copilot-gql.mjs run BalanceHistory --vars-json '{"itemId":"<item_id>","accountId":"<account_id>","timeFrame":"ONE_MONTH"}' | jq
node scripts/copilot-gql.mjs run AccountLiveBalance --vars-json '{"itemId":"<item_id>","accountId":"<account_id>"}' | jq
```

Retrieval notes:

- Discover candidate accounts and provider IDs with `Accounts` and `Institution` first.
- Then run `BalanceHistory` and `AccountLiveBalance` for each account you want to compare.
- Leave the comparison logic itself to downstream analysis.

## 5) Transaction Search + Summary

Question shape:

- "how much have I spent at Costco this month?"
- "show me transactions for Whole Foods this month"

Needed data:

- matching transaction list
- aggregate totals for the search scope

```bash
node scripts/copilot-gql.mjs run TransactionsFeed --vars-json '{"filter":{"matchString":"costco","dates":[{"start":1769925600,"end":1772344799}]},"sort":[{"direction":"DESC","field":"DATE"}],"first":25}' | jq
node scripts/copilot-gql.mjs run TransactionSummary --vars-json '{"filter":{"matchString":"costco","dates":[{"start":1769925600,"end":1772344799}]}}' | jq
```

Retrieval notes:

- `TransactionsFeed` is the evidence set.
- `TransactionSummary` is the fast aggregate.
- Merchant search works well here.
- Observed server-side date scoping uses `filter.dates`, where each range is `{ "start": <unix_seconds>, "end": <unix_seconds> }`.
- `month: true` on `TransactionsFeed` is optional and affects month-grouped feed output, not the date-range filter itself.

## 6) Category Detail Drilldown

Question shape:

- "can you see how much I've spent on groceries this month?"

Needed data:

- `categoryId`
- category metrics
- transactions scoped to that category
- related recurrings, if useful

```bash
node scripts/copilot-gql.mjs run CategoryKeyMetrics --vars-json '{"id":"<category_id>"}' | jq
node scripts/copilot-gql.mjs run TransactionsFeed --vars-json '{"month":true,"filter":{"categoryIds":["<category_id>"]},"sort":[{"direction":"DESC","field":"DATE"}],"first":25}' | jq
node scripts/copilot-gql.mjs run Recurrings --vars-json '{"filter":{"categoryId":"<category_id>"}}' | jq
```

Important limitation:

- There is no captured category-name-to-`categoryId` lookup yet.
- If you already have the grocery `categoryId` from prior context, use the recipe above.
- Otherwise, say that Copilot data for the category is available only after the category has been identified.

## 7) Recurring Detail Analysis

Question shape:

- "how is my Netflix subscription trending?"
- "what's the latest recurring charge for X?"

Needed data:

- recurring entity metrics
- latest transaction in that recurring stream
- transaction history for the recurring entity

```bash
node scripts/copilot-gql.mjs run RecurringKeyMetrics --vars-json '{"id":"<recurring_id>","keyMetricsFrequency":"MONTHLY"}' | jq
node scripts/copilot-gql.mjs run MostRecentTransaction --vars-json '{"filter":{"recurringId":"<recurring_id>"}}' | jq
node scripts/copilot-gql.mjs run Transactions --vars-json '{"filter":{"recurringIds":["<recurring_id>"]},"first":25}' | jq
```

Retrieval notes:

- Use `Recurrings` first if you need to inventory or identify the recurring entity.

## 8) Holding Price Trace

Question shape:

- "show me the recent price trace for this holding"

Needed data:

- high-frequency price points for a known security

```bash
node scripts/copilot-gql.mjs run SecurityPricesHighFrequency --vars-json '{"id":"<security_id>","timeFrame":"ONE_DAY"}' | jq
```

Retrieval notes:

- Use this when you already know the `securityId`.
- This is a detail retrieval helper, often after `TopMovers` or holdings retrieval.

## 9) Cost Basis For Specific Symbols

Question shape:

- "what's my cost basis on SPY and VOO?"
- "what's my average cost on AAPL?"

Needed data:

- holdings rows for the requested symbols
- cost basis, average cost, quantity, total return

```bash
node scripts/copilot-gql.mjs run Holdings | jq
```

Practical workflow:

1. Run `Holdings`.
2. Filter the result set to the requested symbols using `security.symbol`.
3. Hand the matching rows to downstream analysis or answer directly with the retrieved fields.

## 10) Allocation Or Composition Data

Question shape:

- "what does my portfolio allocation look like?"
- "should I adjust my portfolio allocation?"

Needed data:

- allocation breakdown
- aggregated composition data by holding or allocation view

```bash
node scripts/copilot-gql.mjs run InvestmentAllocation | jq
node scripts/copilot-gql.mjs run AggregatedHoldings --vars-json '{"timeFrame":"ONE_MONTH","filter":"EQUITY_ALLOCATION"}' | jq
```

Retrieval notes:

- This skill retrieves the current mix.
- Another skill should decide how to interpret or recommend changes.

## 11) Net Worth Or Portfolio Trend

Question shape:

- "how has my net worth trended over the last 30 days?"

Needed data:

- investment portfolio time series
- possibly selected account histories if the user wants a partial proxy

```bash
node scripts/copilot-gql.mjs run InvestmentBalance --vars-json '{"timeFrame":"ONE_MONTH"}' | jq
```

Important limitation:

- `InvestmentBalance` is a portfolio-value series, not guaranteed whole-net-worth coverage.
- If the user truly means total net worth, say that the captured API only directly supports investment balance plus individual account histories.
- Retrieve the closest supported series and let another skill interpret it.

## 12) Retirement Scenarios

Question shape:

- "let's develop some retirement scenarios"

Needed data:

- baseline balances
- holdings
- allocation data
- recurring or spending data if another skill will use them in planning

There is no captured operation that directly performs retirement projections or scenario modeling.

Retrieval path:

1. Use this skill only to gather baseline facts such as current allocation, balances, and holdings.
2. Hand those facts to another skill for the scenario work.
