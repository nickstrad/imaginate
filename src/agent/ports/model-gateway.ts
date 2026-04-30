// Narrow LLM port. Mirrors the shape of `generateText` in the AI SDK as used
// by the agent runtime, but exposes only the fields the application layer
// actually relies on. No re-export of ai-sdk types — keeps the agent layer
// free of concrete SDK imports.

import type { AgentError } from "../domain/errors";

export interface ModelMessageContentPart {
  type: string;
  [key: string]: unknown;
}

export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ModelMessageContentPart[];
}

export interface ToolDefinition {
  description?: string;
  // Schema validation type (e.g. Zod schema) lives outside the port; the
  // adapter is responsible for translating it to the SDK's expected shape.
  inputSchema: unknown;
  execute: (args: unknown) => Promise<unknown>;
}

export type ToolSet = Record<string, ToolDefinition>;

export interface GenerateTextStepResult {
  stepIndex: number;
  text?: string;
  finishReason?: string;
  toolCalls?: Array<{ toolName: string; args: Record<string, unknown> }>;
  toolResults?: string[];
  reasoningText?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface GenerateTextStopWhenState {
  stepCount: number;
  steps: GenerateTextStepResult[];
}

export interface GenerateTextRequest {
  modelId: string;
  system?: string;
  messages: ModelMessage[];
  tools?: ToolSet;
  maxOutputTokens?: number;
  providerOptions?: Record<string, unknown>;
  stopWhen?: Array<(state: GenerateTextStopWhenState) => boolean>;
  onStepFinish?: (step: GenerateTextStepResult) => void | Promise<void>;
}

export interface GenerateTextResult {
  text?: string;
  steps: GenerateTextStepResult[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

export interface ModelDescriptor {
  provider: string;
  model: string;
}

export type ProviderErrorClassification = AgentError;

export interface ModelGateway {
  generateText(req: GenerateTextRequest): Promise<GenerateTextResult>;
  resolvePlannerModelId(): string;
  listExecutorModelIds(): string[];
  describeModel(modelId: string): ModelDescriptor;
  classifyError(err: unknown): ProviderErrorClassification;
}
