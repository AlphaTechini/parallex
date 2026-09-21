"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function Providers({ children }: { children: ReactNode }) {
  if (convex === null) {
    return (
      <main className="configuration-shell">
        <section className="configuration-card">
          <span className="eyebrow">Configuration required</span>
          <h1>Connect Parallex to Convex</h1>
          <p>
            Run <code>pnpm convex:dev</code> to provision the development
            deployment and generate the client URL.
          </p>
        </section>
      </main>
    );
  }

  return (
    <ConvexAuthProvider client={convex}>
      {children}
    </ConvexAuthProvider>
  );
}
