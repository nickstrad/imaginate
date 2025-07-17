import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Fragment } from "@/generated/prisma";
import { ExternalLinkIcon, RefreshCcw } from "lucide-react";
import React from "react";

interface Props {
  data: Fragment;
}

export const FragmentWeb: React.FC<Props> = ({ data }) => {
  const [fragmentKey, setFragmentKey] = React.useState(0);
  const [copied, setCopied] = React.useState(false);

  const onRefresh = () => {
    setFragmentKey((p) => p + 1);
  };

  const handleCopy = () => {
    if (data.sandboxUrl) {
      navigator.clipboard.writeText(data.sandboxUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-background">
      <div className="p-2 border-b bg-sidebar flex items-center gap-x-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="flex items-center"
                onClick={onRefresh}
              >
                <RefreshCcw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Refresh Sandbox</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 justify-start text-1 font-normal"
                disabled={!data.sandboxUrl || copied}
                onClick={handleCopy}
              >
                <span className="text-sm font-medium truncate">
                  {copied ? "Copied!" : data.sandboxUrl}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Copy Sandbox URL</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!data.sandboxUrl) {
                    return;
                  }
                  window.open(data.sandboxUrl, "_blank");
                }}
                disabled={!data.sandboxUrl}
              >
                <ExternalLinkIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Open in New Tab</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {data.sandboxUrl ? (
        <iframe
          key={fragmentKey}
          src={data.sandboxUrl}
          className="w-full h-full flex-1"
          title={data.title}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
        />
      ) : (
        <div className="p-4 flex-1 overflow-auto">
          {data.files ? (
            <pre className="bg-gray-800 text-white p-4 rounded-md text-sm">
              {JSON.stringify(data.files, null, 2)}
            </pre>
          ) : (
            <div className="prose">
              <p>No preview available.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
