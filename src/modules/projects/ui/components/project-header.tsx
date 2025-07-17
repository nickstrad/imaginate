"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronsUpDown, SunMoonIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/dropdown-menu";
import { Project } from "@/generated/prisma";
import {
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
} from "@radix-ui/react-dropdown-menu";
import { useTheme } from "next-themes";

interface ProjectHeaderProps {
  projects: Project[];
  currentProjectName: string;
}

export function ProjectHeader({
  projects,
  currentProjectName,
}: ProjectHeaderProps) {
  const router = useRouter();

  const handleProjectChange = (projectId: string) => {
    router.push(`/projects/${projectId}`);
  };

  const { theme, setTheme } = useTheme();

  return (
    <div className="p-2 border-b bg-background sticky top-0 z-10 flex items-center justify-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-[250px] justify-between">
            <span className="truncate">{currentProjectName}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[250px]">
          <DropdownMenuLabel>Projects</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem
              onSelect={() => {
                router.push("/");
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              <span>Back to dashboard</span>
            </DropdownMenuItem>
            {projects.map((proj) => (
              <DropdownMenuItem
                key={proj.id}
                onSelect={() => handleProjectChange(proj.id)}
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
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <SunMoonIcon className="h-4 w-4" />
              <span>Appearance</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
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
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
