// Public surface for the agent runtime. Consumers should import from
// `@/agent` rather than reaching into deep paths. The internal layering
// (domain / application / ports / adapters) is an implementation detail.
export * from "./application";
export * from "./ports";
export * from "./adapters";
export {
  AGENT_CONFIG,
  agentErrorMessage,
  buildErrorLogMetadata,
  buildTelemetry,
  classifyAgentError,
  createRunState,
  EscalateReason,
  extractErrorContext,
  extractTelemetry,
  hasSuccessfulVerification,
  inferVerificationKind,
  markVerification,
  persistTelemetryWith,
  readUsage,
  shouldEscalate,
  toPersistedTelemetry,
} from "./domain";
export { AgentRuntimeEventType, type AgentRuntimeEvent } from "./domain/events";
export type { AgentError, AgentErrorCategory } from "./domain/errors";
export type {
  AgentRunInput,
  AgentRunResult,
  AgentStepSnapshot,
  ChatMessage,
  Edit,
  EditResult,
  EscalateDecision,
  FinalOutput,
  FinalStatus,
  PersistedTelemetry,
  PlanOutput,
  PlanTaskType,
  PlanVerificationMode,
  RunState,
  TelemetryPayload,
  Thought,
  ThoughtToolCall,
  UsageTotals,
  VerificationKind,
  VerificationRecord,
  VerificationToolKind,
} from "./domain/types";
