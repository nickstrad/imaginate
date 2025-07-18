"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessagesContainer } from "../components/messages-container";
import { Suspense } from "react";
import React from "react";
import { Fragment } from "@/generated/prisma";
import { FragmentWeb } from "../components/fragment-web";
import { CodeIcon, EyeIcon } from "lucide-react";
import { FileExplorer } from "../components/file-explorer";

interface Props {
  projectId: string;
}

export default function ProjectView({ projectId }: Props) {
  const [activeFragment, setActiveFragment] = React.useState<Fragment | null>(
    null
  );

  return (
    <div className="h-screen overflow-hidden">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel defaultSize={25} minSize={20} className="h-full">
          <Card className="h-full rounded-none border-r border-t-0 border-b-0 border-l-0">
            <CardContent className="p-0 h-full">
              <ScrollArea className="h-full">
                <Suspense
                  fallback={<div className="p-4">Loading messages...</div>}
                >
                  <MessagesContainer
                    projectId={projectId}
                    activeFragment={activeFragment}
                    setActiveFragment={setActiveFragment}
                  />
                </Suspense>
              </ScrollArea>
            </CardContent>
          </Card>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={75} minSize={50} className="h-full">
          {!!activeFragment ? (
            <Tabs defaultValue="demo" className="h-full flex flex-col">
              <div className="flex-shrink-0 p-2 border-b">
                <TabsList>
                  <TabsTrigger value="demo">
                    <EyeIcon className="w-4 h-4 mr-2" />
                    Demo
                  </TabsTrigger>
                  <TabsTrigger value="code">
                    <CodeIcon className="w-4 h-4 mr-2" />
                    Code
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="demo" className="flex-1 m-0 h-0">
                <div className="h-full">
                  <FragmentWeb data={activeFragment} />
                </div>
              </TabsContent>
              <TabsContent value="code" className="flex-1 m-0 h-0">
                <div className="h-full">
                  <FileExplorer files={activeFragment.files} />
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <Card className="h-full rounded-none border-0">
              <CardContent className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">
                  Select a fragment to view
                </p>
              </CardContent>
            </Card>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
