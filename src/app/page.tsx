"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import React from "react";
import { toast } from "sonner";

export default function Home() {
  const [value, setValue] = React.useState("");
  const trpc = useTRPC();
  const { data: messages } = useQuery(trpc.messages.getMany.queryOptions());
  const createMessage = useMutation(
    trpc.messages.create.mutationOptions({
      onSuccess: () => {
        toast.success("Message created");
      },
    })
  );

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4">
        <Input
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
        />

        <div>
          <Button
            disabled={createMessage.isPending}
            type="button"
            onClick={() => createMessage.mutate({ value })}
          >
            Imaginate
          </Button>
        </div>
        {JSON.stringify(messages, null, 2)}
      </div>
    </div>
  );
}
