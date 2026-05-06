"use client";

import * as React from "react";
import {
  ArrowLeft,
  Check,
  ChevronsUpDown,
  FolderKanbanIcon,
  SunMoonIcon,
} from "lucide-react";

import { cn } from "@/shared/utils";
import { Button } from "@/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuRadioItem,
} from "@/ui/components/ui/dropdown-menu";
import type { Project } from "@/generated/prisma";
import {
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
} from "@radix-ui/react-dropdown-menu";
import { useTheme } from "next-themes";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/components/ui/tooltip";

interface ProjectHeaderProps {
  projects: Project[];
  currentProjectName: string;
  onBackToDashboard: () => void;
  onProjectChange: (projectId: string) => void;
}

const PROJECT_PAGE_SIZE = 10;

const byRecentlyUpdated = (a: Project, b: Project) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

const getNextProjectCount = (current: number, total: number) =>
  Math.min(current + PROJECT_PAGE_SIZE, total);

const AppearanceMenu = ({
  theme,
  onThemeChange,
}: {
  theme: string | undefined;
  onThemeChange: (theme: string) => void;
}) => (
  <DropdownMenuSub>
    <DropdownMenuSubTrigger className="gap-2">
      <SunMoonIcon className="h-4 w-4" />
      <span>Appearance</span>
    </DropdownMenuSubTrigger>
    <DropdownMenuPortal>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={theme} onValueChange={onThemeChange}>
          <DropdownMenuRadioItem value="light">
            <span>Light</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <span>Dark</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <span>System</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuPortal>
  </DropdownMenuSub>
);

export function ProjectHeader({
  projects,
  currentProjectName,
  onBackToDashboard,
  onProjectChange,
}: ProjectHeaderProps) {
  const { theme, setTheme } = useTheme();
  const [visibleProjectCount, setVisibleProjectCount] =
    React.useState(PROJECT_PAGE_SIZE);
  const recentProjects = React.useMemo(
    () => [...projects].sort(byRecentlyUpdated),
    [projects]
  );
  const visibleProjects = recentProjects.slice(0, visibleProjectCount);
  const hiddenProjectCount = Math.max(
    recentProjects.length - visibleProjects.length,
    0
  );
  const nextProjectCount = Math.min(PROJECT_PAGE_SIZE, hiddenProjectCount);

  const showMoreProjects = (event: Event) => {
    event.preventDefault();
    setVisibleProjectCount((current) =>
      getNextProjectCount(current, recentProjects.length)
    );
  };

  return (
    <div className="sticky top-0 z-10 border-b border-chrome-border bg-chrome px-3 py-3 backdrop-blur">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="grid h-auto w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-chrome-border bg-surface-elevated px-3 py-2.5 text-left shadow-xs hover:bg-surface"
          >
            <span className="flex min-w-0 items-center gap-3 overflow-hidden">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-chrome-border bg-surface-subtle">
                <FolderKanbanIcon className="size-4 text-muted-foreground" />
              </span>
              <span className="min-w-0 flex-1 overflow-hidden">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Project
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="block max-w-full truncate text-base font-semibold text-foreground">
                      {currentProjectName}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-80">
                    {currentProjectName}
                  </TooltipContent>
                </Tooltip>
              </span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-full min-w-[250px]">
          <DropdownMenuLabel>Projects</DropdownMenuLabel>
          <AppearanceMenu theme={theme} onThemeChange={setTheme} />
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={onBackToDashboard}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              <span>Back to dashboard</span>
            </DropdownMenuItem>
            {visibleProjects.map((proj) => (
              <DropdownMenuItem
                key={proj.id}
                onSelect={() => onProjectChange(proj.id)}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    currentProjectName === proj.name
                      ? "opacity-100"
                      : "opacity-0"
                  )}
                />
                <span className="truncate">{proj.name}</span>
              </DropdownMenuItem>
            ))}
            {hiddenProjectCount > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={showMoreProjects}>
                  <span className="text-muted-foreground">
                    More projects
                    <span className="ml-1">
                      ({nextProjectCount} of {hiddenProjectCount})
                    </span>
                  </span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
