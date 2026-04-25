# Chunk 4: Local Agent Script

## Goal

Add a local script that runs the same planner/executor runtime without the web app, tRPC, or Inngest dev server.

This is the main developer-experience payoff.

## Files

- Add `scripts/agent-local.ts`
- Update `package.json`
- Optionally add `scripts/README.md` if script usage grows

## Command

Target usage:

```bash
npm run agent:local -- "add a dark mode toggle"
```

Optional flags can come later, but useful first-pass flags are:

```bash
npm run agent:local -- --prompt "..." --sandbox-template imaginate-dev
npm run agent:local -- --ask "explain the auth flow"
npm run agent:local -- --json
```

Keep the first version simple. A positional prompt is enough.

## Behavior

The script should:

1. Read the prompt from CLI args.
2. Create or connect to an E2B sandbox.
3. Build `previousMessages` as an empty array by default.
4. Run `runPlanner`.
5. If `plan.requiresCoding === false`, print the answer and exit.
6. Run `runCodingAgentWithEscalation`.
7. Print runtime events as they happen.
8. Print final output, verification rows, files written, usage, and last error.

## Local Hooks

Use the same `AgentRuntimeHooks` contract:

```ts
const hooks: AgentRuntimeHooks = {
  getSandbox: async () => sandbox,
  emit: async (event) => {
    console.log(formatAgentEvent(event));
  },
  persistTelemetry: async (payload) => {
    if (jsonlPath) appendJsonl({ type: "telemetry", payload });
  },
};
```

For the first pass, `persistTelemetry` can be omitted or just print compact totals.

## Target Integration Example

The local script should feel like a thin adapter over the same runtime:

```ts
// scripts/agent-local.ts
import { Sandbox } from "@e2b/code-interpreter";
import {
  createRunState,
  runPlanner,
  runCodingAgentWithEscalation,
  type AgentRuntimeHooks,
} from "@/lib/agents";
import { createLogger } from "@/lib/log";

async function main() {
  const userPrompt = readPromptFromArgv(process.argv);
  const log = createLogger({ scope: "agent:local" });
  const sandbox = await Sandbox.create("imaginate-dev");

  const hooks: AgentRuntimeHooks = {
    getSandbox: async () => sandbox,
    emit: async (event) => {
      console.log(formatAgentEvent(event));
    },
    persistTelemetry: async (payload) => {
      console.log(formatTelemetry(payload));
    },
  };

  const previousMessages = [];
  const plan = await runPlanner({
    userPrompt,
    previousMessages,
    log,
    hooks,
  });

  if (!plan.requiresCoding) {
    console.log(plan.answer ?? "No code changes required.");
    return;
  }

  const runState = createRunState();
  runState.plan = plan;

  const outcome = await runCodingAgentWithEscalation({
    thoughts: [],
    cumulativeUsage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    plan,
    runState,
    previousMessages,
    userPrompt,
    log,
    hooks,
  });

  printFinalOutcome(outcome);
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

Example terminal output:

```txt
planner.started
planner.finished taskType=new_feature verification=tsc targetFiles=src/modules/...
executor.attempt.started attempt=1 model=openrouter:...
executor.step.finished step=0 tools=listFiles,readFiles
executor.step.finished step=1 tools=applyPatch,runBuild,finalize
executor.accepted attempt=1
agent.finished status=success filesWritten=2 verificationSuccess=1
```

Formatter sketch:

```ts
function formatAgentEvent(event: AgentRuntimeEvent): string {
  switch (event.type) {
    case "planner.finished":
      return [
        "planner.finished",
        `taskType=${event.plan.taskType}`,
        `verification=${event.plan.verification}`,
        `targetFiles=${event.plan.targetFiles.join(",") || "-"}`,
      ].join(" ");
    case "executor.step.finished":
      return [
        "executor.step.finished",
        `step=${event.step.stepIndex}`,
        `tools=${
          event.step.toolCalls.map((tc) => tc.toolName).join(",") || "-"
        }`,
      ].join(" ");
    default:
      return event.type;
  }
}
```

## Package Script

Prefer a repo-local TypeScript runner already present in the dependency tree. If none exists, add the smallest practical dev dependency.

Possible scripts:

```json
{
  "agent:local": "tsx scripts/agent-local.ts"
}
```

or, if avoiding a new dependency:

```json
{
  "agent:local": "npx tsx scripts/agent-local.ts"
}
```

## Acceptance

- Running `npm run agent:local -- "..."` does not require the Next server.
- Running it does not require Inngest dev server.
- The script calls the same `runPlanner` and `runCodingAgentWithEscalation` exports used by Inngest.
- Events are readable enough to debug model/tool behavior from a terminal.
