import { Sandbox } from "@e2b/code-interpreter";
import type { ModelMessage } from "ai";
import { cac } from "cac";
import chalk from "chalk";
import pino from "pino";
import {
  AgentRuntimeEventType,
  createRunState,
  runCodingAgentWithEscalation,
  runPlanner,
  type AgentRuntimeEvent,
  type AgentRuntimeHooks,
  type ExecuteOutcome,
  type PlanOutput,
  type SandboxLike,
  type UsageTotals,
} from "@/lib/agents";
import {
  createLogger,
  type Logger,
  type LogInput,
  type LogMetadata,
} from "@/lib/log";
import {
  ensurePreviewReady,
  getSandboxUrl,
  SANDBOX_DEFAULT_TIMEOUT_MS,
} from "@/lib/sandbox";
import type { Thought } from "@/lib/schemas/thought";

const DEFAULT_SANDBOX_TEMPLATE = "imaginate-dev";
const localJsonLogger = pino({
  base: null,
  timestamp: false,
  messageKey: "event",
  formatters: {
    level: (label) => ({ level: label }),
  },
  mixin: () => ({ type: "log" }),
});

type CliArgs = {
  prompt: string;
  sandboxTemplate: string;
  sandboxId?: string;
  json: boolean;
};

type ParsedCli =
  | { kind: "help" }
  | {
      kind: "run";
      args: CliArgs;
    };

type SandboxSummary =
  | {
      sandboxId: string;
      sandboxUrl: string;
      followUpCommand: string;
      sandboxUrlError?: undefined;
    }
  | {
      sandboxId?: undefined;
      sandboxUrl?: undefined;
      followUpCommand?: undefined;
      sandboxUrlError: string;
    }
  | {
      sandboxId?: undefined;
      sandboxUrl?: undefined;
      followUpCommand?: undefined;
      sandboxUrlError?: undefined;
    };

type LocalLogMetadata = Record<
  string,
  string | number | boolean | null | undefined
>;

class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

const ALLOWED_OPTIONS = new Set([
  "--",
  "prompt",
  "sandboxTemplate",
  "sandboxId",
  "json",
  "help",
  "h",
]);

function createCli() {
  return cac("agent:local")
    .usage("[options] [...prompt]")
    .option("--prompt <text>", "Prompt to send to the agent.")
    .option("--sandbox-template <name>", "E2B template for new sandboxes.", {
      default: DEFAULT_SANDBOX_TEMPLATE,
    })
    .option(
      "--sandbox-id <id>",
      "Connect to an existing E2B sandbox instead of creating one."
    )
    .option("--json", "Emit JSONL records.")
    .example('npm run agent:local -- "add a dark mode toggle"')
    .example('npm run agent:local -- --prompt "add a dark mode toggle"')
    .example(
      'npm run agent:local -- --sandbox-template imaginate-dev "add a dark mode toggle"'
    )
    .example(
      'npm run agent:local -- --sandbox-id sbx_existing "continue the previous fix"'
    )
    .example('npm run agent:local -- --json --prompt "add a dark mode toggle"')
    .help();
}

function parseArgv(argv: string[]): ParsedCli {
  const cli = createCli();
  const parsed = cli.parse(["node", "agent-local", ...argv], { run: false });
  const options = parsed.options;

  if (options.help || options.h) {
    return { kind: "help" };
  }

  rejectUnknownOptions(options);

  const prompt = readStringOption(options.prompt, "--prompt");
  const sandboxTemplate =
    readStringOption(options.sandboxTemplate, "--sandbox-template") ??
    DEFAULT_SANDBOX_TEMPLATE;
  const sandboxId = readStringOption(options.sandboxId, "--sandbox-id");
  const resolvedPrompt = resolvePrompt(prompt, parsed.args.map(String));

  return {
    kind: "run",
    args: {
      prompt: resolvedPrompt,
      sandboxTemplate,
      sandboxId,
      json: Boolean(options.json),
    },
  };
}

function rejectUnknownOptions(options: Record<string, unknown>): void {
  for (const key of Object.keys(options)) {
    if (!ALLOWED_OPTIONS.has(key)) {
      throw new CliError(`Unknown option: --${key}`);
    }
  }
}

function readStringOption(value: unknown, flag: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new CliError(`${flag} requires a value.`);
  }
  return value;
}

