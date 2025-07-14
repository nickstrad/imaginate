"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import React from "react";
import { toast } from "sonner";

export default function Home() {
  const [value, setValue] = React.useState("");
  const trpc = useTRPC();
  const router = useRouter();

  const createProject = useMutation(
    trpc.projects.create.mutationOptions({
      onError: (error) => {
        toast.error(error.message);
      },
      onSuccess: (data) => {
        router.push(`/projects/${data.id}`);
      },
    })
  );

  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <div className="max-w-7xl mx-auto flex items-center flex-col gap-y-4 justify-center">
        <Input
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
        />

        <div>
          <Button
            disabled={createProject.isPending}
            type="button"
            onClick={() => createProject.mutate({ userPrompt: value })}
          >
            Imaginate
          </Button>
        </div>
      </div>
    </div>
  );
}
