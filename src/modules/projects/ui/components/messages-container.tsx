import { useTRPC } from "@/trpc/client";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardAction, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BotIcon, SendIcon, TerminalIcon, UserIcon, PlayIcon, CheckCircleIcon, MousePointerClickIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import React from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Fragment } from "@/generated/prisma";
import { MessageLoading } from "./message-loading";

interface Props {
  projectId: string;
  activeFragment: Fragment | null;
  setActiveFragment: (fragment: Fragment | null) => void;
}

interface Message {
  content: string;
  id: string;
  projectId: string;
  type: "RESULT" | "ERROR";
  createdAt: Date;
  updatedAt: Date;
  fragment?: Fragment;
  role: "USER" | "ASSISTANT";
}

const MessageBubble = ({
  message,
  activeFragment,
  setActiveFragment,
}: {
  message: Message;
  activeFragment: Fragment | null;
  setActiveFragment: (fragment: Fragment | null) => void;
}) => {
  const isUser = message.role === "USER";
  const createdAt = new Date(message.createdAt);

  const handleFragmentClick = () => {
    if (!message.fragment) return;

    if (activeFragment?.id === message.fragment.id) {
      setActiveFragment(null);
    } else {
      setActiveFragment(message.fragment);
    }
  };

  const isFragmentActive =
    message.fragment && activeFragment?.id === message.fragment.id;

  if (message.type === "ERROR") {
    return (
      <div className="my-4 flex justify-center">
        <Alert variant="destructive" className="max-w-2xl">
          <TerminalIcon className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{message.content}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-end gap-3 my-4",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <Avatar className="h-8 w-8">
          <AvatarFallback>
            <BotIcon className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "flex flex-col gap-1",
          isUser ? "items-end" : "items-start"
        )}
      >
        <Card
          onClick={message.fragment ? handleFragmentClick : undefined}
          className={cn(
            "max-w-2xl w-fit",
            isUser ? "bg-primary text-primary-foreground" : "",
            message.fragment ? "cursor-pointer" : ""
          )}
        >
          <CardContent className="p-3">
            <p className="whitespace-pre-wrap">{message.content}</p>
            {message.fragment && (
              <CardAction
                onClick={() => {
                  if (message.fragment) {
                    setActiveFragment(message.fragment!);
                  } else {
                    setActiveFragment(null);
                  }
                }}
                className={cn(
                  "w-full mt-3 p-3 rounded-lg border transition-all duration-200 group hover:shadow-md",
                  {
                    // Active states
                    "bg-primary/10 border-primary/30 shadow-sm ring-1 ring-primary/20": isFragmentActive && !isUser,
                    "bg-primary-foreground/80 border-primary shadow-sm ring-1 ring-primary/30": isFragmentActive && isUser,
                    // Inactive states
                    "bg-muted/40 border-muted-foreground/20 hover:bg-muted/60 hover:border-muted-foreground/30": !isFragmentActive && !isUser,
                    "bg-primary-foreground/20 border-primary-foreground/30 hover:bg-primary-foreground/40": !isFragmentActive && isUser,
                  }
                )}
              >
                <div className="flex items-center gap-2">
                  {isFragmentActive ? (
                    <CheckCircleIcon className="w-4 h-4 text-primary shrink-0" />
                  ) : (
                    <PlayIcon className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  )}
                  <span className={cn(
                    "font-medium text-sm",
                    isFragmentActive ? "text-primary" : "text-foreground"
                  )}>
                    {message.fragment.title}
                  </span>
                  {!isFragmentActive && (
                    <MousePointerClickIcon className="w-3 h-3 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors ml-auto" />
                  )}
                </div>
                {isFragmentActive && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Currently viewing
                  </div>
                )}
              </CardAction>
            )}
          </CardContent>
        </Card>
        <span className="text-xs text-muted-foreground px-1">
          {createdAt.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </div>
      {isUser && (
        <Avatar className="h-8 w-8">
          <AvatarFallback>
            <UserIcon className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
};

import { ProjectHeader } from "./project-header";

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
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const { data: messages, refetch } = useSuspenseQuery(
    trpc.messages.getMany.queryOptions(
      {
        projectId,
      },
      { refetchInterval: 5000 }
    )
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
      
      // Detect if user is manually scrolling
      if (!isScrolledToBottom && isOverflowing) {
        setIsUserScrolling(true);
        
        // Reset user scrolling flag after a delay
        if (autoScrollTimeoutRef.current) {
          clearTimeout(autoScrollTimeoutRef.current);
        }
        autoScrollTimeoutRef.current = setTimeout(() => {
          setIsUserScrolling(false);
        }, 3000); // 3 seconds of inactivity
      } else if (isScrolledToBottom) {
        setIsUserScrolling(false);
      }
    }
  }, []);

  React.useLayoutEffect(() => {
    // Only auto-scroll if user is not manually scrolling
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
      (message) => message.role === "ASSISTANT" && message.fragment
    );
    if (!lastAssistantMessage?.fragment) return;

    if (isFirstRun.current) {
      setActiveFragment(lastAssistantMessage.fragment);
      isFirstRun.current = false;
    } else if (messages.length > prevMessagesLength.current) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "ASSISTANT" && lastMessage.fragment) {
        setActiveFragment(lastMessage.fragment);
      }
    }
    prevMessagesLength.current = messages.length;
  }, [messages, setActiveFragment]);

  const createMessage = useMutation(
    trpc.messages.create.mutationOptions({
      onError: (error) => {
        // redirect to pricing page if specific error occurs
        toast.error(error.message);
      },
      onSuccess: () => {
        setContent("");
        refetch();
        queryClient.invalidateQueries({
          queryKey: trpc.messages.getMany.queryKey({ projectId }),
        });
        //TODO: invalidate usage status
      },
    })
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim()) {
      // Reset user scrolling flag when user sends a message
      setIsUserScrolling(false);
      createMessage.mutate({ userPrompt: content, projectId });
    }
  };

  const isLoadingMessage = messages[messages.length - 1]?.role === "USER";
  // TOOD: make sure errors are shown as author message
  return (
    <div className="flex flex-col h-full">
      <ProjectHeader
        projects={projects}
        currentProjectName={
          projects.find((p) => p.id === projectId)?.name || projectId
        }
      />
      <div className="relative flex-1 min-h-0">
        <div className="h-full overflow-y-auto pb-20" ref={scrollContainerRef}>
          <div className="pt-2 px-4 pb-4">
            {(messages as Message[]).map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                activeFragment={activeFragment}
                setActiveFragment={setActiveFragment}
              />
            ))}
            {isLoadingMessage ? <MessageLoading /> : null}
          </div>
        </div>
        {showGradient && (
          <div className="absolute bottom-20 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none" />
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
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (content.trim()) {
                  // Reset user scrolling flag when user sends a message
                  setIsUserScrolling(false);
                  createMessage.mutate({ userPrompt: content, projectId });
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
      </div>
    </div>
  );
};
