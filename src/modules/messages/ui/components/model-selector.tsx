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
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/server";
import { useQuery } from "@tanstack/react-query";

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

// Custom hook for model selection logic
export function useModelSelector() {
  const {
    data: userSettings,
    isLoading,
    error,
  } = useQuery(trpc.settings.get.queryOptions());
  const [selectedModels, setSelectedModels] = useState<SelectedModels>({});

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

  // Update model selection for a provider
  const setModelForProvider = (provider: Provider, model: string) => {
    setSelectedModels((prev) => ({
      ...prev,
      [provider]: model,
    }));
  };

  return {
    selectedModels,
    availableProviders,
    unavailableProviders,
    setModelForProvider,
    isLoading,
    error,
    availableModels: AVAILABLE_MODELS,
  };
}

// Props for the ModelSelector component
interface ModelSelectorProps {
  className?: string;
}

// UI Component for model selection
export function ModelSelector({ className }: ModelSelectorProps) {
  const {
    selectedModels,
    availableProviders,
    unavailableProviders,
    setModelForProvider,
    availableModels,
    isLoading,
    error,
  } = useModelSelector();

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
        {/* Show dropdowns for providers with API keys */}
        {isLoading ? (
          <>Loading settings...</>
        ) : (
          <>
            {availableProviders.map((provider) => (
              <div key={provider} className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">
                  {providerLabels[provider]} Model
                </label>
                <Select
                  value={selectedModels[provider]}
                  onValueChange={(value) =>
                    setModelForProvider(provider, value)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={`Select ${providerLabels[provider]} model`}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>
                        {providerLabels[provider]} Models
                      </SelectLabel>
                      {availableModels[provider].map((model) => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            ))}
            {/* Show messages for providers without API keys */}
            {unavailableProviders.map((provider) => (
              <div key={provider} className="flex flex-col gap-2 opacity-50">
                <label className="text-sm font-medium text-muted-foreground">
                  {providerLabels[provider]} Model
                </label>
                <div className="border border-dashed border-muted-foreground/30 rounded-md px-3 py-2 text-sm text-muted-foreground">
                  API Key not saved for {providerLabels[provider]}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
