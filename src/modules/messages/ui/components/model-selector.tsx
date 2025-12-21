"use client";

import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
  SelectGroup,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SlidersHorizontal as SlidersHorizontalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserSettings } from "@/hooks/use-user-settings";

// Available models for each provider based on intellisense screenshots
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

type Provider = keyof typeof AVAILABLE_MODELS;

export type SelectedModels = {
  [K in Provider]?: string;
};

// Single model selection - only one model can be selected at a time
export interface SingleModelSelection {
  provider: Provider;
  model: string;
}

// Custom hook for model selection logic
export function useModelSelector() {
  const {
    data: userSettings,
    isLoading,
    error,
  } = useUserSettings();
  const [selectedModel, setSelectedModel] = useState<string>("");

  // Determine which providers have API keys
  const availableProviders = useMemo(() => {
    const providers: Provider[] = [
      [userSettings?.openaiApiKey, "openai"],
      [userSettings?.anthropicApiKey, "anthropic"],
      [userSettings?.geminiApiKey, "gemini"],
    ]
      .filter(([apiKey]) => Boolean(apiKey))
      .map((tuple) => tuple[1] as Provider);

    return providers;
  }, [
    userSettings?.openaiApiKey,
    userSettings?.anthropicApiKey,
    userSettings?.geminiApiKey,
  ]);

  // Get unavailable providers (those without API keys)
  const unavailableProviders = useMemo(() => {
    const allProviders: Provider[] = ["openai", "anthropic", "gemini"];
    return allProviders.filter((p) => !availableProviders.includes(p));
  }, [availableProviders]);

  // Parse selected model to get provider and model name
  const selectedModelInfo = useMemo((): SingleModelSelection | null => {
    if (!selectedModel) return null;

    for (const provider of availableProviders) {
      const models = AVAILABLE_MODELS[provider];
      if (models.find((m) => m.value === selectedModel)) {
        return { provider, model: selectedModel };
      }
    }
    return null;
  }, [selectedModel, availableProviders]);

  // Convert to the format expected by TRPC (for backward compatibility)
  const selectedModels = useMemo((): SelectedModels => {
    if (!selectedModelInfo) return {};
    return {
      [selectedModelInfo.provider]: selectedModelInfo.model,
    };
  }, [selectedModelInfo]);

  return {
    selectedModel,
    setSelectedModel,
    selectedModels, // For backward compatibility with existing code
    selectedModelInfo,
    availableProviders,
    unavailableProviders,
    isLoading,
    error,
    availableModels: AVAILABLE_MODELS,
  };
}

// Props for the ModelSelector component
interface ModelSelectorProps {
  className?: string;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  availableProviders: Provider[];
  unavailableProviders: Provider[];
  availableModels: typeof AVAILABLE_MODELS;
  isLoading: boolean;
  error?: Error | null;
}

// UI Component for model selection (presentational component)
export function ModelSelector({
  className,
  selectedModel,
  setSelectedModel,
  availableProviders,
  unavailableProviders,
  availableModels,
  isLoading,
  error,
}: ModelSelectorProps) {
  const providerLabels: Record<Provider, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    gemini: "Google Gemini",
  };

  if (error) {
    return <>Error loading settings: {error.message}</>;
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-3">
        {isLoading ? (
          <>Loading settings...</>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">
                AI Model
              </label>
              <p className="text-xs text-muted-foreground">
                Select one model to use for this request. Only one model can be active at a time.
              </p>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {availableProviders.map((provider) => (
                    <SelectGroup key={provider}>
                      <SelectLabel>{providerLabels[provider]}</SelectLabel>
                      {availableModels[provider].map((model) => (
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
  );
}

// Dialog wrapper for model selector
export function ModelSelectorDialog({
  selectedModel,
  setSelectedModel,
  availableProviders,
  unavailableProviders,
  availableModels,
  isLoading,
  error,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);

  // Get the display label for the selected model
  const selectedModelLabel = useMemo(() => {
    if (!selectedModel) return null;

    for (const provider of Object.keys(availableModels) as Provider[]) {
      const model = availableModels[provider].find(
        (m) => m.value === selectedModel
      );
      if (model) return model.label;
    }
    return null;
  }, [selectedModel, availableModels]);

  return (
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
        <ModelSelector
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          availableProviders={availableProviders}
          unavailableProviders={unavailableProviders}
          availableModels={availableModels}
          isLoading={isLoading}
          error={error}
        />
      </DialogContent>
    </Dialog>
  );
}
