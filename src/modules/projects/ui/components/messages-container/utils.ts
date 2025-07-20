import { MessageRole, MessageType } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { useCallback, useRef } from "react";
import { MESSAGE_BUBBLE_DISPLAY_CONFIG } from "./constants";

/**
 * Custom hook to debounce a callback function
 * @param callback - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced callback function
 */
export const useDebounce = <T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback(
    ((...args: any[]) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    }) as T,
    [callback, delay]
  );
};

// Type guards for better type safety
export const isUserMessage = (role: MessageRole): role is MessageRole => {
  return role === MessageRole.USER;
};

export const isErrorMessage = (type: MessageType): type is MessageType => {
  return type === MessageType.ERROR;
};

// Utility function to format message timestamp using Prisma DateTime
export const formatMessageTime = (date: Date): string => {
  return new Date(date).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
};
