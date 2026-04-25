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

## Provider API keys

Set at least one provider key in `.env`. Each is individually optional, but
at least one must be present for the agent to run. Providers without a key
show up as disabled entries in the model picker.

- `OPENAI_API_KEY` — <https://platform.openai.com/api-keys>
- `ANTHROPIC_API_KEY` — <https://console.anthropic.com/settings/keys>
- `GEMINI_API_KEY` — <https://aistudio.google.com/app/projects>

## Environment variables

| Variable              | Required | Notes                                                    |
| --------------------- | -------- | -------------------------------------------------------- |
| `DATABASE_URL`        | yes      | Postgres connection string (project targets Neon)        |
| `NEXT_PUBLIC_APP_URL` | yes      | e.g. `http://localhost:3000`                             |
| `E2B_API_KEY`         | yes      | <https://e2b.dev> — sandbox for generated code           |
| `OPENAI_API_KEY`      | any one  | see above                                                |
| `ANTHROPIC_API_KEY`   | any one  | see above                                                |
| `GEMINI_API_KEY`      | any one  | see above                                                |
| `RATE_LIMIT_PER_HOUR` | no       | per-IP limit on project + message creation; default `10` |

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

## Manual validation

See [`manual_validation.md`](./manual_validation.md) for end-to-end
verification steps covering project creation, FIFO eviction, rate limiting,
and the provider selector UX.
