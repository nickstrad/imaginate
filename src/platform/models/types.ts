import type { MessageRole } from "@/generated/prisma";
import type { ModelId } from "@/shared/config/models";
import type { Provider } from "@/platform/providers";

export interface ModelSpec {
  provider: Provider;
  model: ModelId;
}

export interface ResolvedModelConfig extends ModelSpec {
  apiKey: string;
}

export type KeyResolver = (provider: Provider) => string | null | undefined;

export interface MessageRow {
  role: MessageRole;
  content: string;
}
