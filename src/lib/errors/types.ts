export type ProviderErrorCategory =
  | "credit"
  | "rate_limit"
  | "auth"
  | "timeout"
  | "connection"
  | "unknown";

export interface ClassifiedProviderError {
  category: ProviderErrorCategory;
  retryable: boolean;
  raw: string;
  userMessage: string;
}

export type ProviderErrorRule = {
  category: ProviderErrorCategory;
  retryable: boolean;
  prefix: string;
  needles: string[];
};
