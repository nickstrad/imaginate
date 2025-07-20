"use client";

import { dark } from "@clerk/themes";
import { useCurrentTheme } from "@/hooks/use-current-theme";
import { UserButton } from "@clerk/nextjs";

interface Props {
  showName?: boolean;
}
export function UserControl({ showName }: Props) {
  const currentTheme = useCurrentTheme();
  return (
    <div className="flex items-center space-x-4">
      <UserButton
        showName={showName}
        appearance={{
          elements: {
            userButtonAvatarBox: "rounded-md!",
            userButtonAvatarImage: "rounded-md! size-8!",
            userButtonTrigger: "rounded-md!",
          },
          baseTheme: currentTheme === "dark" ? dark : undefined,
        }}
      />
    </div>
  );
}
