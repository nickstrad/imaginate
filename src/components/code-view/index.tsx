import Prism from "prismjs";

import { useEffect, useRef } from "react";

import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";

import "./code-theme.css";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { FileIcon, CopyIcon, CheckIcon } from "lucide-react";
import { useState } from "react";

const FileBreadcrumb: React.FC<{ filePath: string; onCopy: () => void }> = ({ filePath, onCopy }) => {
  const pathParts = filePath.split("/").filter(Boolean);
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="px-3 py-2 border-b bg-muted/30 backdrop-blur-sm flex items-center justify-between">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <FileIcon className="w-3.5 h-3.5 text-muted-foreground" />
          </BreadcrumbItem>
          {pathParts.map((part, index) => (
            <div key={index} className="flex items-center">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {index === pathParts.length - 1 ? (
                  <BreadcrumbPage className="font-medium text-foreground">
                    {part}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink className="text-muted-foreground hover:text-foreground">
                    {part}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </div>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
      >
        {copied ? <CheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
};

export const CodeView: React.FC<{
  lang: "js" | "ts" | "jsx" | "tsx";
  code: string;
  filePath?: string;
}> = ({ lang, code, filePath }) => {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [lang, code]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {filePath && <FileBreadcrumb filePath={filePath} onCopy={handleCopy} />}
      <div className="flex-1 overflow-auto">
        <pre className="p-3 bg-transparent border-none rounded-none m-0 text-xs">
          <code ref={codeRef} className={`language-${lang}`}>
            {code}
          </code>
        </pre>
      </div>
    </div>
  );
};
