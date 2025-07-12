"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import React from "react";
import { toast } from "sonner";

export default function Home() {
  const [value, setValue] = React.useState("");
  const trpc = useTRPC();
  const invoke = useMutation(
    trpc.invoke.mutationOptions({
      onSuccess: () => {
        toast.success("Mutation successful");
      },
    })
  );

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Input value={value} onChange={(e) => setValue(e.currentTarget.value)} />
      <Button
        disabled={invoke.isPending}
        type="button"
        onClick={() => invoke.mutate({ message: value })}
      >
        invoke
      </Button>
    </div>
  );
}
