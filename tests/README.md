# Tests

This directory contains the automated acceptance and regression suites. Vitest runs deterministic helpers and `convex-test` exercises Convex queries, mutations, actions, and scheduled functions against an isolated mock backend.

Run the suite from the repository root:

```sh
pnpm test
```

The committed suites cover ownership, idempotency, lifecycle state, instruction versioning, avatar and upload rules, Firecrawl routing, and integration-review regressions. Provider behavior that requires live OpenAI, Firecrawl, AgentMail, or Convex File Storage metadata remains covered by the manual checks in [docs/demo-checklist.md](../docs/demo-checklist.md).

To find the provider-backed product acceptance checks visit [docs/demo-checklist.md](../docs/demo-checklist.md). The schema and function modules under test can be found in [convex/schema.ts](../convex/schema.ts) and the sibling Convex function files.

## Test conventions

- One file per backend module or product behavior, named after the module under test, so failures point at the owning code.
- Convex function tests use `convex-test` with the schema from [convex/schema.ts](../convex/schema.ts) and the function modules registered through `import.meta.glob`, following the pattern in the official Convex testing docs referenced in [llm.txt](../llm.txt).
- Pure helpers (URL canonicalization, recurrence math, error sanitization, report Markdown sanitization) are the first candidates for direct unit tests because they are deterministic and security-relevant.
- Provider integrations are tested through their backend seams (validation, normalization, state transitions) with mocked clients, never by calling real provider APIs in the suite.
