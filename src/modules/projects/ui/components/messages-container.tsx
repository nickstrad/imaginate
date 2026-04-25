import { useTRPC } from "@/trpc/client";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/ui/components/ui/avatar";
import { Card, CardContent } from "@/ui/components/ui/card";
import { SendIcon, UserIcon } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import React from "react";
import { toast } from "sonner";
import { Textarea } from "@/ui/components/ui/textarea";
import { Button } from "@/ui/components/ui/button";
import { Fragment, MessageRole } from "@/generated/prisma";
import { AssistantMessage } from "./assistant-message";
import { ProjectHeader } from "./project-header";
import {
  ModeSelector,
  useModeSelector,
} from "@/modules/messages/ui/components/mode-selector";
import { ThoughtsModal } from "./thoughts-modal";
import type { Thought } from "@/lib/schemas/thought";

interface Props {
  projectId: string;
  activeFragment: Fragment | null;
  setActiveFragment: (fragment: Fragment | null) => void;
}

import type { Message } from "./types";

const UserMessage = ({ message }: { message: Message }) => {
  const createdAt = new Date(message.createdAt);
  return (
    <div className={cn("flex items-end gap-3 my-4 justify-end")}>
      <div className="flex flex-col gap-1 items-end">
        <Card className="max-w-2xl w-fit bg-primary text-primary-foreground">
          <CardContent className="p-3">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </CardContent>
        </Card>
        <span className="text-xs text-muted-foreground px-1">
          {createdAt.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </div>
      <Avatar className="h-8 w-8">
        <AvatarFallback>
          <UserIcon className="h-5 w-5" />
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
  const modeSelectorState = useModeSelector();
  const { data: messages, refetch } = useSuspenseQuery(
    trpc.messages.getMany.queryOptions({ projectId }, { refetchInterval: 2000 })
  );

  const { data: projects } = useSuspenseQuery(
    trpc.projects.getMany.queryOptions(undefined, {
      refetchInterval: false,
      refetchOnWindowFocus: false,
    })
  );

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
    if (!lastAssistantMessage?.fragment) return;

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim()) {
      setIsUserScrolling(false);
      createMessage.mutate({
        userPrompt: content,
        projectId,
        mode: modeSelectorState.mode,
      });
    }
  };

  const openThoughts = React.useCallback((thoughts: Thought[]) => {
    setSelectedThoughts(thoughts);
    setThoughtsOpen(true);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <ProjectHeader
        projects={projects}
        currentProjectName={
          projects.find((p) => p.id === projectId)?.name || projectId
        }
      />
      <div className="relative flex-1 min-h-0">
        <div className="h-full overflow-y-auto pb-72" ref={scrollContainerRef}>
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
          <div className="absolute bottom-72 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type a message..."
            disabled={createMessage.isPending}
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (content.trim()) {
                  setIsUserScrolling(false);
                  createMessage.mutate({
                    userPrompt: content,
                    projectId,
                    mode: modeSelectorState.mode,
                  });
                }
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={createMessage.isPending || !content.trim()}
          >
            <SendIcon className="h-4 w-4" />
          </Button>
        </form>
        <div className="mb-3">
          <ModeSelector
            mode={modeSelectorState.mode}
            setMode={modeSelectorState.setMode}
            availableModes={modeSelectorState.availableModes}
          />
        </div>
      </div>
      <ThoughtsModal
        open={thoughtsOpen}
        onOpenChange={setThoughtsOpen}
        thoughts={selectedThoughts}
      />
    </div>
  );
};
