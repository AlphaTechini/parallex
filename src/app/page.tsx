import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  redirect((await isAuthenticatedNextjs()) ? "/dashboard" : "/signin");
}
