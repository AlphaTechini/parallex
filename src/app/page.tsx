"use client";

import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Spinner } from "@/components/ui/Spinner";

export default function HomePage() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(isAuthenticated ? "/dashboard" : "/signin");
  }, [isLoading, isAuthenticated, router]);

  return (
    <main className="page-loading">
      <Spinner label="Loading Parallex" />
    </main>
  );
}
