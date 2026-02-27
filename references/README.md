# References Layout

This folder is split by usage frequency.

## `runtime/` (day-to-day agent use)

Use these files for normal API work:

- `runtime/copilot-api/copilot-api.operations.yaml`
- `runtime/copilot-api/operations/*.graphql`
- `runtime/copilot-api/examples/requests/*.request.json`
- `runtime/copilot-api/enum-values.json`
- `runtime/operation-groups.md`
- `runtime/runner-templates.md`
- `runtime/README.md`

## `capture/` (rare recapture/update workflows)

Use these files when discovering new operations or validating drift:

- `capture/copilot-captured-graphql-ops.raw.json`
- `capture/copilot-captured-graphql-ops.json`
- `capture/copilot-api-auth-spec-prod.md`
- `capture/README.md`
