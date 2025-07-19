"use client";

import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { BotIcon } from "lucide-react";

export const ProjectList = () => {
  const trpc = useTRPC();
  const router = useRouter();

  const { data: projects, isLoading } = useSuspenseQuery(
    trpc.projects.getMany.queryOptions(undefined, {
      refetchOnWindowFocus: false,
    })
  );

  if (isLoading) {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Your Projects
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <p className="text-sm text-muted-foreground text-center">
          No projects yet. Create your first one above!
        </p>
      </div>
    );
  }

  const handleProjectClick = (projectId: string) => {
    router.push(`/projects/${projectId}`);
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInMs = now.getTime() - new Date(date).getTime();
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));

    if (diffInMinutes < 60) {
      return diffInMinutes === 1
        ? "about 1 minute ago"
        : `about ${diffInMinutes} minutes ago`;
    } else if (diffInHours < 24) {
      return diffInHours === 1
        ? "about 1 hour ago"
        : `about ${diffInHours} hours ago`;
    } else if (diffInDays === 1) {
      return "about 1 day ago";
    } else if (diffInDays < 30) {
      return `about ${diffInDays} days ago`;
    } else {
      const diffInMonths = Math.floor(diffInDays / 30);
      return diffInMonths === 1
        ? "about 1 month ago"
        : `about ${diffInMonths} months ago`;
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-foreground mb-4 text-left">
        Your Projects
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((project) => (
          <Card
            key={project.id}
            className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 border-2 border-border hover:border-primary/50 py-0"
            onClick={() => handleProjectClick(project.id)}
          >
            <CardContent className="px-3 py-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center">
                  <BotIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-foreground text-sm whitespace-nowrap">
                    {project.name}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {getTimeAgo(project.updatedAt)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
