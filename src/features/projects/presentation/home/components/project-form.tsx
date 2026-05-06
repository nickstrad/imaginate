"use client";

import { Textarea } from "@/ui/components/ui/textarea";
import { Button } from "@/ui/components/ui/button";
import { ArrowUp } from "lucide-react";
import React from "react";
import { ProjectTemplates } from "./project-templates";
import type { Mode } from "@/ui/components/mode-selector";

interface ProjectFormProps {
  isPending: boolean;
  onCreate: (input: { userPrompt: string; mode: Mode }) => void;
}

export const ProjectForm = ({ isPending, onCreate }: ProjectFormProps) => {
  const [prompt, setPrompt] = React.useState("");

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
    <div className="w-full max-w-3xl mx-auto">
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-chrome-border bg-surface-elevated p-5 shadow-md sm:p-6"
      >
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the web application you want to build..."
          className="min-h-[120px] resize-none border-0 bg-surface-subtle p-4 text-base text-foreground shadow-none focus-visible:ring-1"
          disabled={isPending}
          onKeyDown={handleKeyDown}
        />

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>↵</span>
            <code className="rounded-sm bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              Enter
            </code>
            <span>to submit</span>
          </div>

          <Button
            type="submit"
            disabled={isPending || !prompt.trim()}
            size="icon"
            className="h-10 w-10"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </form>

      <ProjectTemplates onTemplateSelect={setPrompt} />
    </div>
  );
};
