import { Fragment, Message } from "@/generated/prisma";
import { useForm } from "react-hook-form";
import z from "zod";
import { formSchema } from "./constants";

export interface ExtendedMessage extends Message {
  fragment?: Fragment | null;
}

export interface MessageBubbleProps {
  message: ExtendedMessage;
  activeFragment: Fragment | null;
  setActiveFragment: (fragment: Fragment | null) => void;
}

export interface ScrollManagementReturn {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  showGradient: boolean;
  setIsUserScrolling: (value: boolean) => void;
}

export interface MessagesContainerProps {
  projectId: string;
  activeFragment: Fragment | null;
  setActiveFragment: (fragment: Fragment | null) => void;
}

export type MessageFormData = z.infer<typeof formSchema>;

export interface MessagesContainerReturn {
  form: ReturnType<typeof useForm<MessageFormData>>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  messages: ExtendedMessage[];
  projects: any[]; // TODO: Add proper Project type from Prisma
  createMessage: any; // TODO: Add proper mutation type
  onSubmit: (data: MessageFormData) => void;
  showGradient: boolean;
  isLoadingMessage: boolean;
  usage: RateLimiterRes | null | undefined;
}
