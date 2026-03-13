# Copilot API Capture Artifacts

This folder contains a machine-friendly capture of Copilot's production GraphQL API behavior.

## Files

- `copilot-auth.yaml`: auth/token lifecycle and refresh flow.
- `copilot-api.operations.yaml`: canonical operation catalog.
- `operations/*.graphql`: captured query text per operation.
- `examples/requests/*.request.json`: redacted request examples.
- `operation-semantics.json`: operation descriptions and relationship hints.
- `use-cases.md`: task-oriented recipes for common data retrieval goals.

## Capture scope

Captured from a logged-in production session on 2026-02-27 while navigating:

- Dashboard
- Transactions
- Accounts
- Investments
- Categories
- Recurrings
- Accounts detail (transactional/credit-card account)
- Investments detail (investment account)
- Holding detail (investment security)
- Category detail
- Recurring detail

Raw traffic is intentionally not stored in the repo. Re-capture it locally when updating the catalog.

## Observed operations (24)

- `Account`
- `AccountLiveBalance`
- `Accounts`
- `AggregatedHoldings`
- `AmountTotalMonthly`
- `BalanceHistory`
- `BulkEditTransactions`
- `CategoryKeyMetrics`
- `CategoryTotalKeyMetrics`
- `EditTransaction`
- `Holdings`
- `Institution`
- `InvestmentAllocation`
- `InvestmentBalance`
- `InvestmentLiveBalance`
- `MostRecentTransaction`
- `RecurringKeyMetrics`
- `Recurrings`
- `SecurityPricesHighFrequency`
- `Tags`
- `TopMovers`
- `TransactionSummary`
- `Transactions`
- `TransactionsFeed`

## Detail-view findings

- New operations from detail views:
  - `Account`
  - `Transactions`
  - `AmountTotalMonthly`
  - `SecurityPricesHighFrequency`
  - `CategoryKeyMetrics`
  - `Recurrings`
  - `RecurringKeyMetrics`
  - `MostRecentTransaction`
  - `EditTransaction`

## Mutation findings

- First captured transaction mutations:
  - `EditTransaction` for single-transaction review state changes
  - `BulkEditTransactions` for multi-transaction review state changes
- Both review paths set `input.isReviewed` and identify transactions using `accountId`, `itemId`, and `id`.
- `EditTransaction` also handles observed single-transaction category changes via `input.categoryId`.
- `EditTransaction` also handles observed single-transaction renames via `input.name`.
- `BulkEditTransactions` also handles observed bulk category changes via `input.categoryId`.
- Observed bulk category changes scoped the selected set with both `filter.ids` and `filter.categoryIds`.

## Maintenance workflow

1. Re-capture app traffic after product updates.
2. Regenerate `operations/*.graphql` and request examples.
3. Use this catalog as the source for agent workflows and wrappers.
