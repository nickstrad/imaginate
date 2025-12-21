"use client";

import { useState, useMemo } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Code as CodeIcon,
  MessageCircleQuestion as MessageCircleQuestionIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
  SelectGroup,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Mode = "code" | "ask";

export interface UseModeSelector {
  mode: Mode;
  setMode: (mode: Mode) => void;
  availableModes: readonly Mode[];
}

// Types for model selection
type Provider = "openai" | "anthropic" | "gemini";

interface ModelOption {
  value: string;
  label: string;
}

const AVAILABLE_MODELS = {
  openai: [
    { value: "gpt-5", label: "GPT-5" },
    { value: "gpt-5-mini", label: "GPT-5 Mini" },
    { value: "gpt-5-nano", label: "GPT-5 Nano" },
    { value: "gpt-4.5-preview", label: "GPT-4.5 Preview" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "o1", label: "O1" },
    { value: "o1-preview", label: "O1 Preview" },
    { value: "o1-mini", label: "O1 Mini" },
    { value: "o3-mini", label: "O3 Mini" },
  ],
  anthropic: [
    {
      value: "claude-sonnet-4-20250514",
      label: "Claude Sonnet 4 (2025-05-14)",
    },
    { value: "claude-sonnet-4-0", label: "Claude Sonnet 4.0" },
    { value: "claude-opus-4-20250514", label: "Claude Opus 4 (2025-05-14)" },
    { value: "claude-opus-4-0", label: "Claude Opus 4.0" },
    { value: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet (Latest)" },
    {
      value: "claude-3-7-sonnet-20250219",
      label: "Claude 3.7 Sonnet (2025-02-19)",
    },
    { value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet (Latest)" },
    { value: "claude-3-opus-latest", label: "Claude 3 Opus (Latest)" },
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus (2024-02-29)" },
    {
      value: "claude-3-sonnet-20240229",
      label: "Claude 3 Sonnet (2024-02-29)",
    },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku (2024-03-07)" },
    { value: "claude-instant-1.2", label: "Claude Instant 1.2" },
  ],
  gemini: [
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    {
      value: "gemini-2.5-flash-lite-preview-06-17",
      label: "Gemini 2.5 Flash Lite Preview",
    },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    { value: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash 8B" },
    { value: "gemini-1.0-pro", label: "Gemini 1.0 Pro" },
    { value: "text-embedding-004", label: "Text Embedding 004" },
    { value: "aqa", label: "AQA" },
  ],
} as const;

export function useModeSelector(): UseModeSelector {
  const [mode, setMode] = useState<Mode>("code");
  const availableModes: readonly Mode[] = ["code", "ask"] as const;

  return { mode, setMode, availableModes };
}

interface ModeSelectorProps {
  mode: Mode;
  setMode: (mode: Mode) => void;
  availableModes: readonly Mode[];
  // Model selection props
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  availableProviders: Provider[];
  unavailableProviders: Provider[];
  isLoading?: boolean;
  error?: { message: string } | null;
  className?: string;
}

export function ModeSelector({
  mode,
  setMode,
  availableModes,
  selectedModel,
  setSelectedModel,
  availableProviders,
  unavailableProviders,
  isLoading,
  error,
  className,
}: ModeSelectorProps) {
  const [open, setOpen] = useState(false);

  const modeLabels: Record<
    Mode,
    { label: string; icon: typeof CodeIcon; description: string }
  > = {
    code: {
      label: "Code",
      icon: CodeIcon,
      description: "Generate and modify code",
    },
    ask: {
      label: "Ask",
      icon: MessageCircleQuestionIcon,
      description: "Get answers and guidance",
    },
  };

  const providerLabels: Record<Provider, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    gemini: "Google Gemini",
  };

  // Get the display label for the selected model
  const selectedModelLabel = useMemo(() => {
    if (!selectedModel) return null;

    for (const provider of Object.keys(AVAILABLE_MODELS) as Provider[]) {
      const model = AVAILABLE_MODELS[provider].find(
        (m) => m.value === selectedModel
      );
      if (model) return model.label;
    }
    return null;
  }, [selectedModel]);

  return (
    <div className={cn("flex items-start gap-2", className)}>
      <div className="space-y-2 flex-1">
        <label className="text-sm font-medium text-foreground">Mode</label>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(value) => {
            if (value) setMode(value as Mode);
          }}
          className="justify-start"
          variant="outline"
        >
          {availableModes.map((m) => {
            const ModeIcon = modeLabels[m].icon;
            return (
              <ToggleGroupItem key={m} value={m} className="gap-2">
                <ModeIcon className="h-4 w-4" />
                {modeLabels[m].label}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">
          {modeLabels[mode].description}
        </p>
      </div>

      {/* Model Selection Dialog */}
      <div className="pt-7">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontalIcon className="h-4 w-4" />
              {selectedModelLabel || "Model"}
              {selectedModelLabel && (
                <Badge variant="secondary" className="ml-1">
                  ✓
                </Badge>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Select AI Model</DialogTitle>
              <DialogDescription>
                Choose which AI model to use for generating responses. Only one
                model can be selected at a time.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-3">
                {isLoading ? (
                  <>Loading settings...</>
                ) : error ? (
                  <>Error loading settings: {error.message}</>
                ) : (
                  <>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-foreground">
                        AI Model
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Select one model to use for this request. Only one model
                        can be active at a time.
                      </p>
                      <Select
                        value={selectedModel}
                        onValueChange={setSelectedModel}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a model" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableProviders.map((provider) => (
                            <SelectGroup key={provider}>
                              <SelectLabel>
                                {providerLabels[provider]}
                              </SelectLabel>
                              {AVAILABLE_MODELS[provider].map((model) => (
                                <SelectItem key={model.value} value={model.value}>
                                  {model.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Show messages for providers without API keys */}
                    {unavailableProviders.length > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Unavailable Providers
                        </p>
                        {unavailableProviders.map((provider) => (
                          <div
                            key={provider}
                            className="text-xs text-muted-foreground py-1"
                          >
                            • {providerLabels[provider]} - API key not configured
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
