"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Toast host. Kept theme-agnostic (no next-themes dependency) for this
 * single-user internal tool.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
