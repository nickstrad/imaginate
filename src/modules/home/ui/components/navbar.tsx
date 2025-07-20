"use client";

import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UserControl } from "@/components/user-control";

export default function Navbar() {
  return (
    <nav className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <h1 className="text-xl font-semibold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Imaginate
              </h1>
            </Link>
          </div>

          <div className="flex items-center space-x-6 pr-4">
            <SignedOut>
              <div className="flex items-center gap-2">
                <SignInButton>
                  <Button variant="default" size="sm">
                    Sign In
                  </Button>
                </SignInButton>
                <SignUpButton>
                  <Button variant="secondary" size="sm">
                    Sign Up
                  </Button>
                </SignUpButton>
              </div>
            </SignedOut>

            <SignedIn>
              <UserControl showName />
            </SignedIn>
          </div>
        </div>
      </div>
    </nav>
  );
}
