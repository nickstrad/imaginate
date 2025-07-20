import Link from "next/link";
import { CrownIcon } from "lucide-react";
import { formatDuration, intervalToDuration } from "date-fns";
import { Button } from "@/components/ui/button";

interface Props {
  points: number;
  msBeforeNext: number;
}

export function Usage({ points, msBeforeNext }: Props) {
  const duration = intervalToDuration({
    start: new Date(),
    end: new Date(Date.now() + msBeforeNext),
  });
  const formattedDuration = formatDuration(duration, {
    format: ["months", "days", "hours"],
  });

  return (
    <div className="flex items-center justify-between gap-4 border border-border rounded-lg p-4 bg-card">
      <div className="flex flex-col gap-1 justify-center">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-foreground">
            Credits remaining: {points}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          Resets in {formattedDuration}
        </span>
      </div>
      <Button asChild variant="secondary" size="sm">
        <Link href="/pricing" className="text-primary">
          <CrownIcon className="h-4 w-4 mr-2 text-primary" /> Upgrade
        </Link>
      </Button>
    </div>
  );
}
