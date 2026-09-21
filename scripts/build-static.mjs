import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const convexUrl =
  process.env.VITE_CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is required to build the static site.");
}

const nextCli = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const build = spawn(process.execPath, [nextCli, "build"], {
  env: { ...process.env, NEXT_PUBLIC_CONVEX_URL: convexUrl },
  stdio: "inherit",
});

build.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
build.on("exit", (code) => process.exit(code ?? 1));
