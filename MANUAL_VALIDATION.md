# Manual Validation — OpenRouter

For the model list, env vars, and a high-level summary, see the README's
**Provider API key**, **Environment variables**, and **Models** sections. This
doc covers the steps specific to validating an OpenRouter key end-to-end.

## 1. Get a key

1. Sign in at https://openrouter.ai/ (Google/GitHub).
2. Open https://openrouter.ai/settings/keys → **Create Key** (e.g.
   `imaginate-dev`), optionally set a credit limit.
3. Copy the key (`sk-or-v1-...`) — it is only shown once.
4. Add a few dollars of credit at https://openrouter.ai/credits — most models
   are pay-per-token.

## 2. Wire it in

Add to `.env` (or `.env.local`) at the repo root:

```
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

The key is read server-side only via `src/lib/provider-config.ts` (note
`import "server-only"`). Restart `next dev` after editing `.env`.

Schema lives at `src/lib/config/env.ts:15`. `OPENROUTER_API_KEY` is optional in
the schema but required at runtime — `resolveSpec` throws
`No API key available` if missing (`src/inngest/model-factory.ts:59`).

## 3. Verify

- `npm run dev`
- Trigger a project generation flow; planner + executor calls go through
  OpenRouter.
- On a missing/invalid key, Inngest steps fail with
  `No API key available (wanted openrouter:<model>)`.
- Watch usage live at https://openrouter.ai/activity.