function resolvePrompt(
  promptOption: string | undefined,
  positional: string[]
): string {
  const positionalPrompt = positional.join(" ").trim();
  if (promptOption !== undefined && positionalPrompt) {
    throw new CliError(
      "Pass the prompt either positionally or with --prompt, not both."
    );
  }

  const prompt = (promptOption ?? positionalPrompt).trim();
  if (!prompt) {
    throw new CliError("Missing prompt.");
  }
  return prompt;
}

function outputHelp(): void {
  createCli().outputHelp();
}

function makeLogger(json: boolean): Logger {
  if (!json) {
    return createLogger({ scope: "agent:local" });
  }

  const noop = (_input: LogInput) => undefined;
  const logger: Logger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: (_params: { scope: string; bindings?: LogMetadata }) => logger,
  };
  return logger;
}

function printJson(record: unknown): void {
  console.log(JSON.stringify(record));
}

function printLocalLog(
  event: string,
  json: boolean,
  metadata: LocalLogMetadata = {}
): void {
  if (json) {
    localJsonLogger.info({ metadata: compactMetadata(metadata) }, event);
    return;
  }

  const fields = formatMetadata(metadata);
  console.log(
    `${chalk.gray("[agent:local]")} ${chalk.cyan(event)}${
      fields ? ` ${fields}` : ""
    }`
  );
}

function compactMetadata(metadata: LocalLogMetadata): LocalLogMetadata {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined)
  );
}

function formatMetadata(metadata: LocalLogMetadata): string {
  return Object.entries(compactMetadata(metadata))
    .map(([key, value]) => `${chalk.gray(`${key}=`)}${formatLogValue(value)}`)
    .join(" ");
}

function formatLogValue(value: LocalLogMetadata[string]): string {
  if (value === true) {
    return chalk.green("true");
  }
  if (value === false) {
    return chalk.red("false");
  }
  if (typeof value === "number") {
    return chalk.yellow(String(value));
  }
  return chalk.white(String(value ?? "-"));
}

function printUsage(error?: string): void {
  if (error) {
    console.error(error);
    console.error("");
  }
  outputHelp();
}

function formatList(values: string[]): string {
  return values.length ? values.join(",") : "-";
}

function formatEvent(event: AgentRuntimeEvent): string {
  switch (event.type) {
    case AgentRuntimeEventType.PlannerStarted:
      return event.type;
    case AgentRuntimeEventType.PlannerFinished:
      return [
        event.type,
        `taskType=${event.plan.taskType}`,
        `requiresCoding=${event.plan.requiresCoding}`,
        `verification=${event.plan.verification}`,
        `targetFiles=${formatList(event.plan.targetFiles)}`,
      ].join(" ");
    case AgentRuntimeEventType.PlannerFailed:
      return [event.type, `error=${event.error}`].join(" ");
    case AgentRuntimeEventType.ExecutorAttemptStarted:
      return [
        event.type,
        `attempt=${event.attempt}`,
        `model=${event.model}`,
      ].join(" ");
    case AgentRuntimeEventType.ExecutorStepFinished:
      return [
        event.type,
        `step=${event.step.stepIndex}`,
        `finishReason=${event.step.finishReason ?? "-"}`,
        `tools=${formatList(
          event.step.thought.toolCalls?.map((tc) => tc.toolName) ?? []
        )}`,
      ].join(" ");
    case AgentRuntimeEventType.ExecutorAttemptFailed:
      return [
        event.type,
        `attempt=${event.attempt}`,
        `category=${event.category}`,
        `retryable=${event.retryable}`,
      ].join(" ");
    case AgentRuntimeEventType.ExecutorEscalated:
      return [
        event.type,
        `attempt=${event.attempt}`,
        `reason=${event.reason ?? "-"}`,
      ].join(" ");
    case AgentRuntimeEventType.ExecutorAccepted:
      return [event.type, `attempt=${event.attempt}`].join(" ");
    case AgentRuntimeEventType.AgentFinished:
      return [
        event.type,
        `status=${event.finalOutput?.status ?? "missing"}`,
        `steps=${event.stepsCount}`,
        `totalTokens=${event.usage.totalTokens}`,
        `lastError=${event.lastErrorMessage ?? "-"}`,
      ].join(" ");
  }
}

function printEvent(event: AgentRuntimeEvent, json: boolean): void {
  if (json) {
    printJson({ type: "event", event });
    return;
  }
  printLocalLog("runtime.event", json, { event: formatEvent(event) });
}

