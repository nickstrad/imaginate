import type {
  Fragment,
  MessageRole,
  MessageStatus,
  MessageType,
} from "@/generated/prisma";
import type { Thought } from "@/lib/schemas/thought";

export interface Message {
  id: string;
  projectId: string;
  content: string;
  role: MessageRole;
  type: MessageType;
  status: MessageStatus;
  createdAt: Date;
  updatedAt: Date;
  fragment?: Fragment;
  thoughts?: Thought[];
}
