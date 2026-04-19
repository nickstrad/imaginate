"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
  SelectGroup,
  SelectSeparator,
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
import { SlidersHorizontal as SlidersHorizontalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import {
  PROVIDERS,
  PROVIDER_LABELS,
  type Provider,
  type SelectedModels,
} from "@/lib/providers";

const STORAGE_KEY = "imaginate:selected-model";

// Anthropic + Gemini entries confirmed against the official model list pages;
// OpenAI entries are the current GPT-5 / GPT-4.1 / GPT-4o / o-series families.
export const AVAILABLE_MODELS = {
  openai: [
    { value: "gpt-5.4", label: "GPT-5.4" },
    { value: "gpt-5.4-pro", label: "GPT-5.4 Pro" },
    { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
    { value: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
    { value: "gpt-5", label: "GPT-5" },
    { value: "gpt-5-mini", label: "GPT-5 Mini" },
    { value: "gpt-5-nano", label: "GPT-5 Nano" },
  ],
  anthropic: [
    { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
    { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { value: "claude-opus-4-5", label: "Claude Opus 4.5" },
    { value: "claude-opus-4-1", label: "Claude Opus 4.1" },
  ],
  gemini: [
    { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)" },
    { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)" },
    {
      value: "gemini-3.1-flash-lite-preview",
      label: "Gemini 3.1 Flash Lite (Preview)",
    },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  ],
} as const satisfies Record<
  Provider,
  ReadonlyArray<{ value: string; label: string }>
>;

export interface SingleModelSelection {
  provider: Provider;
  model: string;
}

function findProviderForModel(model: string): Provider | null {
  for (const provider of PROVIDERS) {
    if (AVAILABLE_MODELS[provider].some((m) => m.value === model)) {
      return provider;
    }
  }
  return null;
}

function getModelLabel(model: string): string | null {
  const provider = findProviderForModel(model);
  if (!provider) return null;
  return (
    AVAILABLE_MODELS[provider].find((m) => m.value === model)?.label ?? null
  );
}

export function useModelSelector() {
  const trpc = useTRPC();
  const {
    data: providers,
    isLoading,
    error,
  } = useQuery(
    trpc.providers.list.queryOptions(undefined, { staleTime: Infinity })
  );
  const [selectedModel, setSelectedModelState] = useState<string>("");

  const availableProviders = useMemo(() => {
    return PROVIDERS.filter((p) => providers?.[p]);
  }, [providers]);

  const unavailableProviders = useMemo(() => {
    return PROVIDERS.filter((p) => !availableProviders.includes(p));
  }, [availableProviders]);

  // Hydrate from localStorage once providers load; discard the stored value
  // if its provider no longer has a key or the model was removed from the list.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!providers) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const provider = findProviderForModel(stored);
    if (provider && providers[provider]) {
      setSelectedModelState(stored);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [providers]);

  const setSelectedModel = useCallback((value: string) => {
    setSelectedModelState(value);
    if (typeof window === "undefined") return;
    if (value) window.localStorage.setItem(STORAGE_KEY, value);
    else window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const selectedModelInfo = useMemo((): SingleModelSelection | null => {
    if (!selectedModel) return null;
    const provider = findProviderForModel(selectedModel);
    if (!provider || !availableProviders.includes(provider)) return null;
    return { provider, model: selectedModel };
  }, [selectedModel, availableProviders]);

  const selectedModels = useMemo((): SelectedModels => {
    if (!selectedModelInfo) return {};
    return { [selectedModelInfo.provider]: selectedModelInfo.model };
  }, [selectedModelInfo]);

  return {
    selectedModel,
    setSelectedModel,
    selectedModels,
    selectedModelInfo,
    availableProviders,
    unavailableProviders,
    isLoading,
    error,
    availableModels: AVAILABLE_MODELS,
  };
}

interface ModelSelectorProps {
  className?: string;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  availableProviders: Provider[];
  unavailableProviders: Provider[];
  availableModels: typeof AVAILABLE_MODELS;
  isLoading: boolean;
  error?: { message: string } | null;
}

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
  if (error) {
    return <>Error loading providers: {error.message}</>;
  }

  const noProvidersConfigured = !isLoading && availableProviders.length === 0;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-3">
        {isLoading ? (
          <>Loading providers...</>
        ) : noProvidersConfigured ? (
          <div className="text-sm text-destructive">
            No LLM providers are configured. Set{" "}
            <code className="font-mono text-xs">OPENAI_API_KEY</code>,{" "}
            <code className="font-mono text-xs">ANTHROPIC_API_KEY</code>, or{" "}
            <code className="font-mono text-xs">GEMINI_API_KEY</code> and
            restart.
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">
                AI Model
              </label>
              <p className="text-xs text-muted-foreground">
                Pick one model for this request. Your choice is saved locally.
              </p>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {availableProviders.map((provider) => (
                    <SelectGroup key={provider}>
                      <SelectLabel>{PROVIDER_LABELS[provider]}</SelectLabel>
                      {availableModels[provider].map((model) => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}

                  {unavailableProviders.length > 0 && (
                    <>
                      <SelectSeparator />
                      {unavailableProviders.map((provider) => (
                        <SelectGroup key={provider}>
                          <SelectLabel className="text-muted-foreground">
                            {PROVIDER_LABELS[provider]} — API key not set
                          </SelectLabel>
                          {availableModels[provider].map((model) => (
                            <SelectItem
                              key={model.value}
                              value={model.value}
                              disabled
                            >
                              {model.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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

  const selectedModelLabel = useMemo(
    () => (selectedModel ? getModelLabel(selectedModel) : null),
    [selectedModel]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <SlidersHorizontalIcon className="h-4 w-4" />
          {selectedModelLabel || "Model"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select AI Model</DialogTitle>
          <DialogDescription>
            Choose which AI model to use. Providers without an API key are
            listed at the bottom and cannot be selected.
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
