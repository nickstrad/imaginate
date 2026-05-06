import Link from "next/link";
import { SparklesIcon } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="border-b border-chrome-border bg-chrome backdrop-blur supports-[backdrop-filter]:bg-chrome">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-md border border-chrome-border bg-surface-elevated shadow-xs">
                <SparklesIcon className="size-4 text-foreground" />
              </span>
              <h1 className="text-lg font-semibold tracking-normal text-foreground">
                Imaginate
              </h1>
            </Link>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-chrome-border bg-surface-elevated px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs sm:flex">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Ready
          </div>
        </div>
      </div>
    </nav>
  );
}