function printPlan(plan: PlanOutput, json: boolean): void {
  if (json) {
    printJson({ type: "plan", plan });
  }
}

function printNoCodeAnswer(answer: string | undefined, json: boolean): void {
  const output = answer?.trim() || "No code changes required.";
  if (json) {
    printJson({ type: "outcome", status: "success", answer: output });
    return;
  }
  printLocalLog("run.answer", json, { answer: output });
}

function outcomeStatus(outcome: ExecuteOutcome): string {
  return outcome.runState.finalOutput?.status ?? "missing";
}

function exitCodeForOutcome(outcome: ExecuteOutcome): number {
  const finalOutput = outcome.runState.finalOutput;
  if (!finalOutput) {
    return 1;
  }
  return finalOutput.status === "failed" ? 1 : 0;
}

function printOutcome(
  outcome: ExecuteOutcome,
  json: boolean,
  sandboxSummary: SandboxSummary = {}
): void {
  const finalOutput = outcome.runState.finalOutput;
  const verification =
    finalOutput?.verification ?? outcome.runState.verification;
  const filesWritten = Object.keys(outcome.runState.filesWritten);

  if (json) {
    printJson({
      type: "outcome",
      status: outcomeStatus(outcome),
      finalOutput,
      verification,
      filesWritten,
      usage: outcome.usage,
      stepsCount: outcome.stepsCount,
      lastErrorMessage: outcome.lastErrorMessage,
      sandboxId: sandboxSummary.sandboxId,
      sandboxUrl: sandboxSummary.sandboxUrl,
      sandboxUrlError: sandboxSummary.sandboxUrlError,
      followUpCommand: sandboxSummary.followUpCommand,
    });
    return;
  }

  if (finalOutput) {
    printLocalLog("outcome.final_output", json, {
      status: finalOutput.status,
      title: finalOutput.title,
    });
    printLocalLog("outcome.summary", json, { summary: finalOutput.summary });
  } else {
    printLocalLog("outcome.final_output", json, { status: "missing" });
  }

  if (verification.length) {
    for (const row of verification) {
      printLocalLog("outcome.verification", json, {
        kind: row.kind,
        success: row.success,
        command: row.command,
      });
    }
  } else {
    printLocalLog("outcome.verification", json, { count: 0 });
  }

  if (filesWritten.length) {
    for (const path of filesWritten) {
      printLocalLog("outcome.file_written", json, { path });
    }
  } else {
    printLocalLog("outcome.files_written", json, { count: 0 });
  }

  printLocalLog("outcome.usage", json, {
    promptTokens: outcome.usage.promptTokens,
    completionTokens: outcome.usage.completionTokens,
    totalTokens: outcome.usage.totalTokens,
    lastError: outcome.lastErrorMessage,
  });

  if (sandboxSummary.sandboxUrl) {
    printSandboxAccess(sandboxSummary, json);
  } else if (sandboxSummary.sandboxUrlError) {
    printLocalLog("sandbox.url_unavailable", json, {
      error: sandboxSummary.sandboxUrlError,
    });
  }
}

function printSandboxAccess(
  sandboxSummary: Extract<SandboxSummary, { sandboxId: string }>,
  json: boolean
): void {
  if (json) {
    printJson({ type: "sandbox", ...sandboxSummary });
    return;
  }

  printLocalLog("sandbox.url", json, { url: sandboxSummary.sandboxUrl });
  printLocalLog("sandbox.follow_up", json, {
    command: sandboxSummary.followUpCommand,
  });
}

