"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/platform/trpc-client";
import { ProjectList as ProjectListView } from "../components/project-list";

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
