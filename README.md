# Imaginate

Imaginate is a public-demo AI app builder. Describe what you want in natural
language and an agent generates the code and runs it live in a sandbox — no
sign-in required.

## Getting Started

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

## Provider API key

All LLM calls are routed through [OpenRouter](https://openrouter.ai), which
proxies OpenAI, Anthropic, Google (Gemini + Gemma), DeepSeek, Kimi, and others under a
single key. Set `OPENROUTER_API_KEY` in `.env` — get one at
<https://openrouter.ai/keys>.

## Environment variables

| Variable                    | Required | Notes                                                    |
| --------------------------- | -------- | -------------------------------------------------------- |
| `DATABASE_URL`              | yes      | Postgres connection string (project targets Neon)        |
| `NEXT_PUBLIC_APP_URL`       | yes      | e.g. `http://localhost:3000`                             |
| `E2B_API_KEY`               | yes      | <https://e2b.dev> — sandbox for generated code           |
| `OPENROUTER_API_KEY`        | yes      | <https://openrouter.ai/keys>                             |
| `RATE_LIMIT_PER_HOUR`       | no       | per-IP limit on project + message creation; default `10` |
| `LOG_LEVEL`                 | no       | `debug` \| `info` \| `warn` \| `error` (default `info`)  |
| `LOG_PRETTY`                | no       | `auto` \| `true` \| `false` (default `auto`)             |
| `MODEL_PLANNER`             | no       | model key for the planner role — see **Models**          |
| `MODEL_EXECUTOR_DEFAULT`    | no       | model key for the default executor                       |
| `MODEL_EXECUTOR_FALLBACK_1` | no       | model key for the first executor fallback                |
| `MODEL_EXECUTOR_FALLBACK_2` | no       | model key for the second executor fallback               |

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

All requests are routed through OpenRouter via `@openrouter/ai-sdk-provider`.
Wiring lives in `src/lib/models/factory.ts`.

### Available model keys

Defined in `src/lib/config/models.ts`. Set the env vars below to one of these
keys to swap the model used for a given role.

| Key                     | OpenRouter slug                        |
| ----------------------- | -------------------------------------- |
| `GEMINI_3_1_FLASH_LITE` | `google/gemini-3.1-flash-lite-preview` |
| `GEMINI_3_FLASH`        | `google/gemini-3-flash-preview`        |
| `GEMMA_3_27B`           | `google/gemma-3-27b-it`                |
| `OPENAI_GPT_5`          | `openai/gpt-5`                         |
| `CLAUDE_SONNET_4_6`     | `anthropic/claude-sonnet-4.6`          |
| `DEEPSEEK_CHAT_V3_1`    | `deepseek/deepseek-chat-v3.1`          |
| `KIMI_K2_6`             | `moonshotai/kimi-k2.6`                 |

### Roles and defaults

| Role                  | Env var                     | Default                 |
| --------------------- | --------------------------- | ----------------------- |
| Planner               | `MODEL_PLANNER`             | `GEMINI_3_1_FLASH_LITE` |
| Executor (default)    | `MODEL_EXECUTOR_DEFAULT`    | `GEMINI_3_FLASH`        |
| Executor (fallback 1) | `MODEL_EXECUTOR_FALLBACK_1` | `OPENAI_GPT_5`          |
| Executor (fallback 2) | `MODEL_EXECUTOR_FALLBACK_2` | `CLAUDE_SONNET_4_6`     |

Executor ladder order on failure: default → fallback 1 → fallback 2.

To experiment, set e.g. `MODEL_EXECUTOR_DEFAULT=KIMI_K2_6` in `.env` and
restart. Unknown keys fail Zod validation at startup. To add a new model,
append it to `MODEL_IDS` in `src/lib/config/models.ts` (confirm the slug is
live on <https://openrouter.ai/models> first — IDs and pricing change).

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
