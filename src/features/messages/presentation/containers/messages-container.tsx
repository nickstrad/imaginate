"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CornerDownLeftIcon, SendIcon, UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import React from "react";
import { toast } from "sonner";
import { useTRPC } from "@/platform/trpc-client";
import { Avatar, AvatarFallback } from "@/ui/components/ui/avatar";
import { Button } from "@/ui/components/ui/button";
import { Card, CardContent } from "@/ui/components/ui/card";
import { Textarea } from "@/ui/components/ui/textarea";
import { Fragment, MessageRole } from "@/generated/prisma";
import { AssistantMessage } from "@/features/projects/presentation/project/components/assistant-message";
import { ProjectHeader } from "@/features/projects/presentation/project/components/project-header";
import { ThoughtsModal } from "@/features/projects/presentation/project/components/thoughts-modal";
import type { Thought } from "@/shared/schemas/thought";
import type { Message } from "@/features/projects/presentation/project/components/types";

interface Props {
  projectId: string;
  activeFragment: Fragment | null;
  setActiveFragment: (fragment: Fragment | null) => void;
}

const UserMessage = ({ message }: { message: Message }) => {
  const createdAt = new Date(message.createdAt);
  return (
    <div className="my-5 flex items-end justify-end gap-3">
      <div className="flex flex-col gap-1 items-end">
        <Card className="w-fit max-w-2xl rounded-lg border-chrome-border bg-primary text-primary-foreground shadow-lg">
          <CardContent className="p-4">
            <p className="whitespace-pre-wrap text-[15px] leading-7">
              {message.content}
            </p>
          </CardContent>
        </Card>
        <span className="text-xs text-muted-foreground px-1">
          {createdAt.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </div>
      <Avatar className="h-9 w-9 rounded-full border border-chrome-border bg-surface-elevated shadow-xs">
        <AvatarFallback className="bg-surface-elevated">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
        </AvatarFallback>
      </Avatar>
    </div>
  );
};

export const MessagesContainer = ({
  projectId,
  activeFragment,
  setActiveFragment,
}: Props) => {
  const [content, setContent] = React.useState("");
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [showGradient, setShowGradient] = React.useState(false);
  const [isUserScrolling, setIsUserScrolling] = React.useState(false);
  const autoScrollTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const [thoughtsOpen, setThoughtsOpen] = React.useState(false);
  const [selectedThoughts, setSelectedThoughts] = React.useState<
    Thought[] | undefined
  >();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const router = useRouter();
  const { data: messages, refetch } = useSuspenseQuery(
    trpc.messages.getMany.queryOptions({ projectId }, { refetchInterval: 2000 })
  );

  const { data: projects } = useSuspenseQuery(
    trpc.projects.getMany.queryOptions(undefined, {
      refetchInterval: false,
      refetchOnWindowFocus: false,
    })
  );
  const currentProjectName =
    projects.find((project) => project.id === projectId)?.name || projectId;

  const scrollToBottom = React.useCallback(() => {
    const current = scrollContainerRef.current;
    if (current) {
      current.scrollTop = current.scrollHeight;
    }
  }, []);

  const handleScroll = React.useCallback(() => {
    const current = scrollContainerRef.current;
    if (current) {
      const isScrolledToBottom =
        current.scrollHeight - current.scrollTop <= current.clientHeight + 1;
      const isOverflowing = current.scrollHeight > current.clientHeight;
      setShowGradient(isOverflowing && !isScrolledToBottom);

      if (!isScrolledToBottom && isOverflowing) {
        setIsUserScrolling(true);
        if (autoScrollTimeoutRef.current) {
          clearTimeout(autoScrollTimeoutRef.current);
        }
        autoScrollTimeoutRef.current = setTimeout(() => {
          setIsUserScrolling(false);
        }, 3000);
      } else if (isScrolledToBottom) {
        setIsUserScrolling(false);
      }
    }
  }, []);

  React.useLayoutEffect(() => {
    if (!isUserScrolling) {
      scrollToBottom();
    }
    handleScroll();
  }, [messages, handleScroll, isUserScrolling, scrollToBottom]);

  React.useEffect(() => {
    const current = scrollContainerRef.current;
    const handleResize = () => handleScroll();

    handleScroll();

    if (current) {
      current.addEventListener("scroll", handleScroll);
      window.addEventListener("resize", handleResize);
    }

    return () => {
      if (current) {
        current.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("resize", handleResize);
      if (autoScrollTimeoutRef.current) {
        clearTimeout(autoScrollTimeoutRef.current);
      }
    };
  }, [handleScroll]);

  const isFirstRun = React.useRef(true);
  const prevMessagesLength = React.useRef(messages.length);
  React.useEffect(() => {
    const lastAssistantMessage = messages.findLast(
      (message) => message.role === MessageRole.ASSISTANT && message.fragment
    );
    if (!lastAssistantMessage?.fragment) {
      return;
    }

    if (isFirstRun.current) {
      setActiveFragment(lastAssistantMessage.fragment);
      isFirstRun.current = false;
    } else if (messages.length > prevMessagesLength.current) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === MessageRole.ASSISTANT && lastMessage.fragment) {
        setActiveFragment(lastMessage.fragment);
      }
    }
    prevMessagesLength.current = messages.length;
  }, [messages, setActiveFragment]);

  const createMessage = useMutation(
    trpc.messages.create.mutationOptions({
      onError: (error) => {
        toast.error(error.message);
      },
      onSuccess: () => {
        setContent("");
        refetch();
        queryClient.invalidateQueries(
          trpc.messages.getMany.queryOptions({ projectId })
        );
      },
    })
  );

  const sendMessage = React.useCallback(() => {
    const userPrompt = content.trim();
    if (!userPrompt) {
      return;
    }

    setIsUserScrolling(false);
    createMessage.mutate({
      userPrompt,
      projectId,
      mode: "code",
    });
  }, [content, createMessage, projectId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  const openThoughts = React.useCallback((thoughts: Thought[]) => {
    setSelectedThoughts(thoughts);
    setThoughtsOpen(true);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <ProjectHeader
        projects={projects}
        currentProjectName={currentProjectName}
        onBackToDashboard={() => router.push("/")}
        onProjectChange={(nextProjectId) =>
          router.push(`/projects/${nextProjectId}`)
        }
      />
      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto pb-48" ref={scrollContainerRef}>
          <div className="pt-2 px-4 pb-4">
            {(messages as Message[]).map((message) =>
              message.role === MessageRole.USER ? (
                <UserMessage key={message.id} message={message} />
              ) : (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  activeFragment={activeFragment}
                  setActiveFragment={setActiveFragment}
                  onViewThoughts={openThoughts}
                />
              )
            )}
          </div>
        </div>
        {showGradient && (
          <div className="pointer-events-none absolute bottom-48 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" />
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 border-t border-chrome-border bg-chrome p-3 backdrop-blur supports-[backdrop-filter]:bg-chrome">
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-chrome-border bg-surface-elevated p-2 shadow-lg"
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Ask for a revision, new screen, or sharper interaction..."
              disabled={createMessage.isPending}
              autoComplete="off"
              className="min-h-20 resize-none border-0 bg-surface-subtle px-3 py-3 text-base leading-6 shadow-inner focus-visible:ring-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              className="size-11 shrink-0 rounded-md"
              disabled={createMessage.isPending || !content.trim()}
            >
              <SendIcon className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
            <span>Describe the next change and keep building.</span>
            <span className="hidden items-center gap-1 whitespace-nowrap sm:flex">
              <CornerDownLeftIcon className="size-3" />
              Enter
            </span>
          </div>
        </form>
      </div>
      <ThoughtsModal
        open={thoughtsOpen}
        onOpenChange={setThoughtsOpen}
        thoughts={selectedThoughts}
      />
    </div>
  );
};
