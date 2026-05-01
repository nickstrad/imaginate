# Imaginate

Imaginate is a public-demo AI app builder. Describe what you want in natural
language and an agent generates the code and runs it live in a sandbox — no
sign-in required.

## Getting Started

```bash
npm install
# Terminal 1: keep local Postgres visible in the foreground.
make db/local/up
```

Set `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/imaginate?schema=public`
in your local `.env`, then run:

```bash
make db/local/migrate
npm run dev
```

Then open <http://localhost:3000>.

## Model provider

Production LLM calls route through [OpenRouter](https://openrouter.ai), which
proxies OpenAI, Anthropic, Google (Gemini + Gemma), DeepSeek, Kimi, and others
under a single key. Set `OPENROUTER_API_KEY` in `.env` — get one at
<https://openrouter.ai/keys>.

For local model experiments, set `MODEL_PROVIDER=lmstudio` and run the LM Studio
local server. The app will use the configured LM Studio model as the planner and
as the only executor rung, with no executor ladder or OpenRouter per-call
fallbacks.

## Environment variables

| Variable                    | Required | Notes                                                                             |
| --------------------------- | -------- | --------------------------------------------------------------------------------- |
| `DATABASE_URL`              | yes      | Postgres connection string; local dev can use the Docker database below           |
| `NEXT_PUBLIC_APP_URL`       | yes      | e.g. `http://localhost:3000`                                                      |
| `E2B_API_KEY`               | yes      | <https://e2b.dev> — sandbox for generated code                                    |
| `OPENROUTER_API_KEY`        | prod     | <https://openrouter.ai/keys>                                                      |
| `MODEL_PROVIDER`            | no       | `openrouter` \| `lmstudio` (default `openrouter`)                                 |
| `LM_STUDIO_BASE_URL`        | no       | OpenAI-compatible base URL (default `http://127.0.0.1:1234/v1`)                   |
| `LM_STUDIO_MODEL`           | no       | local LM Studio model id (default `qwen/qwen3-coder-next`; e.g. `gemma-4-31b-it`) |
| `LM_STUDIO_API_KEY`         | no       | optional bearer token if your local server requires one                           |
| `RATE_LIMIT_PER_HOUR`       | no       | per-IP limit on project + message creation; default `10`                          |
| `LOG_LEVEL`                 | no       | `debug` \| `info` \| `warn` \| `error` (default `info`)                           |
| `LOG_PRETTY`                | no       | `auto` \| `true` \| `false` (default `auto`)                                      |
| `MODEL_PLANNER`             | no       | model key for the planner role — see **Models**                                   |
| `MODEL_EXECUTOR_DEFAULT`    | no       | model key for the default executor                                                |
| `MODEL_EXECUTOR_FALLBACK_1` | no       | model key for the first executor fallback                                         |
| `MODEL_EXECUTOR_FALLBACK_2` | no       | model key for the second executor fallback                                        |

## Local PostgreSQL

Local development should point Prisma at the checked-in Docker Compose database
instead of a hosted Postgres instance. Start it in a dedicated terminal so it is
obvious when Postgres is running:

```bash
make db/local/up
```

`make db/local/up` keeps Postgres attached to the terminal. Press `Ctrl-C` in
that terminal to stop it.

Set the database URL in your local `.env`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/imaginate?schema=public
```

Then apply migrations:

```bash
make db/local/migrate
```

Useful database commands:

| Command                 | Scope             | Description                                      |
| ----------------------- | ----------------- | ------------------------------------------------ |
| `make db/local/up`      | local Docker only | Start the local Postgres container               |
| `make db/local/down`    | local Docker only | Stop the local Postgres container                |
| `make db/local/status`  | local Docker only | Show local container status                      |
| `make db/local/logs`    | local Docker only | Follow local Postgres logs                       |
| `make db/local/verify`  | local DB check    | Verify local DB config, readiness, and Prisma    |
| `make db/local/wipe`    | local Docker only | Stop Postgres and delete its volume              |
| `make db/local/rebuild` | local Docker only | Wipe the local DB and print the foreground flow  |
| `make db/local/migrate` | local/dev Prisma  | Apply dev migrations; may create migration files |
| `make db/local/reset`   | local/dev Prisma  | Reset and reapply migrations; never use on prod  |
| `make db/prod/migrate`  | prod Prisma       | Deploy already-committed migrations to prod      |

The `db/local/*` commands only touch the Docker Compose services in this repo.
Use `make db/local/reset` when Prisma can connect and you only need the
schema/data reset for the configured local database. Use `make db/local/rebuild`
after changing migrations or schema state and you want to remove all persisted
local Docker Compose database state. It does not restart Postgres detached; run
`make db/local/up` in a visible terminal before migrating again. For production,
use `make db/prod/migrate`; it runs Prisma's deploy command instead of the local
development migrator.

Reach for `make db/local/rebuild` when migration/schema changes appear stuck due
to persisted local Docker volume state, or when you deliberately want an empty
local database from scratch.

Run `make db/local/verify` when you want a quick confidence check that `.env`
points at the local Postgres database, Docker Compose sees the service, Prisma
loads the schema, and Prisma can execute a query against the configured database.

## How it works

- **No auth.** Anyone can create projects. The home page shows a shared pool of
  up to 50 recent projects.
- **Two modes per prompt.** "Code" runs the full agent (generates files, boots
  an E2B sandbox, renders a live demo). "Ask" answers questions without
  touching the sandbox.
- **Model switching.** Pick any model from a provider you have a key for.
  Selection is saved to `localStorage` (`imaginate:selected-model`) and survives
  reloads; it's cleared automatically if the chosen provider's key is removed.
- **FIFO eviction.** When the 51st project is created, the oldest by
  `updatedAt` is dropped. Sending messages to a project bumps its `updatedAt`,
  so active conversations are protected.
- **Rate limiting.** Project and message creation is capped per IP (see
  `RATE_LIMIT_PER_HOUR`) to protect the shared provider budgets.

## Models

By default, requests route through OpenRouter via
`@openrouter/ai-sdk-provider`. Wiring lives in `src/platform/models/` (factory,
route registry, and per-call fallback resolution).

Set the local development interface below to bypass the production ladder:

```bash
MODEL_PROVIDER=lmstudio
LM_STUDIO_BASE_URL=http://127.0.0.1:1234/v1
LM_STUDIO_MODEL=qwen/qwen3-coder-next
```

`LM_STUDIO_MODEL` is any model id loaded in your LM Studio server (the "API
Model Identifier" shown on the model's Info tab). Tested locally:

| Model id                | Notes                                                    |
| ----------------------- | -------------------------------------------------------- |
| `qwen/qwen3-coder-next` | Default. Qwen3 Coder Next (MLX 4-bit, ~45 GB, tool use). |
| `gemma-4-31b-it`        | Gemma 4 31B Instruct.                                    |

Swap by changing `LM_STUDIO_MODEL` and restarting; load the matching model in
LM Studio first.

In LM Studio mode the planner and executor both use `LM_STUDIO_MODEL`, and
`EXECUTOR_LADDER` contains one entry. OpenRouter model keys and route fallbacks
are ignored until `MODEL_PROVIDER` is switched back to `openrouter`.

### Available model keys

Defined in `src/shared/config/models.ts`. Set the env vars below to one of
these keys to swap the model used for a given role.

| Key                     | OpenRouter slug                        |
| ----------------------- | -------------------------------------- |
| `GEMINI_3_1_FLASH_LITE` | `google/gemini-3.1-flash-lite-preview` |
| `GEMINI_2_5_FLASH_LITE` | `google/gemini-2.5-flash-lite`         |
| `GEMINI_3_FLASH`        | `google/gemini-3-flash-preview`        |
| `GEMMA_3_27B`           | `google/gemma-3-27b-it`                |
| `OPENAI_GPT_5_CODEX`    | `openai/gpt-5-codex`                   |
| `OPENAI_GPT_5_MINI`     | `openai/gpt-5-mini`                    |
| `CLAUDE_OPUS_4_7`       | `anthropic/claude-opus-4.7`            |
| `CLAUDE_SONNET_4_6`     | `anthropic/claude-sonnet-4.6`          |
| `CLAUDE_HAIKU_4_5`      | `anthropic/claude-haiku-4.5`           |
| `DEEPSEEK_CHAT_V3_1`    | `deepseek/deepseek-chat-v3.1`          |
| `DEEPSEEK_V3_2`         | `deepseek/deepseek-v3.2`               |
| `KIMI_K2_6`             | `moonshotai/kimi-k2.6`                 |
| `QWEN_3_CODER`          | `qwen/qwen3-coder`                     |
| `GROK_4_1_FAST`         | `x-ai/grok-4.1-fast`                   |
| `GROK_CODE_FAST_1`      | `x-ai/grok-code-fast-1`                |

### Roles and defaults

| Role                  | Env var                     | Default                 |
| --------------------- | --------------------------- | ----------------------- |
| Planner               | `MODEL_PLANNER`             | `GEMINI_3_1_FLASH_LITE` |
| Executor (default)    | `MODEL_EXECUTOR_DEFAULT`    | `CLAUDE_SONNET_4_6`     |
| Executor (fallback 1) | `MODEL_EXECUTOR_FALLBACK_1` | `CLAUDE_HAIKU_4_5`      |
| Executor (fallback 2) | `MODEL_EXECUTOR_FALLBACK_2` | `CLAUDE_OPUS_4_7`       |

Executor ladder order on failure: default → fallback 1 → fallback 2.

When `MODEL_PROVIDER=lmstudio`, the executor ladder is just
`lmstudio:${LM_STUDIO_MODEL}`.

### Per-call OpenRouter fallbacks

Each role above also ships with a curated OpenRouter `models[]` fallback list
(see `MODEL_ROUTES` in `src/platform/models/constants.ts`). OpenRouter walks
this list left-to-right when the primary errors with a retryable failure
(rate limit, downtime, moderation, context-length validation). Cross-provider
diversity is intentional — a single-provider outage should not take down a
layer. This is independent of the executor ladder above: the ladder kicks in
when an entire route fails, the per-call fallbacks handle transient primary
failures within a route.

To experiment, set e.g. `MODEL_EXECUTOR_DEFAULT=KIMI_K2_6` in `.env` and
restart. Unknown keys fail Zod validation at startup. To add a new model,
append it to `MODEL_IDS` in `src/shared/config/models.ts` (confirm the slug
is live on <https://openrouter.ai/models> first — IDs and pricing change).

## CLI

`npm run agent:local` runs the agent loop from the terminal against a real E2B
sandbox, using the same planner/executor wiring as the web app. Useful for
iterating on prompts, model swaps, or tool changes without booting Next.js.

Requires `.env` to contain `E2B_API_KEY` plus either `OPENROUTER_API_KEY` (for
the default provider) or `MODEL_PROVIDER=lmstudio` with a running LM Studio
server.

### Usage

```bash
npm run agent:local -- [options] [...prompt]
```

Pass the prompt either positionally or via `--prompt` — not both.

### Options

| Flag                        | Description                                                 |
| --------------------------- | ----------------------------------------------------------- |
| `--prompt <text>`           | Prompt to send to the agent.                                |
| `--sandbox-template <name>` | E2B template for new sandboxes (default `imaginate-dev`).   |
| `--sandbox-id <id>`         | Connect to an existing E2B sandbox instead of creating one. |
| `--json`                    | Emit JSONL records (events, plan, outcome, sandbox info).   |
| `-h`, `--help`              | Show help.                                                  |

### Examples

```bash
# Positional prompt, fresh sandbox from the default template
npm run agent:local -- "add a dark mode toggle"

# Same prompt via --prompt
npm run agent:local -- --prompt "add a dark mode toggle"

# Override the E2B template
npm run agent:local -- --sandbox-template imaginate-dev "add a dark mode toggle"

# Reconnect to an existing sandbox to continue a run
npm run agent:local -- --sandbox-id sbx_existing "continue the previous fix"

# JSONL output (one record per line) for piping into jq or a log store
npm run agent:local -- --json --prompt "add a dark mode toggle"
```

After a successful run the CLI prints the sandbox URL plus a follow-up command
preconfigured with `--sandbox-id` so you can keep iterating against the same
sandbox. Exit code is `0` on success and `1` on agent failure or invalid args.

## E2B sandbox template

The app creates project sandboxes from the `imaginate-dev` E2B template defined
in `sandbox-templates/nextjs/e2b.toml`. Rebuild this template whenever the
template files change, or if E2B reports that the template envd is too old for
snapshot support.

- `make sandbox/build`
  Builds and publishes the `sandbox-templates/nextjs` template to E2B using the
  v2 `@e2b/cli` template create flow.

After rebuilding the template, reset the app database if old project rows point
at sandboxes created from the previous template.

The E2B CLI may ask you to authenticate. For non-interactive auth, set
`E2B_ACCESS_TOKEN` from the E2B dashboard; this is different from
`E2B_API_KEY`.

Note: do not use `e2b template build` for this template right now. Our
`e2b.toml` is still in the v1 format, and `template build` routes v1 configs
through the deprecated Docker registry flow. `make sandbox/build` uses the v2
`template create` command, which works regardless of the toml format.

## Tech stack

- Next.js 16 (App Router) + React 19
- tRPC + TanStack Query
- Prisma + Postgres
- Inngest + `@inngest/agent-kit` for async agent workflows
- E2B Code Interpreter sandboxes
- shadcn/ui + Tailwind
- `rate-limiter-flexible` for per-IP limits

## Repository docs

Project conventions live under `docs/` and are read by both humans and coding agents:

- [`AGENTS.md`](./AGENTS.md) — entrypoint for any agent (Claude, Codex, etc.). Maps tasks and slash commands (`/plan`, `/simplify`, `/review`, `/plans-audit`, …) to the docs that must be loaded before doing the work. `CLAUDE.md` is a symlink to `AGENTS.md` at the same level, so Claude Code's auto-loaded `CLAUDE.md` resolves to the AGENTS.md content directly — single source of truth, no duplication. Any new `AGENTS.md` added under `docs/` should ship with a sibling `CLAUDE.md` symlink (`ln -s AGENTS.md CLAUDE.md`).
- [`docs/architecture/architecture.md`](./docs/architecture/architecture.md) — source of truth for how `src/` is organized (folder shape, dependency direction, where new code goes). Update in the same PR as any structural change.
- [`docs/code-style/AGENTS.md`](./docs/code-style/AGENTS.md) — project-wide style rules a linter/formatter doesn't enforce.
- [`docs/plans/AGENTS.md`](./docs/plans/AGENTS.md) — how to write, audit, and retire plans for work spanning more than one PR. Plans live in `docs/plans/open/` while active, `docs/plans/drift/` for auto-generated architecture-realignment plans, and `docs/plans/archive/` once shipped when they have lasting decision value.

Read `AGENTS.md` before contributing — it tells you which doc to consult for the task at hand.

## Manual validation

See [`manual_validation.md`](./manual_validation.md) for end-to-end
verification steps covering project creation, FIFO eviction, rate limiting,
and the provider selector UX.
