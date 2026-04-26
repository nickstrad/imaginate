# Chunk 4: Local Agent Script

## Goal

Add a local CLI adapter that runs the extracted planner/executor runtime without
the web app, tRPC, or Inngest dev server. The script should be thin: it owns CLI
parsing, sandbox creation/connection, terminal formatting, and exit codes while
delegating planner/executor control flow to `@/lib/agents`.

This is the main developer-experience payoff of the decoupling plan:

```bash
npm run agent:local -- "add a dark mode toggle"
```

## The Problem

Chunks 1-3 moved the runtime into `src/lib/agents` and made Inngest an adapter,
but developers still need to start the app/Inngest path to exercise the agent.
That slows prompt, model, tool, and escalation debugging even though the runtime
is now importable from the leaf `src/lib` layer described by the architecture
doc's "`src/lib/` - framework-agnostic building blocks" section.

There is one local-runner trap to handle explicitly: importing the runtime pulls
through server-only modules such as `@/lib/config/env` and `@/lib/log`. A plain
`tsx scripts/agent-local.ts` invocation loads the `server-only` package's default
entrypoint and throws. The package script must run Node with the React server
condition enabled.

## What After Looks Like

Files:

- Add `scripts/agent-local.ts`
- Update `package.json`
- Do not add `scripts/README.md` in this chunk; the command surface is still
  small enough for this plan and `--help` output.

Package script:

```json
{
  "agent:local": "NODE_OPTIONS=--conditions=react-server tsx scripts/agent-local.ts"
}
```

Supported command shapes:

```bash
npm run agent:local -- "add a dark mode toggle"
npm run agent:local -- --prompt "add a dark mode toggle"
npm run agent:local -- --sandbox-template imaginate-dev "add a dark mode toggle"
npm run agent:local -- --sandbox-id sbx_existing "continue the previous fix"
npm run agent:local -- --json --prompt "add a dark mode toggle"
```

CLI parsing rules:

- Accept the prompt as either positional text or `--prompt <text>`.
- Join multiple positional arguments with spaces.
- If both `--prompt` and positional text are present, fail with usage text rather
  than guessing which prompt wins.
- Support `--sandbox-template <name>`, defaulting to `imaginate-dev`.
- Support `--sandbox-id <id>` to connect to an existing E2B sandbox instead of
  creating one.
- If both `--sandbox-id` and `--sandbox-template` are present, allow it but ignore
  the template for creation because the existing sandbox id wins.
- Support `--json` for JSONL output.
- Support `--help` / `-h`.
- Print usage and exit nonzero when no prompt is provided.
- Unknown flags should fail with usage text.

Runtime wiring:

```ts
import { Sandbox } from "@e2b/code-interpreter";
import {
  AgentRuntimeEventType,
  createRunState,
  runCodingAgentWithEscalation,
  runPlanner,
  type AgentRuntimeEvent,
  type AgentRuntimeHooks,
  type ExecuteOutcome,
} from "@/lib/agents";
import { createLogger } from "@/lib/log";
import { SANDBOX_DEFAULT_TIMEOUT_MS } from "@/lib/sandbox";

async function main() {
  const args = parseArgv(process.argv.slice(2));
  const log = createLogger({ scope: "agent:local" });
  const runState = createRunState();
  const thoughts = [];
  const cumulativeUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  const previousMessages = [];

  let sandboxPromise:
    | Promise<Awaited<ReturnType<typeof Sandbox.create>>>
    | undefined;
  const getSandbox = () => {
    sandboxPromise ??= args.sandboxId
      ? Sandbox.connect(args.sandboxId)
      : Sandbox.create(args.sandboxTemplate);
    return sandboxPromise.then(async (sandbox) => {
      await sandbox.setTimeout(SANDBOX_DEFAULT_TIMEOUT_MS);
      return sandbox;
    });
  };

  const hooks: AgentRuntimeHooks = {
    getSandbox,
    emit: (event) => printEvent(event, args.json),
  };

  const plan = await runPlanner({
    userPrompt: args.prompt,
    previousMessages,
    log,
    hooks,
  });
  printPlan(plan, args.json);

  if (!plan.requiresCoding) {
    printNoCodeAnswer(plan.answer, args.json);
    return 0;
  }

  runState.plan = plan;
  const outcome = await runCodingAgentWithEscalation({
    thoughts,
    cumulativeUsage,
    plan,
    runState,
    previousMessages,
    userPrompt: args.prompt,
    log,
    hooks,
  });

  printOutcome(outcome, args.json);
  return exitCodeForOutcome(outcome);
}
```

