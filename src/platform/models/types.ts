import type { MessageRole } from "@/generated/prisma";
import type { ModelId } from "@/shared/config/models";
import type { Provider, PROVIDERS } from "@/platform/providers/types";

interface BaseModelSpec {
  provider: Provider;
  model: string;
}

export interface OpenRouterModelSpec extends BaseModelSpec {
  provider: typeof PROVIDERS.OPENROUTER;
  model: ModelId;
}

export interface LmStudioModelSpec extends BaseModelSpec {
  provider: typeof PROVIDERS.LM_STUDIO;
}

export type ModelSpec = OpenRouterModelSpec | LmStudioModelSpec;

export interface ModelRoute {
  primary: ModelSpec;
  fallbacks: readonly OpenRouterModelSpec[];
}

export interface OpenRouterResolvedModelConfig extends OpenRouterModelSpec {
  apiKey: string;
}

export interface LmStudioResolvedModelConfig extends LmStudioModelSpec {
  apiKey?: string;
  baseURL: string;
}

export type ResolvedModelConfig =
  | OpenRouterResolvedModelConfig
  | LmStudioResolvedModelConfig;

export type KeyResolver = (provider: Provider) => string | null | undefined;

export interface MessageRow {
  role: MessageRole;
  content: string;
}
