export const MODEL_IDS = {
  GEMINI_3_1_FLASH_LITE: "google/gemini-3.1-flash-lite-preview",
  GEMINI_2_5_FLASH_LITE: "google/gemini-2.5-flash-lite",
  GEMINI_3_FLASH: "google/gemini-3-flash-preview",
  GEMMA_3_27B: "google/gemma-3-27b-it",
  OPENAI_GPT_5_CODEX: "openai/gpt-5-codex",
  OPENAI_GPT_5_MINI: "openai/gpt-5-mini",
  CLAUDE_SONNET_4_6: "anthropic/claude-sonnet-4.6",
  CLAUDE_HAIKU_4_5: "anthropic/claude-haiku-4.5",
  CLAUDE_OPUS_4_7: "anthropic/claude-opus-4.7",
  DEEPSEEK_CHAT_V3_1: "deepseek/deepseek-chat-v3.1",
  DEEPSEEK_V3_2: "deepseek/deepseek-v3.2",
  DEEPSEEK_V4_PRO: "deepseek/deepseek-v4-pro:exacto",
  DEEPSEEK_V4_FLASH: "deepseek/deepseek-v4-flash",
  KIMI_K2_6: "moonshotai/kimi-k2.6",
  QWEN_3_CODER: "qwen/qwen3-coder",
  GROK_4_1_FAST: "x-ai/grok-4.1-fast",
  GROK_CODE_FAST_1: "x-ai/grok-code-fast-1",
} as const;

export const MODEL_KEYS = Object.fromEntries(
  Object.keys(MODEL_IDS).map((k) => [k, k])
) as { [K in keyof typeof MODEL_IDS]: K };

export type ModelId = keyof typeof MODEL_KEYS;
