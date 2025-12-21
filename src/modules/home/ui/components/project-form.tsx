"use client";

import { useTRPC } from "@/trpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp } from "lucide-react";
import React from "react";
import { ProjectTemplates } from "./project-templates";
import { useClerk } from "@clerk/nextjs";
import {
  ModelSelector,
  useModelSelector,
} from "@/modules/messages/ui/components/model-selector";

export const ProjectForm = () => {
  const [prompt, setPrompt] = React.useState("");
  const router = useRouter();
  const trpc = useTRPC();
  const clerk = useClerk();
  const queryClient = useQueryClient();
  const modelSelectorState = useModelSelector();
  const { selectedModels } = modelSelectorState;

  const createProject = useMutation(
    trpc.projects.create.mutationOptions({
      onError: (error) => {
        toast.error(error.message);

        if (error.data?.code === "UNAUTHORIZED") {
          clerk.openSignIn();
        }

        if (error.data?.code === "TOO_MANY_REQUESTS") {
          router.push("/pricing");
        }
      },
      onSuccess: (project) => {
        queryClient.invalidateQueries(trpc.projects.getMany.queryOptions());
        queryClient.invalidateQueries(trpc.usage.status.queryOptions());
        router.push(`/projects/${project.id}`);
      },
    })
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      createProject.mutate({ userPrompt: prompt, selectedModels });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (prompt.trim()) {
        createProject.mutate({ userPrompt: prompt, selectedModels });
      }
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <form
        onSubmit={handleSubmit}
        className="border-2 border-border rounded-xl p-6 space-y-4 bg-card shadow-sm"
      >
        <div className="mb-4">
          <ModelSelector
            selectedModels={modelSelectorState.selectedModels}
            availableProviders={modelSelectorState.availableProviders}
            unavailableProviders={modelSelectorState.unavailableProviders}
            setModelForProvider={modelSelectorState.setModelForProvider}
            availableModels={modelSelectorState.availableModels}
            isLoading={modelSelectorState.isLoading}
            error={modelSelectorState.error}
          />
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the web application you want to build..."
          className="min-h-[120px] resize-none text-base border-0 focus:ring-0 focus:outline-none p-4 text-foreground"
          disabled={createProject.isPending}
          onKeyDown={handleKeyDown}
        />

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>↵</span>
            <code className="bg-muted px-2 py-1 rounded text-xs">Enter</code>
            <span>to submit</span>
          </div>

          <Button
            type="submit"
            disabled={createProject.isPending || !prompt.trim()}
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
