"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { MessagesContainer } from "../components/messages-container";
import { Suspense } from "react";
import React from "react";
import { Fragment } from "@/generated/prisma";

interface Props {
  projectId: string;
}

export default function ProjectView({ projectId }: Props) {
  const [activeFragment, setActiveFragment] = React.useState<Fragment | null>(
    null
  );

  return (
    <div className="h-screen">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel
          defaultSize={25}
          minSize={20}
          className="flex flex-col min-h-0"
        >
          <Suspense fallback={<div>Loading messages...</div>}>
            <MessagesContainer
              projectId={projectId}
              activeFragment={activeFragment}
              setActiveFragment={setActiveFragment}
            />
          </Suspense>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={75} minSize={50}>
          TOOD: preview{" "}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
