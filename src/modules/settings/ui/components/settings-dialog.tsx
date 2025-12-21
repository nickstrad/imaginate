"use client";

import React from "react";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const trpc = useTRPC();

  const [geminiApiKey, setGeminiApiKey] = React.useState("");
  const [openaiApiKey, setOpenaiApiKey] = React.useState("");
  const [anthropicApiKey, setAnthropicApiKey] = React.useState("");

  const { data: settings, isLoading } = useQuery(
    trpc.settings.get.queryOptions()
  );
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (settings) {
      setGeminiApiKey(settings.geminiApiKey || "");
      setOpenaiApiKey(settings.openaiApiKey || "");
      setAnthropicApiKey(settings.anthropicApiKey || "");
    }
  }, [settings]);

  const saveSettings = useMutation(
    trpc.settings.save.mutationOptions({
      onSuccess: () => {
        toast.success("Settings saved successfully");
        onOpenChange(false);
        queryClient.invalidateQueries(trpc.settings.get.queryOptions());
      },
      onError: (error) => {
        toast.error(error.message || "Failed to save settings");
      },
    })
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    saveSettings.mutate({
      geminiApiKey: geminiApiKey.trim(),
      openaiApiKey: openaiApiKey.trim(),
      anthropicApiKey: anthropicApiKey.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>API Key Settings</DialogTitle>
          <DialogDescription>
            Configure your API keys for AI providers. Keys are encrypted before
            storage.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="gemini" className="text-sm font-medium">
                Google Gemini API Key
              </label>
              <Input
                id="gemini"
                type="password"
                placeholder="AIza..."
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                disabled={saveSettings.isPending}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="openai" className="text-sm font-medium">
                OpenAI API Key
              </label>
              <Input
                id="openai"
                type="password"
                placeholder="sk-..."
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                disabled={saveSettings.isPending}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="anthropic" className="text-sm font-medium">
                Anthropic API Key
              </label>
              <Input
                id="anthropic"
                type="password"
                placeholder="sk-ant-..."
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
                disabled={saveSettings.isPending}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saveSettings.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saveSettings.isPending}>
                {saveSettings.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Settings
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
