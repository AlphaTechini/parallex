# Tests

This directory is the home for automated tests. Vitest is configured in the root manifest and `convex-test` is available as a dev dependency, so Convex queries, mutations, actions, and scheduled functions can be exercised against a mock backend here.

Run the suite from the repository root:

```sh
pnpm test
```

The repository currently ships the runner configuration without committed test suites. Product acceptance is therefore verified with the manual, provider-backed checks in [docs/demo-checklist.md](../docs/demo-checklist.md), alongside `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

To find the product acceptance checks that stand in for the missing suites visit [docs/demo-checklist.md](../docs/demo-checklist.md). The schema and function modules under test can be found in [convex/schema.ts](../convex/schema.ts) and the sibling Convex function files.

## Conventions for future suites

- One file per backend module or product behavior, named after the module under test, so failures point at the owning code.
- Convex function tests use `convex-test` with the schema from [convex/schema.ts](../convex/schema.ts) and the function modules registered through `import.meta.glob`, following the pattern in the official Convex testing docs referenced in [llm.txt](../llm.txt).
- Pure helpers (URL canonicalization, recurrence math, error sanitization, report Markdown sanitization) are the first candidates for direct unit tests because they are deterministic and security-relevant.
- Provider integrations are tested through their backend seams (validation, normalization, state transitions) with mocked clients, never by calling real provider APIs in the suite.
