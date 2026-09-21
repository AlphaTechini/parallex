import { components } from "./_generated/api";
import { httpAction } from "./_generated/server";

function assetPaths(pathname: string): string[] {
  if (pathname === "/") return ["/index.html"];
  const path = pathname.replace(/\/+$/, "");
  if (!path || path.includes("/../") || path.endsWith("/..")) return [];
  if (/\.[^/]+$/.test(path)) return [path];
  return [`${path}/index.html`, `${path}.html`, path];
}

function cacheControl(path: string): string {
  if (path.startsWith("/_next/static/")) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=0, must-revalidate";
}

type StaticAsset = {
  contentType: string;
  etag?: string;
  storageUrl?: string;
};

function legacyDetailRedirect(url: URL, pathname: string): Response | null {
  const match = pathname.match(/^\/(bots|chats)\/([^/]+)\/?$/);
  if (
    match === null ||
    /\.[^/]+$/.test(match[2]) ||
    (match[1] === "bots" && match[2] === "new")
  ) {
    return null;
  }
  const target = new URL(url);
  target.pathname = `/${match[1]}`;
  target.searchParams.set(match[1] === "bots" ? "botId" : "chatId", match[2]);
  return Response.redirect(target, 308);
}

async function serveAsset(
  request: Request,
  asset: StaticAsset,
  path: string,
  status = 200,
): Promise<Response> {
  const headers = new Headers({
    "Cache-Control": cacheControl(path),
    "Content-Type": asset.contentType,
    "X-Content-Type-Options": "nosniff",
  });
  if (asset.etag !== undefined) {
    headers.set("ETag", asset.etag);
    if (request.headers.get("If-None-Match") === asset.etag) {
      return new Response(null, { status: 304, headers });
    }
  }
  if (asset.storageUrl === undefined) {
    return new Response("Storage error", { status: 500 });
  }
  const response = await fetch(asset.storageUrl);
  if (!response.ok || response.body === null) {
    return new Response("Storage error", { status: 500 });
  }
  return new Response(response.body, { status, headers });
}

export const serveStaticSite = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const redirect = legacyDetailRedirect(url, pathname);
  if (redirect !== null) return redirect;

  for (const path of assetPaths(pathname)) {
    const asset = await ctx.runQuery(
      components.staticHosting.lib.resolveAssetForHttp,
      { path, spaFallback: false },
    );
    if (asset !== null) {
      return await serveAsset(request, asset, path);
    }
  }

  const notFound = await ctx.runQuery(
    components.staticHosting.lib.resolveAssetForHttp,
    { path: "/404.html", spaFallback: false },
  );
  if (notFound === null) {
    return new Response("Not Found", { status: 404 });
  }
  return await serveAsset(request, notFound, "/404.html", 404);
});
