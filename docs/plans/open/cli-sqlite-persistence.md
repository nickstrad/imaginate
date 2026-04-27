# CLI SQLite persistence

## Goal

Make `npm run agent:local` useful across repeated local runs by persisting local projects, prompts, assistant outcomes, telemetry summaries, and sandbox follow-up metadata in a SQLite database. The CLI should keep working without the web app, Postgres, or Inngest, while preserving the same agent runtime contract used by the server path.

## The problem

The CLI is a first-class interface per `docs/architecture/architecture.md` ("CLI as a first-class interface"), but it currently behaves like a throwaway runner:

- `src/interfaces/cli/agent-local.ts` wires `createInMemoryMessageStore()` and `createNoopTelemetryStore()`, so prompts, final outputs, and telemetry disappear when the process exits.
- `runAgent` accepts `previousMessages` and `persistTelemetryFor`, but the CLI does not create a durable assistant message id before the run or pass previous local history back into the planner.
- The CLI prints a `--sandbox-id` follow-up command, but it does not remember which sandbox, prompt, or local project that command belonged to.
- The Prisma adapter is Postgres-oriented through `prisma/schema.prisma`. Reusing that generated client for local SQLite would tangle the CLI with web persistence concerns and make the local tool depend on app database setup.

The architectural boundary is already present: persistence goes through `MessageStore` and `TelemetryStore` ports in `src/agent/ports/`, concrete implementations live under `src/agent/adapters/`, and CLI argument parsing/output belongs under `src/interfaces/cli/`.

## What "after" looks like

Add a SQLite adapter beside the existing memory and Prisma adapters:

```txt
src/agent/adapters/sqlite/
  index.ts
  schema.ts
  database.ts
  message-store.ts
  telemetry-store.ts
  local-run-store.ts
  *.test.ts
```

The CLI composes it when persistence is enabled:

```ts
const sqlite = await openAgentSqlite({
  databasePath: args.db,
});

const previousMessages = await sqlite.localRuns.getPreviousMessages({
  projectId: args.projectId,
  limit: args.historyLimit,
});

const assistantMessage = await sqlite.messages.appendAssistantMessage({
  projectId: args.projectId,
  role: "assistant",
  content: "",
});

const result = await runAgent({
  input: {
    prompt: args.prompt,
    projectId: args.projectId,
    previousMessages,
  },
  deps: {
    ...deps,
    messageStore: sqlite.messages,
    telemetryStore: sqlite.telemetry,
  },
  config,
  persistTelemetryFor: { messageId: assistantMessage.messageId },
});
```

The local SQLite schema should be deliberately small and CLI-owned, not a second copy of the full Prisma schema:

```sql
create table local_project (
  id text primary key,
  name text not null,
  created_at text not null,
  updated_at text not null
);

create table local_message (
  id text primary key,
  project_id text not null references local_project(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  status text not null check (status in ('pending', 'complete', 'error')),
  created_at text not null,
  updated_at text not null
);

create table local_run (
  id text primary key,
  project_id text not null references local_project(id) on delete cascade,
  user_message_id text not null references local_message(id),
  assistant_message_id text references local_message(id),
  sandbox_id text,
  sandbox_url text,
  follow_up_command text,
  status text not null,
  created_at text not null,
  updated_at text not null
);

create table local_telemetry (
  message_id text primary key references local_message(id) on delete cascade,
  steps integer not null,
  files_read integer not null,
  files_written integer not null,
  commands_run integer not null,
  build_succeeded integer not null,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  updated_at text not null
);
```

CLI defaults should be predictable:

```txt
npm run agent:local -- "continue the UI polish"
npm run agent:local -- --project local "continue the UI polish"
npm run agent:local -- --db .imaginate/agent-local.sqlite --project demo "..."
npm run agent:local -- --no-persist "one-off prompt"
```

Default database path: `.imaginate/agent-local.sqlite` under the repo root. The implementation should create the parent directory and apply idempotent migrations on open.

## Sequencing

1. **SQLite adapter foundation.** Add a small SQLite dependency, schema bootstrap, migration version table, and adapter tests using temporary database files. Export the adapter through `src/agent/adapters/index.ts` and `src/agent/index.ts`.
2. **Port-compatible stores.** Implement `MessageStore` and `TelemetryStore` on top of SQLite. Add adapter-owned helpers only for CLI-local concepts that are not agent runtime ports, such as project creation, previous-message reads, local run rows, and sandbox metadata.
3. **CLI wiring.** Add `--db`, `--project`, `--history-limit`, and `--no-persist` flags. In persisted mode, create or reuse the local project, store the user prompt and pending assistant message, pass previous messages into `runAgent`, pass `persistTelemetryFor`, then complete or fail the assistant/run rows after the outcome is known. Keep the current in-memory/noop behavior behind `--no-persist`.
4. **Output and recovery polish.** Include `projectId`, `db`, `runId`, and remembered sandbox metadata in JSONL and human output. Make startup errors actionable when the database path is invalid or a migration fails.

Steps 1 and 2 can ship together. Step 3 depends on them. Step 4 can be a small follow-up PR if the initial CLI flow already persists and resumes history correctly.

## Definition of done / verification

- Running the CLI twice with the same `--project` loads earlier local user and assistant messages into the planner.
- A successful run writes local project, user message, assistant message, run, telemetry, sandbox id, sandbox URL, and follow-up command rows to SQLite.
- A failed or provider-error run marks the assistant/run rows as failed without losing the prompt or partial telemetry.
- `--no-persist` preserves the current one-off behavior and does not create a database file.
- SQLite migration/bootstrap tests cover a fresh database and a second open against the same database.
- Store tests cover append/read/upsert behavior and use a temporary file-backed database, not the production `.imaginate` path.
- CLI tests cover argument parsing and persisted vs. non-persisted dependency selection without hitting E2B or model providers.
- Verification commands: narrow Vitest tests for the adapter and CLI first, then `npm test` if store ports or shared runtime contracts change, plus lint/type checks for new exports and dependency wiring.

## Out of scope

- Switching the web app or Inngest path from Postgres/Prisma to SQLite.
- Making Prisma multi-provider or sharing the Prisma schema with the CLI.
- Building a browser UI for local SQLite history.
- Persisting raw tool outputs, full file contents, or large reasoning traces.
- Replacing E2B sandbox creation/reconnection behavior. Remembering sandbox metadata is in scope; sandbox lifecycle changes stay with the sandbox auto-revive plan.
- Implementing the broader telemetry schema expansion from `docs/plans/open/agent-telemetry-refactor/`.

## Conflicts checked

Checked `docs/plans/open/` and `docs/plans/drift/`. This plan overlaps with `agent-telemetry-refactor` only at the `TelemetryStore` port: that plan owns the future Postgres telemetry shape and analysis tables, while this plan stores the current compact telemetry payload for local CLI runs. It touches sandbox metadata but not sandbox lifecycle, so `sandbox-auto-revive.md` remains separate. `docs/plans/drift/` contains only its README.
