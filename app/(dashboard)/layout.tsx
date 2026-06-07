import Link from "next/link";
import { LogOut } from "lucide-react";

import { AppNav } from "@/components/app-nav";
import { Toaster } from "@/components/ui/sonner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="bg-card flex w-60 shrink-0 flex-col justify-between border-r p-4">
        <AppNav />
        <Link
          href="/api/logout"
          className="text-muted-foreground hover:text-foreground flex items-center gap-2 rounded-md px-3 py-2 text-sm"
        >
          <LogOut className="size-4" />
          Sign out
        </Link>
      </aside>
      <main className="flex-1 overflow-x-hidden p-6 lg:p-8">{children}</main>
      <Toaster />
    </div>
  );
}
