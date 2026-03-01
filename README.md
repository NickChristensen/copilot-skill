# Copilot Money Skill

This repository contains an agent skill for retrieving a user's financial ground-truth data from copilot.money.

The skill is designed to help an agent:

- understand what kinds of financial data Copilot exposes
- choose the right GraphQL operation for that data
- fetch the data with the local authenticated runner

It is not meant to teach financial analysis, planning, or advice. The intended workflow is:

1. use this skill to gather facts from Copilot
2. hand those facts to another skill, or the base agent, for interpretation

## What's Here

- [SKILL.md](/Users/nick/code/copilot.money/SKILL.md): the main skill instructions for agents
- [scripts/copilot-gql.mjs](/Users/nick/code/copilot.money/scripts/copilot-gql.mjs): local runner for captured GraphQL operations
- [references/runtime/copilot-api](/Users/nick/code/copilot.money/references/runtime/copilot-api): operation catalog, GraphQL documents, example requests, and use-case recipes
- [references/capture](/Users/nick/code/copilot.money/references/capture): lower-level capture artifacts used to expand the known API surface

## In Scope

- retrieving balances and account histories
- retrieving holdings, movers, cost basis, and allocation data
- retrieving categorized transactions and recurring-payment data
- finding the right account, institution, category, recurring, or security identifiers needed for later queries

## Out of Scope

- giving investment advice
- performing retirement modeling
- deciding how to interpret the data once retrieved

## Typical Flow

1. Start with the user's finance question.
2. Translate it into the facts you need from Copilot.
3. Use the skill to discover the right operations and required IDs.
4. Fetch the data.
5. Pass the retrieved facts into a separate analysis step if needed.

## Notes

- Copilot should be treated as the user's financial data hub, similar to Mint-style aggregation.
- Some workflows are partial because the captured API surface is incomplete.
- If a needed data path is missing, the skill should say so plainly rather than guessing.
