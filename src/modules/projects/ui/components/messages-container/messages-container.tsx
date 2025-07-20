import React from "react";
import { Message } from "@/generated/prisma";
import { SendIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MessageLoading } from "../message-loading";
import { ProjectHeader } from "../project-header";
import { Usage } from "../usage";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { useMessagesContainer } from "./hooks";
import { MessageBubble } from "./message-bubble";
import { FORM_CONSTANTS } from "./constants";
import { MessagesContainerProps } from "./types";

export const MessagesContainer = ({
  projectId,
  activeFragment,
  setActiveFragment,
}: MessagesContainerProps) => {
  const {
    form,
    scrollContainerRef,
    messages,
    projects,
    createMessage,
    onSubmit,
    showGradient,
    isLoadingMessage,
    usage,
  } = useMessagesContainer({ projectId, setActiveFragment });

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
        {!!usage ? (
          <Usage
            points={usage.remainingPoints}
            msBeforeNext={usage.msBeforeNext}
          />
        ) : null}
        <Form {...form}>
          <div className="flex items-center gap-2">
            <FormField
              control={form.control}
              name={FORM_CONSTANTS.FORM_FIELD_NAMES.VALUE}
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Type a message..."
                      disabled={createMessage.isPending}
                      autoComplete="off"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          form.handleSubmit(onSubmit)();
                        }
                      }}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button
              type="submit"
              size="icon"
              disabled={
                createMessage.isPending ||
                !form.watch(FORM_CONSTANTS.FORM_FIELD_NAMES.VALUE).trim()
              }
              onClick={form.handleSubmit(onSubmit)}
            >
              <SendIcon className="h-4 w-4" />
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
};
