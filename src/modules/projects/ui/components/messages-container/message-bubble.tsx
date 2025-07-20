import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardAction } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@radix-ui/react-avatar";
import {
  TerminalIcon,
  BotIcon,
  CheckCircleIcon,
  PlayIcon,
  MousePointerClickIcon,
  UserIcon,
} from "lucide-react";
import { MESSAGE_BUBBLE_DISPLAY_CONFIG } from "./constants";
import { MessageBubbleProps } from "./types";
import { isUserMessage, isErrorMessage, formatMessageTime } from "./utils";

export const MessageBubble = ({
  message,
  activeFragment,
  setActiveFragment,
}: MessageBubbleProps) => {
  const isUser = isUserMessage(message.role);
  const formattedTime = formatMessageTime(message.createdAt);

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

  if (isErrorMessage(message.type)) {
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
        <Avatar className={MESSAGE_BUBBLE_DISPLAY_CONFIG.AVATAR_SIZE}>
          <AvatarFallback>
            <BotIcon className={MESSAGE_BUBBLE_DISPLAY_CONFIG.ICON_SIZE} />
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
            `${MESSAGE_BUBBLE_DISPLAY_CONFIG.MAX_WIDTH} w-fit`,
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
                    "bg-positive/10 border-positive/30 shadow-sm ring-1 ring-positive/20":
                      isFragmentActive && !isUser,
                    "bg-positive/10 border-positive/30 shadow-sm ring-1 ring-positive/20":
                      isFragmentActive && isUser,
                    // Inactive states
                    "bg-muted/40 border-muted-foreground/20 hover:bg-muted/60 hover:border-muted-foreground/30":
                      !isFragmentActive && !isUser,
                    "bg-primary-foreground/20 border-primary-foreground/30 hover:bg-primary-foreground/40":
                      !isFragmentActive && isUser,
                  }
                )}
              >
                <div className="flex items-center gap-2">
                  {isFragmentActive ? (
                    <CheckCircleIcon
                      className={`${MESSAGE_BUBBLE_DISPLAY_CONFIG.FRAGMENT_ICON_SIZE} text-positive shrink-0`}
                    />
                  ) : (
                    <PlayIcon
                      className={`${MESSAGE_BUBBLE_DISPLAY_CONFIG.FRAGMENT_ICON_SIZE} text-muted-foreground group-hover:text-foreground transition-colors shrink-0`}
                    />
                  )}
                  <span
                    className={cn(
                      "font-medium text-sm",
                      isFragmentActive ? "text-positive" : "text-foreground"
                    )}
                  >
                    {message.fragment.title}
                  </span>
                  {!isFragmentActive && (
                    <MousePointerClickIcon
                      className={`${MESSAGE_BUBBLE_DISPLAY_CONFIG.SMALL_ICON_SIZE} text-muted-foreground/60 group-hover:text-muted-foreground transition-colors ml-auto`}
                    />
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
          {formattedTime}
        </span>
      </div>
      {isUser && (
        <Avatar className={MESSAGE_BUBBLE_DISPLAY_CONFIG.AVATAR_SIZE}>
          <AvatarFallback>
            <UserIcon className={MESSAGE_BUBBLE_DISPLAY_CONFIG.ICON_SIZE} />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
};
