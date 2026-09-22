"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/templates", label: "Templates" },
  { href: "/schedules", label: "Schedules" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();

  async function handleSignOut() {
    await signOut();
    router.replace("/signin");
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="wordmark" href="/dashboard">
          <span className="wordmark-mark">P</span>
          Parallex
        </Link>
        <nav className="app-nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <Link
              className={pathname.startsWith(item.href) ? "nav-link active" : "nav-link"}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="app-header-actions">
          <ThemeToggle />
          <Button onClick={handleSignOut} size="small" variant="quiet">
            Sign out
          </Button>
        </div>
      </header>
      <main className={pathname.startsWith("/chats") ? "app-main app-main-chat" : "app-main"}>{children}</main>
    </div>
  );
}
