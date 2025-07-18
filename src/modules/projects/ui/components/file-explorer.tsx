"use client";

import { CodeView } from "@/components/code-view";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Fragment } from "@/generated/prisma";
import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRightIcon, FileIcon, FolderIcon } from "lucide-react";

type FileCollection = Record<string, string>;

interface Props {
  files: Fragment["files"];
}

type FileNode = {
  type: "file";
  name: string;
  path: string;
};

type DirectoryNode = {
  type: "directory";
  name: string;
  path: string;
  children: TreeNode[];
};

type TreeNode = FileNode | DirectoryNode;

function buildFileTree(files: Record<string, string>): DirectoryNode {
  const root: DirectoryNode = {
    type: "directory",
    name: "root",
    path: "",
    children: [],
  };

  Object.keys(files).forEach((path) => {
    const parts = path.split("/");
    let currentLevel = root;

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const currentPath = parts.slice(0, index + 1).join("/");

      if (isFile) {
        currentLevel.children.push({ type: "file", name: part, path });
      } else {
        let dirNode = currentLevel.children.find(
          (child): child is DirectoryNode =>
            child.type === "directory" && child.name === part
        );

        if (!dirNode) {
          dirNode = {
            type: "directory",
            name: part,
            path: currentPath,
            children: [],
          };
          currentLevel.children.push(dirNode);
        }
        currentLevel = dirNode;
      }
    });
  });

  const sortChildren = (node: DirectoryNode) => {
    node.children.sort((a, b) => {
      if (a.type === "directory" && b.type === "file") return -1;
      if (a.type === "file" && b.type === "directory") return 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach((child) => {
      if (child.type === "directory") {
        sortChildren(child);
      }
    });
  };

  sortChildren(root);

  return root;
}

const FileTreeNodeDisplay: React.FC<{
  node: TreeNode;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  level: number;
}> = ({ node, selectedFile, onSelectFile, level }) => {
  if (node.type === "directory") {
    const [isOpen, setIsOpen] = React.useState(true);

    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-start h-8 px-2"
            style={{ paddingLeft: `${level * 1.25}rem` }}
          >
            <div className="flex items-center gap-1">
              <ChevronRightIcon
                className={cn(
                  "size-4 shrink-0 transition-transform",
                  isOpen && "rotate-90"
                )}
              />
              <FolderIcon className="size-4" />
              <span className="truncate">{node.name}</span>
            </div>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {node.children.map((child) => (
            <FileTreeNodeDisplay
              key={child.path}
              node={child}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              level={level + 1}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <Button
      variant="ghost"
      className={cn(
        "w-full justify-start h-8 px-2",
        selectedFile === node.path && "bg-accent"
      )}
      style={{ paddingLeft: `${level * 1.25}rem` }}
      onClick={() => onSelectFile(node.path)}
    >
      <div className="flex items-center gap-1">
        <span className="inline-block w-4 shrink-0" />
        <FileIcon className="size-4" />
        <span className="truncate">{node.name}</span>
      </div>
    </Button>
  );
};

const getLanguageFromFileName = (
  fileName: string
): "js" | "ts" | "jsx" | "tsx" => {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (
    extension === "js" ||
    extension === "ts" ||
    extension === "jsx" ||
    extension === "tsx"
  ) {
    return extension;
  }
  return "tsx";
};

export function FileExplorer({ files }: Props) {
  const fileCollection = files as FileCollection;
  const fileTree = React.useMemo(
    () => buildFileTree(fileCollection),
    [fileCollection]
  );

  const [selectedFile, setSelectedFile] = React.useState<string | null>(
    Object.keys(fileCollection)[0] || null
  );

  const selectedFileContent = selectedFile ? fileCollection[selectedFile] : "";
  const selectedFileLang = selectedFile
    ? getLanguageFromFileName(selectedFile)
    : "tsx";

  return (
    <ResizablePanelGroup direction="horizontal" className="rounded-lg border">
      <ResizablePanel defaultSize={25} minSize={15}>
        <ScrollArea className="h-full p-2">
          {fileTree.children.map((node) => (
            <FileTreeNodeDisplay
              key={node.path}
              node={node}
              selectedFile={selectedFile}
              onSelectFile={setSelectedFile}
              level={0}
            />
          ))}
        </ScrollArea>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={75} className="flex flex-col min-h-0">
        {selectedFile ? (
          <div className="flex-1 overflow-auto">
            <CodeView
              lang={selectedFileLang}
              code={selectedFileContent}
              filePath={selectedFile}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p>No file selected</p>
          </div>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