async function runAgent(args: CliArgs): Promise<number> {
  printLocalLog("run.started", args.json, {
    promptChars: args.prompt.length,
    sandboxMode: args.sandboxId ? "connect" : "create",
    sandboxId: args.sandboxId,
    sandboxTemplate: args.sandboxId ? undefined : args.sandboxTemplate,
  });

  const log = makeLogger(args.json);
  const runState = createRunState();
  const thoughts: Thought[] = [];
  const cumulativeUsage: UsageTotals = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  const previousMessages: ModelMessage[] = [];

  let sandboxPromise: Promise<SandboxLike> | undefined;
  let sandboxReadyLogged = false;
  let initialPreviewReadyPromise: Promise<boolean> | undefined;
  let sandboxSummary: SandboxSummary = {};
  const getSandbox = async () => {
    if (!sandboxPromise) {
      printLocalLog(
        args.sandboxId ? "sandbox.connecting" : "sandbox.creating",
        args.json,
        {
          sandboxId: args.sandboxId,
          sandboxTemplate: args.sandboxId ? undefined : args.sandboxTemplate,
        }
      );
      sandboxPromise = args.sandboxId
        ? Sandbox.connect(args.sandboxId)
        : Sandbox.create(args.sandboxTemplate);
    }

    const sandbox = await sandboxPromise;
    await sandbox.setTimeout(SANDBOX_DEFAULT_TIMEOUT_MS);
    if (!sandboxReadyLogged) {
      sandboxReadyLogged = true;
      sandboxSummary = summarizeSandbox(sandbox);
      printLocalLog("sandbox.ready", args.json, {
        sandboxId: sandbox.sandboxId,
      });
      printSandboxAccess(sandboxSummary, args.json);
    }
    initialPreviewReadyPromise ??= ensureSandboxPreview(sandbox, args.json);
    await initialPreviewReadyPromise;
    return sandbox;
  };

  const hooks: AgentRuntimeHooks = {
    getSandbox,
    emit: (event) => printEvent(event, args.json),
  };

  printLocalLog("planner.starting", args.json);
  const plan = await runPlanner({
    userPrompt: args.prompt,
    previousMessages,
    log,
    hooks,
  });
  printLocalLog("planner.done", args.json, {
    requiresCoding: plan.requiresCoding,
    taskType: plan.taskType,
    verification: plan.verification,
    targetFiles: plan.targetFiles.length,
  });
  printPlan(plan, args.json);

  if (!plan.requiresCoding) {
    printLocalLog("run.no_coding_required", args.json);
    printNoCodeAnswer(plan.answer, args.json);
    return 0;
  }

  printLocalLog("executor.starting", args.json);
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

  const exitCode = exitCodeForOutcome(outcome);
  printLocalLog("executor.done", args.json, {
    status: outcomeStatus(outcome),
    steps: outcome.stepsCount,
    totalTokens: outcome.usage.totalTokens,
    exitCode,
  });
  if (exitCode === 0) {
    sandboxSummary = await resolveSandboxSummary(getSandbox, args.json);
  }
  printOutcome(outcome, args.json, sandboxSummary);
  printLocalLog("run.finished", args.json, { exitCode });
  return exitCode;
}

function summarizeSandbox(
  sandbox: Pick<SandboxLike, "sandboxId" | "getHost">
): Extract<SandboxSummary, { sandboxId: string }> {
  const sandboxId = sandbox.sandboxId;
  return {
    sandboxId,
    sandboxUrl: getSandboxUrl(sandbox),
    followUpCommand: formatFollowUpCommand(sandboxId),
  };
}

async function resolveSandboxSummary(
  getSandbox: () => Promise<SandboxLike>,
  json: boolean
): Promise<SandboxSummary> {
  try {
    const sandbox = await getSandbox();
    if (!(await ensureSandboxPreview(sandbox, json))) {
      return {
        sandboxUrlError: `preview server is not ready for sandbox ${sandbox.sandboxId}`,
      };
    }
    return summarizeSandbox(sandbox);
  } catch (err) {
    return {
      sandboxUrlError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function ensureSandboxPreview(
  sandbox: SandboxLike,
  json: boolean
): Promise<boolean> {
  printLocalLog("preview.ensuring", json, { sandboxId: sandbox.sandboxId });
  const ready = await ensurePreviewReady(sandbox);
  printLocalLog(ready ? "preview.ready" : "preview.unavailable", json, {
    sandboxId: sandbox.sandboxId,
  });
  return ready;
}

function formatFollowUpCommand(sandboxId: string): string {
  return `npm run agent:local -- --sandbox-id ${sandboxId} "<next prompt>"`;
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgv(argv);
  if (parsed.kind === "help") {
    return 0;
  }
  return runAgent(parsed.args);
}

async function run(): Promise<void> {
  const json = process.argv.includes("--json");
  try {
    const code = await main();
    process.exitCode = code;
  } catch (err) {
    if (err instanceof CliError) {
      if (json) {
        printJson({ type: "error", error: err.message });
      } else {
        printUsage(err.message);
      }
      process.exitCode = 1;
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      printJson({ type: "error", error: message });
    } else {
      console.error(err);
    }
    process.exitCode = 1;
  }
}

void run();
