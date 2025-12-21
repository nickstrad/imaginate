"use client";

import React from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "./settings-dialog";

export function SettingsButton() {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setDialogOpen(true)}
        className="h-9 w-9"
        title="Settings"
      >
        <Settings className="h-4 w-4" />
      </Button>

      <SettingsDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
