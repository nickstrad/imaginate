import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Sandbox } from "@e2b/code-interpreter";
import { cac } from "cac";
import chalk from "chalk";
import pino from "pino";
import {
  AgentRuntimeEventType,
  createAiSdkModelGateway,
  createAiSdkToolFactory,
  createE2bSandboxGateway,
  createInMemoryMessageStore,
  createLocalWorkspaceGateway,
  createNoopTelemetryStore,
  createTerminalEventSink,
  runAgent,
  type AgentLogger,
  type AgentRunResult,
  type AgentRuntimeEvent,
  type PlanOutput,
  type SandboxGateway,
} from "@/agent";
import {
  createLogger,
  openRunFileSink,
  type Logger,
  type LogInput,
  type LogMetadata,
} from "@/platform/log";
import {
  ensurePreviewReady,
  getSandboxUrl,
  SANDBOX_DEFAULT_TIMEOUT_MS,
} from "@/platform/sandbox";
import {
  buildExecutorSystemPrompt,
  CACHE_PROVIDER_OPTIONS,
  PLANNER_PROMPT,
} from "@/shared/prompts";
import { logRunStart } from "./run-start-log";

type SandboxLike = Awaited<ReturnType<typeof Sandbox.create>>;

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
  localDir?: string;
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
  "local",
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
    .option(
      "--local <dir>",
      "Run against a local directory instead of E2B. Mutually exclusive with --sandbox-id; --sandbox-template is ignored."
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
    .example(
      'npm run agent:local -- --local ~/Desktop/test-sandbox "add a README"'
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
  const localInput = readStringOption(options.local, "--local");
  if (localInput && sandboxId) {
    throw new CliError("--local cannot be combined with --sandbox-id");
  }
  const localDir = localInput ? resolveLocalDir(localInput) : undefined;
  const resolvedPrompt = resolvePrompt(prompt, parsed.args.map(String));

  return {
    kind: "run",
    args: {
      prompt: resolvedPrompt,
      sandboxTemplate,
      sandboxId,
      localDir,
      json: Boolean(options.json),
    },
  };
}

function resolveLocalDir(input: string): string {
  const expanded = input.startsWith("~/")
    ? path.join(os.homedir(), input.slice(2))
    : input;
  const absolute = path.resolve(expanded);
  const stat = fs.statSync(absolute, { throwIfNoEntry: false });
  if (!stat) {
    throw new CliError(`--local directory does not exist: ${absolute}`);
  }
  if (!stat.isDirectory()) {
    throw new CliError(`--local path is not a directory: ${absolute}`);
  }
  return absolute;
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

function loggerToAgentLogger(log: Logger): AgentLogger {
  return {
    debug: (input) => log.debug(input),
    info: (input) => log.info(input),
    warn: (input) => log.warn(input),
    error: (input) => log.error(input),
    child: ({ scope, bindings }) =>
      loggerToAgentLogger(log.child({ scope, bindings })),
  };
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

function formatInlineJson(value: unknown): string {
  try {
    const rendered = JSON.stringify(value);
    if (!rendered) {
      return "-";
    }
    return rendered.length > 160 ? rendered.slice(0, 157) + "..." : rendered;
  } catch {
    return String(value);
  }
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
    case AgentRuntimeEventType.ToolCallRequested:
      return [
        event.type,
        `step=${event.stepIndex}`,
        `callId=${event.callId}`,
        `tool=${event.toolName}`,
        `args=${formatInlineJson(event.args)}`,
      ].join(" ");
    case AgentRuntimeEventType.ToolCallCompleted:
      return event.ok
        ? [
            event.type,
            `step=${event.stepIndex}`,
            `callId=${event.callId}`,
            `tool=${event.toolName}`,
            "ok=true",
            `result=${formatInlineJson(event.result)}`,
          ].join(" ")
        : [
            event.type,
            `step=${event.stepIndex}`,
            `callId=${event.callId}`,
            `tool=${event.toolName}`,
            "ok=false",
            `category=${event.error.category}`,
            `error=${event.error.message}`,
          ].join(" ");
    case AgentRuntimeEventType.ExecutorStepFinished:
      return [
        event.type,
        `step=${event.step.stepIndex}`,
        `finishReason=${event.step.finishReason ?? "-"}`,
        `toolCallIds=${formatList(event.toolCallIds)}`,
        `tools=${formatList(
          event.step.thought.toolCalls?.map((tc) => tc.toolName) ?? []
        )}`,
      ].join(" ");
    case AgentRuntimeEventType.ExecutorAttemptFailed:
      return [
        event.type,
        `attempt=${event.attempt}`,
        `category=${event.error.category}`,
        `retryable=${event.error.retryable}`,
        `error=${event.error.message}`,
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
        `error=${event.error?.message ?? event.lastErrorMessage ?? "-"}`,
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

function outcomeStatus(result: AgentRunResult): string {
  return result.finalOutput?.status ?? "missing";
}

function exitCodeForOutcome(result: AgentRunResult): number {
  const finalOutput = result.finalOutput;
  if (!finalOutput) {
    return 1;
  }
  return finalOutput.status === "failed" ? 1 : 0;
}

function printOutcome(
  result: AgentRunResult,
  json: boolean,
  sandboxSummary: SandboxSummary = {}
): void {
  const finalOutput = result.finalOutput;
  const filesWritten = Object.keys(result.runState.filesWritten);
  const verification = result.runState.verification;

  if (json) {
    printJson({
      type: "outcome",
      status: outcomeStatus(result),
      finalOutput,
      verification,
      filesWritten,
      usage: result.usage,
      stepsCount: result.stepsCount,
      error: result.error,
      lastErrorMessage: result.lastErrorMessage,
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
    if (finalOutput.status === "failed") {
      printLocalLog("outcome.failure", json, {
        errorCategory: result.error?.category,
        errorCode: result.error?.code,
        error: result.error?.message,
        lastErrorMessage: result.lastErrorMessage,
      });
    }
  } else {
    printLocalLog("outcome.final_output", json, {
      status: "missing",
      errorCategory: result.error?.category,
      errorCode: result.error?.code,
      error: result.error?.message,
      lastErrorMessage: result.lastErrorMessage,
    });
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
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    totalTokens: result.usage.totalTokens,
    errorCategory: result.error?.category,
    lastError: result.error?.message ?? result.lastErrorMessage,
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

async function ensureSandbox(
  args: CliArgs,
  json: boolean
): Promise<SandboxLike> {
  printLocalLog(
    args.sandboxId ? "sandbox.connecting" : "sandbox.creating",
    json,
    {
      sandboxId: args.sandboxId,
      sandboxTemplate: args.sandboxId ? undefined : args.sandboxTemplate,
    }
  );
  const sandbox = args.sandboxId
    ? await Sandbox.connect(args.sandboxId)
    : await Sandbox.create(args.sandboxTemplate);
  await sandbox.setTimeout(SANDBOX_DEFAULT_TIMEOUT_MS);
  printLocalLog("sandbox.ready", json, { sandboxId: sandbox.sandboxId });
  return sandbox;
}

async function runAgentCli(args: CliArgs): Promise<number> {
  const projectId = "local";
  const sandboxMode = args.localDir
    ? "local"
    : args.sandboxId
      ? "connect"
      : "create";
  printLocalLog("run.started", args.json, {
    promptChars: args.prompt.length,
    sandboxMode,
    sandboxId: args.sandboxId,
    sandboxTemplate:
      args.localDir || args.sandboxId ? undefined : args.sandboxTemplate,
    localDir: args.localDir,
  });

  const log = makeLogger(args.json);
  logRunStart({ logger: log, projectId, sandboxMode });

  let sandbox: SandboxLike | undefined;
  let sandboxGateway: SandboxGateway;
  let sandboxSummary: SandboxSummary;

  if (args.localDir) {
    sandboxGateway = createLocalWorkspaceGateway({ root: args.localDir });
    sandboxSummary = {};
  } else {
    // Provision the sandbox eagerly so we can reuse the same id for both the
    // gateway and the post-run sandbox-summary call.
    sandbox = await ensureSandbox(args, args.json);
    const sandboxId = sandbox.sandboxId;
    sandboxSummary = summarizeSandbox(sandbox);
    printSandboxAccess(
      sandboxSummary as Extract<SandboxSummary, { sandboxId: string }>,
      args.json
    );
    await ensureSandboxPreview(sandbox, args.json);
    sandboxGateway = createE2bSandboxGateway({ sandboxId });
  }

  const eventSink = {
    emit: (event: AgentRuntimeEvent) => {
      printEvent(event, args.json);
      if (event.type === AgentRuntimeEventType.PlannerFinished) {
        printPlan(event.plan, args.json);
      }
    },
  };

  const deps = {
    modelGateway: createAiSdkModelGateway(),
    sandboxGateway,
    toolFactory: createAiSdkToolFactory(),
    messageStore: createInMemoryMessageStore(),
    telemetryStore: createNoopTelemetryStore(),
    eventSink,
    logger: loggerToAgentLogger(log),
  };

  const runId = `${projectId}-${Date.now()}`;
  const fileSink = openRunFileSink({ runId });
  let result: AgentRunResult;
  try {
    result = await runAgent({
      input: { prompt: args.prompt, projectId },
      deps,
      config: {
        plannerSystemPrompt: PLANNER_PROMPT,
        buildExecutorSystemPrompt,
        providerCacheOptions: CACHE_PROVIDER_OPTIONS,
      },
      runId,
    });
  } finally {
    await fileSink.close();
  }

  if (result.runState.plan && !result.runState.plan.requiresCoding) {
    printLocalLog("run.no_coding_required", args.json);
    printNoCodeAnswer(result.runState.plan.answer, args.json);
    return 0;
  }

  const exitCode = exitCodeForOutcome(result);
  printLocalLog("executor.done", args.json, {
    status: outcomeStatus(result),
    steps: result.stepsCount,
    totalTokens: result.usage.totalTokens,
    exitCode,
  });

  if (exitCode === 0 && sandbox) {
    sandboxSummary = await resolveSandboxSummary(sandbox, args.json);
  }

  printOutcome(result, args.json, sandboxSummary);
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
  sandbox: SandboxLike,
  json: boolean
): Promise<SandboxSummary> {
  try {
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
  return runAgentCli(parsed.args);
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

// Re-export the unused createTerminalEventSink to keep the import alive for
// future wiring (chunk 5 will move CLI output formatting through it).
export { createTerminalEventSink };
