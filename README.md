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

## Obtaining Your Credentials

To use this project, you will need `COPILOT_API_KEY` and `COPILOT_REFRESH_TOKEN` from an authenticated Copilot web session. You can obtain both with Chrome DevTools.

### Get `COPILOT_REFRESH_TOKEN`

1. Open Copilot in Chrome and log in.
2. Open DevTools.
3. Go to `Application` -> `IndexedDB` -> `firebaseLocalStorageDb` -> `firebaseLocalStorage`.
4. Open the row with key like `firebase:authUser:<apiKey>:[DEFAULT]`.
5. Copy `stsTokenManager.refreshToken`.

### Get `COPILOT_API_KEY`

1. In that same IndexedDB row, inspect the key:
   `firebase:authUser:<apiKey>:[DEFAULT]`
2. The middle segment is the Firebase API key, usually starting with `AIza...`.

You can also get `COPILOT_API_KEY` from DevTools `Network` by finding a request to either:

- `https://identitytoolkit.googleapis.com/...?...key=...`
- `https://securetoken.googleapis.com/v1/token?key=...`

Then copy the `key` query parameter.

### Sanity Check

- `COPILOT_API_KEY` usually starts with `AIza...`
- `COPILOT_REFRESH_TOKEN` is a long opaque string, often starting with `AMf-...`

Treat both values as secrets.

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
