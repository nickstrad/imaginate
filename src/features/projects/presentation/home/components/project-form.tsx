"use client";

import { Textarea } from "@/ui/components/ui/textarea";
import { Button } from "@/ui/components/ui/button";
import { ArrowUp, WandSparklesIcon } from "lucide-react";
import React from "react";
import { useRotatingPromptIdea } from "./prompt-ideas";
import { ProjectTemplates } from "./project-templates";
import type { Mode } from "@/ui/components/mode-selector";

interface ProjectFormProps {
  isPending: boolean;
  onCreate: (input: { userPrompt: string; mode: Mode }) => void;
}

const PromptIdea = ({ promptIdea }: { promptIdea: string }) => (
  <div
    key={promptIdea}
    className="pointer-events-none absolute inset-x-4 top-4 text-left text-base leading-7 text-muted-foreground/80 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-500"
  >
    {promptIdea}
  </div>
);

export const ProjectForm = ({ isPending, onCreate }: ProjectFormProps) => {
  const [prompt, setPrompt] = React.useState("");
  const promptIdea = useRotatingPromptIdea();
  const isPromptEmpty = prompt.length === 0;

  const submit = () => {
    if (!prompt.trim()) {
      return;
    }
    onCreate({
      userPrompt: prompt,
      mode: "code",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-chrome-border bg-surface-elevated p-4 shadow-lg sm:p-5"
      >
        <div className="flex items-center gap-2 px-1 text-sm font-medium text-foreground">
          <WandSparklesIcon className="size-4" />
          <span>New build</span>
        </div>

        <div className="relative">
          {isPromptEmpty && <PromptIdea promptIdea={promptIdea} />}
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder=""
            aria-label="Describe the project to build"
            className="min-h-[136px] resize-none border-0 bg-surface-subtle p-4 text-base leading-7 text-foreground shadow-inner focus-visible:ring-1"
            disabled={isPending}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <span>↵</span>
            <code className="rounded-sm bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              Enter
            </code>
            <span className="truncate">to start</span>
          </div>

          <Button
            type="submit"
            disabled={isPending || !prompt.trim()}
            className="h-10 px-4"
          >
            <ArrowUp className="h-4 w-4" />
            <span className="hidden sm:inline">Build</span>
          </Button>
        </div>
      </form>

      <ProjectTemplates onTemplateSelect={setPrompt} />
    </div>
  );
};
