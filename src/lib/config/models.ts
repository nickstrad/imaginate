export const MODEL_IDS = {
  GEMINI_3_1_FLASH_LITE: "google/gemini-3.1-flash-lite-preview",
  GEMINI_3_FLASH: "google/gemini-3-flash-preview",
  GEMMA_3_27B: "google/gemma-3-27b-it",
  OPENAI_GPT_5_CODEX: "openai/gpt-5-codex",
  CLAUDE_SONNET_4_6: "anthropic/claude-sonnet-4.6",
  DEEPSEEK_CHAT_V3_1: "deepseek/deepseek-chat-v3.1",
  KIMI_K2_6: "moonshotai/kimi-k2.6",
} as const;

export const MODEL_KEYS = Object.fromEntries(
  Object.keys(MODEL_IDS).map((k) => [k, k])
) as { [K in keyof typeof MODEL_IDS]: K };

export type ModelId = keyof typeof MODEL_KEYS;
