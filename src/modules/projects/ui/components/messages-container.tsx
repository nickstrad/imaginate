import { useTRPC } from "@/trpc/client";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BotIcon, SendIcon, TerminalIcon, UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import React from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
interface Props {
  projectId: string;
}

interface Message {
  content: string;
  id: string;
  projectId: string;
  type: "RESULT" | "ERROR";
  createdAt: Date;
  updatedAt: Date;
  fragment?: {
    id: string;
    title: string;
    sandboxUrl?: string;
    files?: { [path: string]: string };
  };
  role: "USER" | "ASSISTANT";
}

const MessageBubble = ({ message }: { message: Message }) => {
  const isUser = message.role === "USER";
  const createdAt = new Date(message.createdAt);

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
          className={cn(
            "max-w-2xl w-fit",
            isUser ? "bg-primary text-primary-foreground" : ""
          )}
        >
          <CardContent className="p-3">
            <p className="whitespace-pre-wrap">{message.content}</p>
            {message.fragment && (
              <Accordion type="single" collapsible className="w-full mt-2">
                <AccordionItem
                  value={message.fragment.id}
                  className="border-b-0"
                >
                  <AccordionTrigger className="text-sm py-2 hover:no-underline">
                    {message.fragment.title}
                  </AccordionTrigger>
                  <AccordionContent>
                    {message.fragment.sandboxUrl && (
                      <p className="mb-2">
                        <a
                          href={message.fragment.sandboxUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "text-sm",
                            isUser
                              ? "text-primary-foreground/80 hover:underline"
                              : "text-blue-500 hover:underline"
                          )}
                        >
                          View Sandbox
                        </a>
                      </p>
                    )}
                    {message.fragment.files && (
                      <pre className="bg-gray-800 text-white p-2 rounded-md text-xs overflow-x-auto">
                        {JSON.stringify(message.fragment.files, null, 2)}
                      </pre>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
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

export const MessagesContainer = ({ projectId }: Props) => {
  const [content, setContent] = React.useState("");
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [showGradient, setShowGradient] = React.useState(false);

  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const { data: messages, refetch } = useSuspenseQuery(
    trpc.messages.getMany.queryOptions({
      projectId,
    })
  );

  const handleScroll = React.useCallback(() => {
    const current = scrollContainerRef.current;
    if (current) {
      const isScrolledToBottom =
        current.scrollHeight - current.scrollTop <= current.clientHeight + 1;
      const isOverflowing = current.scrollHeight > current.clientHeight;
      setShowGradient(isOverflowing && !isScrolledToBottom);
    }
  }, []);

  React.useLayoutEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
    handleScroll();
  }, [messages, handleScroll]);

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
    };
  }, [handleScroll]);

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
      createMessage.mutate({ userPrompt: content, projectId });
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="relative flex-1 min-h-0">
        <div
          className="h-full overflow-y-auto"
          ref={scrollContainerRef}
        >
          <div className="pt-2 px-4 pb-4">
            {(messages as Message[]).map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
        </div>
        {showGradient && (
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        )}
      </div>
      <div className="p-4 border-t bg-background">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type a message..."
            disabled={createMessage.isPending}
            autoComplete="off"
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
