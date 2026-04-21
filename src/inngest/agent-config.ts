export const AGENT_CONFIG: {
  maxOutputTokens?: number;
  maxSteps?: number;
  maxFileReads?: number;
  maxWrites?: number;
  maxTerminalRuns?: number;
  maxStdoutChars?: number;
  commandTimeoutMs?: number;
} = {
  maxOutputTokens: undefined,
  maxSteps: undefined,
  maxFileReads: undefined,
  maxWrites: undefined,
  maxTerminalRuns: undefined,
  maxStdoutChars: undefined,
  commandTimeoutMs: undefined,
};

export type RunState = {
  filesWritten: Record<string, string>;
  filesRead: string[];
  commandsRun: Array<{ command: string; success: boolean }>;
  buildSucceeded: boolean;
  testsSucceeded: boolean;
  devStarted: boolean;
  summaryProduced: boolean;
};

export function createRunState(): RunState {
  return {
    filesWritten: {},
    filesRead: [],
    commandsRun: [],
    buildSucceeded: false,
    testsSucceeded: false,
    devStarted: false,
    summaryProduced: false,
  };
}
