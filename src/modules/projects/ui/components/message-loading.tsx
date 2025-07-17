"use client";

import { Avatar, AvatarFallback } from "@radix-ui/react-avatar";
import { BotIcon } from "lucide-react";
import React, { useState, useEffect } from "react";

const loadingMessages = [
  "Brewing up some code...",
  "Polishing it up...",
  "Rendering final components...",
  "Putting on the final touches...",
  "Almost there...",
  "Just a few more moments...",
  "Optimizing for fun...",
  "Building the future...",
];

const ShimmerMessages = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * loadingMessages.length);
      setCurrentIndex(randomIndex);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center justify-center gap-2">
      <span className="text-base text-muted-foreground animate-pulse">
        {loadingMessages[currentIndex]}
      </span>
    </div>
  );
};

export const MessageLoading = () => {
  return (
    <div className="flex flex-col group px-2 pb-4">
      <div className="flex items-center align-center gap-2 pl-2 mb-2">
        <Avatar className="h-8 w-8">
          <AvatarFallback>
            <BotIcon className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">Imaginate</span>
      </div>
      <div className="pl-8.5 flex flex-col">
        <ShimmerMessages />
      </div>
    </div>
  );
};
