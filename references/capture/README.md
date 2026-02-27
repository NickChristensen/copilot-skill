# Capture References

Use this folder only for recapture and drift-detection workflows.

- `copilot-captured-graphql-ops.raw.json`: full captured request log
- `copilot-captured-graphql-ops.json`: trimmed capture log
- `copilot-api-auth-spec-prod.md`: earlier auth/API field notes

Typical use:

1. Capture new browser traffic.
2. Diff new operations/variable shapes.
3. Promote updates into `../runtime/copilot-api/`.
