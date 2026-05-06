"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/ui/components/ui/sheet";
import { ScrollArea } from "@/ui/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/ui/components/ui/collapsible";
import { Separator } from "@/ui/components/ui/separator";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Thought } from "@/shared/schemas/thought";

interface ThoughtsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thoughts?: Thought[];
}

const ToolPayload = ({ value }: { value: unknown }) => (
  <div className="rounded-sm border border-chrome-border bg-surface-subtle p-2 text-xs">
    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  </div>
);

const ToolCallsSection = ({ thought }: { thought: Thought }) => {
  const [expanded, setExpanded] = useState(false);
  const callCount = thought.toolCalls?.length ?? 0;
  const resultCount =
    thought.toolCalls?.filter((toolCall) => toolCall.completion).length ?? 0;

  if (callCount === 0) {
    return null;
  }

  return (
    <div className="ml-6 mt-3">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
          {expanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <span>
            {callCount} tool call{callCount !== 1 ? "s" : ""}
            {resultCount > 0 &&
              ` + ${resultCount} result${resultCount !== 1 ? "s" : ""}`}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-3">
          {thought.toolCalls?.map((tc) => (
            <div key={tc.callId}>
              <div className="mb-1 font-mono text-xs text-muted-foreground">
                → {tc.toolName}
              </div>
              <ToolPayload value={tc.args} />
              {tc.completion && (
                <>
                  <div className="mb-1 mt-1 font-mono text-xs text-muted-foreground">
                    ← {tc.completion.ok ? "result" : "error"}
                  </div>
                  <ToolPayload
                    value={
                      tc.completion.ok
                        ? tc.completion.result
                        : tc.completion.error
                    }
                  />
                </>
              )}
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export function ThoughtsModal({
  open,
  onOpenChange,
  thoughts = [],
}: ThoughtsModalProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-dvh max-h-dvh w-full flex-col gap-0 overflow-hidden border-chrome-border bg-surface text-surface-foreground sm:w-[500px]"
      >
        <SheetHeader className="shrink-0 border-b border-chrome-border">
          <SheetTitle className="text-foreground">Agent Thoughts</SheetTitle>
          <SheetDescription className="sr-only">
            Step-by-step reasoning and tool calls from the agent.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 min-w-0 flex-1">
          <div className="min-w-0 space-y-4 p-6 pb-10">
            {thoughts.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No thoughts yet
              </div>
            ) : (
              thoughts.map((thought, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-muted-foreground">
                          Step {thought.stepIndex + 1}
                        </span>
                        <div className="flex-1 border-t border-chrome-border" />
                      </div>
                      <p className="text-sm leading-relaxed text-foreground">
                        {thought.text}
                      </p>
                    </div>
                  </div>

                  {thought.reasoningText && (
                    <div className="ml-6 mt-2 border-l border-chrome-border pl-3 text-xs italic text-muted-foreground">
                      {thought.reasoningText}
                    </div>
                  )}

                  <ToolCallsSection thought={thought} />

                  {idx < thoughts.length - 1 && (
                    <Separator className="my-3 bg-chrome-border" />
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
