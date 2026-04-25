"use client";

import {
  Sheet,
  SheetContent,
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
import type { Thought } from "@/lib/schemas/thought";

interface ThoughtsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thoughts?: Thought[];
}

const ToolCallsSection = ({ thought }: { thought: Thought }) => {
  const [expanded, setExpanded] = useState(false);
  const callCount = thought.toolCalls?.length ?? 0;
  const resultCount = thought.toolResults?.length ?? 0;

  if (callCount === 0 && resultCount === 0) return null;

  return (
    <div className="ml-6 mt-3">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-300 transition-colors">
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
          {thought.toolCalls?.map((tc, tcIdx) => (
            <div key={tcIdx}>
              <div className="text-xs text-zinc-400 font-mono mb-1">
                → {tc.toolName}
              </div>
              <div className="bg-zinc-900 rounded border border-zinc-800 p-2 text-xs">
                <pre className="text-zinc-300 overflow-x-auto max-h-32 text-xs whitespace-pre-wrap break-all">
                  {JSON.stringify(tc.args, null, 2)}
                </pre>
              </div>
              {thought.toolResults?.[tcIdx] && (
                <>
                  <div className="text-xs text-zinc-400 font-mono mt-1 mb-1">
                    ← result
                  </div>
                  <div className="bg-zinc-900 rounded border border-zinc-800 p-2 text-xs">
                    <pre className="text-zinc-300 overflow-x-auto max-h-32 text-xs">
                      {thought.toolResults[tcIdx]}
                    </pre>
                  </div>
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
        className="w-full sm:w-[500px] flex flex-col bg-zinc-950 text-zinc-100"
      >
        <SheetHeader className="border-b border-zinc-800">
          <SheetTitle className="text-zinc-100">Agent Thoughts</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 min-w-0">
          <div className="p-6 space-y-4 min-w-0">
            {thoughts.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                No thoughts yet
              </div>
            ) : (
              thoughts.map((thought, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-zinc-500">
                          Step {thought.stepIndex + 1}
                        </span>
                        <div className="flex-1 border-t border-zinc-700" />
                      </div>
                      <p className="text-zinc-200 text-sm leading-relaxed">
                        {thought.text}
                      </p>
                    </div>
                  </div>

                  {thought.reasoningText && (
                    <div className="ml-6 mt-2 text-xs text-zinc-400 italic border-l border-zinc-700 pl-3">
                      {thought.reasoningText}
                    </div>
                  )}

                  <ToolCallsSection thought={thought} />

                  {idx < thoughts.length - 1 && (
                    <Separator className="bg-zinc-800 my-3" />
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
