"use client";

import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Code as CodeIcon,
  MessageCircleQuestion as MessageCircleQuestionIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type Mode = "code" | "ask";

export interface UseModeSelector {
  mode: Mode;
  setMode: (mode: Mode) => void;
  availableModes: readonly Mode[];
}

export function useModeSelector(): UseModeSelector {
  const [mode, setMode] = useState<Mode>("code");
  const availableModes: readonly Mode[] = ["code", "ask"] as const;

  return { mode, setMode, availableModes };
}

interface ModeSelectorProps {
  mode: Mode;
  setMode: (mode: Mode) => void;
  availableModes: readonly Mode[];
  className?: string;
  disabledModes?: Mode[];
}

export function ModeSelector({
  mode,
  setMode,
  availableModes,
  className,
  disabledModes = [],
}: ModeSelectorProps) {
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

  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
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
            const isDisabled = disabledModes.includes(m);
            return (
              <ToggleGroupItem
                key={m}
                value={m}
                className="gap-2"
                disabled={isDisabled}
              >
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
    </div>
  );
}
