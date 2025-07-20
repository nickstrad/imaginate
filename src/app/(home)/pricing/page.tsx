"use client";
import { PricingTable } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useCurrentTheme } from "@/hooks/use-current-theme";
import { Loader } from "lucide-react";

const Page = () => {
  const currentTheme = useCurrentTheme();
  return (
    <div className="flex flex-col max-w-3xl mx-auto w-full">
      <section className="space-y-6 pt=[16vh] 2xl:pt-48">
        <h1 className="text-xl md:text-3xl font-bold text-center">Pricing</h1>
        <p className="text-muted-foregroud text-center text-sm md:text-base">
          Choose the plan that fits your needs
        </p>
        <PricingTable
          fallback={
            <div className="flex items-center justify-center py-8 gap-2">
              <Loader className="h-5 w-5 text-muted-foreground animate-spin" />
              <span className="text-muted-foreground">
                Loading pricing options...
              </span>
            </div>
          }
          appearance={{
            baseTheme: currentTheme === "dark" ? dark : undefined,
            elements: {
              pricingTableCard: "border! shadow-none! rounded-lg",
            },
          }}
        />
      </section>
    </div>
  );
};

export default Page;
