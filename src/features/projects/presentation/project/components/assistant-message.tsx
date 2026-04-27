"use client";

import React, { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@radix-ui/react-avatar";
import { Card, CardAction, CardContent } from "@/ui/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/ui/components/ui/alert";
import {
  BotIcon,
  TerminalIcon,
  PlayIcon,
  CheckCircleIcon,
  MousePointerClickIcon,
} from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { Fragment, MessageStatus } from "@/generated/prisma";
import type { Thought } from "@/lib/schemas/thought";
import type { Message } from "./types";

const loadingMessages = [
  "Brewing up some code...",
  "Polishing it up...",
  "Rendering final components...",
  "Putting on the final touches...",
  "Almost there...",
  "Just a few more moments...",
  "Optimizing for fun...",
  "Building the future...",
];

const Carousel = () => {
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.floor(Math.random() * loadingMessages.length)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex(Math.floor(Math.random() * loadingMessages.length));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="text-base text-muted-foreground animate-pulse">
      {loadingMessages[currentIndex]}
    </span>
  );
};

interface AssistantMessageProps {
  message: Message;
  activeFragment: Fragment | null;
  setActiveFragment: (fragment: Fragment | null) => void;
  onViewThoughts: (thoughts: Thought[]) => void;
}

const AssistantMessageComponent = ({
  message,
  activeFragment,
  setActiveFragment,
  onViewThoughts,
}: AssistantMessageProps) => {
  const hasThoughts = message.thoughts && message.thoughts.length > 0;
  const isPending = message.status === MessageStatus.PENDING;
  const isFragmentActive =
    message.fragment && activeFragment?.id === message.fragment.id;

  const handleFragmentClick = () => {
    if (!message.fragment) return;
    if (activeFragment?.id === message.fragment.id) {
      setActiveFragment(null);
    } else {
      setActiveFragment(message.fragment);
    }
  };

  if (message.status === MessageStatus.ERROR) {
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
    <div className="flex flex-col group px-2 pb-4">
      <div className="flex items-center gap-2 pl-2 mb-2">
        <Avatar className="h-8 w-8">
          <AvatarFallback>
            <BotIcon className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">Imaginate</span>
        {hasThoughts && (
          <button
            onClick={() => message.thoughts && onViewThoughts(message.thoughts)}
            className={cn(
              "text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-mono italic",
              isPending && "animate-pulse"
            )}
          >
            ✦ see thoughts
          </button>
        )}
      </div>

      <div className="pl-8.5">
        {isPending ? (
          <Carousel />
        ) : (
          <div className="flex flex-col gap-1 items-start">
            <Card
              onClick={message.fragment ? handleFragmentClick : undefined}
              className={cn(
                "max-w-2xl w-fit",
                message.fragment ? "cursor-pointer" : ""
              )}
            >
              <CardContent className="p-3">
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.fragment && (
                  <CardAction
                    onClick={() => setActiveFragment(message.fragment!)}
                    className={cn(
                      "w-full mt-3 p-3 rounded-lg border transition-all duration-200 group hover:shadow-md",
                      {
                        "bg-primary/10 border-primary/30 shadow-sm ring-1 ring-primary/20":
                          isFragmentActive,
                        "bg-muted/40 border-muted-foreground/20 hover:bg-muted/60 hover:border-muted-foreground/30":
                          !isFragmentActive,
                      }
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {isFragmentActive ? (
                        <CheckCircleIcon className="w-4 h-4 text-primary shrink-0" />
                      ) : (
                        <PlayIcon className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                      )}
                      <span
                        className={cn(
                          "font-medium text-sm",
                          isFragmentActive ? "text-primary" : "text-foreground"
                        )}
                      >
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
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const AssistantMessage = React.memo(AssistantMessageComponent);
