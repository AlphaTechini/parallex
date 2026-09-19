import {
  convexAuthNextjsMiddleware,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const pathname = request.nextUrl.pathname;
  const isPublic = pathname === "/" || pathname === "/signin";
  const authenticated = await convexAuth.isAuthenticated();

  if (!authenticated && !isPublic) {
    return nextjsMiddlewareRedirect(request, "/signin");
  }
  if (authenticated && pathname === "/signin") {
    return nextjsMiddlewareRedirect(request, "/dashboard");
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
