# Testing

Opinionated testing criteria for code changes in `src/`. Read this before writing, changing, reviewing, or deleting tests.

## When to add or update tests

Add or update tests when a change:

- Fixes a bug or prevents a regression.
- Changes branching, state transitions, parsing, validation, permissions, persistence, retries, telemetry, provider behavior, or sandbox behavior.
- Introduces a new public helper, server procedure, adapter, or UI behavior.
- Changes an interface that other code depends on.
- Moves behavior behind a port, fake, or in-memory implementation.

Tests are optional when the change is mechanical, copy-only, type-only, or deletes unreachable code. Call that out in the final response.

## Test shape

- Prefer behavior-focused assertions over implementation-detail assertions.
- Prefer small unit tests around pure logic, reducers, parsers, mappers, and decision functions.
- Use fakes or in-memory ports for Prisma, E2B, AI providers, Inngest, and networked services.
- Add integration tests only at meaningful boundaries where unit tests would miss wiring risk.
- Keep tests colocated with the code under test using `*.test.ts` or `*.test.tsx`, unless `docs/architecture/architecture.md` names a more specific location.
- Avoid snapshot tests unless the output is intentionally stable and hard to assert clearly.

## UI tests

- Prefer React Testing Library for component behavior.
- Test user-visible states and interactions, not component internals.
- Mock network and tRPC boundaries through test harnesses or fakes rather than real services.
- Cover loading, empty, success, and error states when the component owns those branches.

## Verification

- Run the narrowest relevant test command first.
- Run `npm test` when touching shared behavior, cross-module contracts, or test infrastructure.
- Run lint/type/build checks when the change affects imports, exported types, or framework wiring.
- Mention any skipped verification and why.
