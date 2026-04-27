"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ProjectForm as ProjectFormView } from "@/features/projects/presentation/home/components/project-form";
import { useTRPC } from "../client";

export function ProjectForm() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const createProject = useMutation(
    trpc.projects.create.mutationOptions({
      onError: (error) => {
        toast.error(error.message);
      },
      onSuccess: (project) => {
        queryClient.invalidateQueries(trpc.projects.getMany.queryOptions());
        router.push(`/projects/${project.id}`);
      },
    })
  );

  return (
    <ProjectFormView
      isPending={createProject.isPending}
      onCreate={(input) => createProject.mutate(input)}
    />
  );
}
