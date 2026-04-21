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
import { SlidersHorizontal as SlidersHorizontalIcon } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import {
  AVAILABLE_MODELS,
  PROVIDERS,
  PROVIDER_LABELS,
  type Provider,
  type SelectedModels,
} from "@/lib/providers";

const STORAGE_KEY = "imaginate:selected-model";

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
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  availableProviders: Provider[];
  unavailableProviders: Provider[];
  availableModels: typeof AVAILABLE_MODELS;
  isLoading: boolean;
  error?: { message: string } | null;
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
  if (error) {
    return (
      <span className="text-sm text-destructive">
        Error loading providers: {error.message}
      </span>
    );
  }

  const noProvidersConfigured = !isLoading && availableProviders.length === 0;
  const placeholder = isLoading
    ? "Loading…"
    : noProvidersConfigured
      ? "No providers"
      : "Model";

  return (
    <Select
      value={selectedModel}
      onValueChange={setSelectedModel}
      disabled={isLoading || noProvidersConfigured}
    >
      <SelectTrigger
        size="sm"
        className="gap-2 min-w-[10rem]"
        aria-label="Select AI model"
      >
        <SlidersHorizontalIcon className="h-4 w-4" />
        <SelectValue placeholder={placeholder} />
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
            {availableProviders.length > 0 && <SelectSeparator />}
            {unavailableProviders.map((provider) => (
              <SelectGroup key={provider}>
                <SelectLabel className="text-muted-foreground">
                  {PROVIDER_LABELS[provider]} — API key not set
                </SelectLabel>
                {availableModels[provider].map((model) => (
                  <SelectItem key={model.value} value={model.value} disabled>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </>
        )}
      </SelectContent>
    </Select>
  );
}
