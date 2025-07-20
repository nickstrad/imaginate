import z from "zod";

export const SCROLL_CONSTANTS = {
  /**
   * Time in milliseconds to wait before considering user has stopped scrolling
   */
  AUTO_SCROLL_TIMEOUT: 3000,

  /**
   * Threshold in pixels to determine if user is at bottom of scroll container
   */
  SCROLL_THRESHOLD: 1,
} as const;

export const MESSAGES_CONSTANTS = {
  /**
   * Interval in milliseconds to refetch messages from the server
   */
  REFETCH_INTERVAL: 5000,

  /**
   * Debounce delay in milliseconds for scroll events
   */
  SCROLL_DEBOUNCE_DELAY: 16, // ~60fps
} as const;

export const FORM_CONSTANTS = {
  /**
   * Minimum message length validation
   */
  MIN_MESSAGE_LENGTH: 1,

  /**
   * Default form field name for user prompt
   */
  FORM_FIELD_NAMES: {
    VALUE: "value" as const,
  },
};

export const MESSAGE_BUBBLE_DISPLAY_CONFIG = {
  MAX_WIDTH: "max-w-2xl",
  AVATAR_SIZE: "h-8 w-8",
  ICON_SIZE: "h-5 w-5",
  FRAGMENT_ICON_SIZE: "w-4 h-4",
  SMALL_ICON_SIZE: "w-3 h-3",
} as const;

export const formSchema = z.object({
  [FORM_CONSTANTS.FORM_FIELD_NAMES.VALUE]: z
    .string()
    .min(FORM_CONSTANTS.MIN_MESSAGE_LENGTH, "Message cannot be empty")
    .trim(),
});