The script should create/connect the sandbox lazily through a promise-backed
singleton so planner-only runs do not pay for E2B. `hooks.persistTelemetry`
should be omitted in v1; final telemetry can be printed from the returned
`ExecuteOutcome` and `runState`.

## Output

Human output should be compact but complete enough to debug a run:

```txt
planner.started
planner.finished taskType=new_feature requiresCoding=true verification=tsc targetFiles=src/modules/...
executor.attempt.started attempt=1 model=openrouter:...
executor.step.finished step=0 finishReason=tool-calls tools=listFiles,readFiles
executor.step.finished step=1 finishReason=stop tools=applyPatch,runBuild,finalize
executor.accepted attempt=1
agent.finished status=success steps=2 totalTokens=12345 lastError=-

Final output
status: success
title: Fragment
summary: ...

Verification
- build: success npm run build

Files written
- src/modules/...

Usage
promptTokens=... completionTokens=... totalTokens=...
```

Format all current runtime events:

- `planner.started`
- `planner.finished`
- `planner.failed`
- `executor.attempt.started`
- `executor.step.finished`
- `executor.attempt.failed`
- `executor.escalated`
- `executor.accepted`
- `agent.finished`

Use `AgentRuntimeEventType` constants rather than string literals in formatter
switches.

JSON mode emits JSONL records, one object per line:

```json
{"type":"event","event":{"type":"planner.started"}}
{"type":"plan","plan":{"requiresCoding":true}}
{"type":"outcome","status":"success","finalOutput":{}}
```

The JSON outcome record should include:

- `status`
- `finalOutput`
- `verification`
- `filesWritten`
- `usage`
- `stepsCount`
- `lastErrorMessage`

Do not print pretty logs or extra prose in JSON mode beyond these JSONL records.

## Exit Codes

- `0` when no coding is required and the answer is printed.
- `0` when coding completes with a final output whose status is not `failed`.
- `1` when required args are missing or invalid.
- `1` when execution finishes without final output.
- `1` when `finalOutput.status === "failed"`.
- `1` for uncaught errors after printing the error to stderr in human mode or a
  JSONL `{ "type": "error", ... }` record in JSON mode.

## Sequencing

1. Add pure helpers inside `scripts/agent-local.ts`: argv parsing, usage text,
   event formatting, outcome formatting, and exit-code classification.
2. Add the `main()` flow around `runPlanner` and
   `runCodingAgentWithEscalation`.
3. Update `package.json` with `agent:local`.
4. Add narrow tests only if the helpers are exported or can be tested without
   importing live model/sandbox dependencies. Otherwise, rely on existing
   `src/lib/agents` runtime tests plus command-shape smoke checks.

## Definition Of Done / Verification

- `npm run agent:local -- "..."` does not require the Next server.
- `npm run agent:local -- "..."` does not require the Inngest dev server.
- The script calls `runPlanner` and `runCodingAgentWithEscalation` from
  `@/lib/agents`.
- The package script includes `NODE_OPTIONS=--conditions=react-server`.
- Missing prompt and unknown-flag invocations print usage and exit `1`.
- `--json` emits JSONL records without human prose.
- Human mode prints events, final output, verification rows, files written,
  usage totals, and last error.
- `npm test -- src/lib/agents` passes.
- `npm run format:check -- docs/plans/open/agent-runtime-decoupling/04-local-script.md scripts/agent-local.ts package.json`
  passes.
- A real provider/E2B smoke run is manual because it requires live credentials.

## Out Of Scope

- `--ask` mode.
- Loading project history or previous messages.
- Interactive prompting or confirmation flows.
- JSONL telemetry archive files.
- A durable local run database.
- Preview URL readiness or browser opening after a run.
- Moving the local command to the future `src/interfaces/cli` shape from the
  broader `agent-core-architecture` plan.

## Conflicts Checked

Reviewed `docs/plans/open/` and `docs/plans/drift/` in
`mwt-agent-04`. This chunk overlaps with
`agent-core-architecture/05-local-runtime-and-cleanup.md`, which describes the
future destination after a broader architecture migration. This chunk remains
the near-term adapter over `src/lib/agents`. It also touches sandbox creation
policy, but does not implement the deeper lifecycle extraction from
`testability-refactor/05-with-sandbox-lifecycle.md`.
