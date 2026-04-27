"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ProjectList as ProjectListView } from "@/features/projects/presentation/home/components/project-list";
import { useTRPC } from "../client";

export function ProjectList() {
  const trpc = useTRPC();
  const router = useRouter();

  const {
    data: projects,
    isLoading,
    error,
  } = useQuery(trpc.projects.getMany.queryOptions());

  return (
    <ProjectListView
      projects={projects}
      isLoading={isLoading}
      error={error}
      onProjectClick={(projectId) => router.push(`/projects/${projectId}`)}
    />
  );
}
