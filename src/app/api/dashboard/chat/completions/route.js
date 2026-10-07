import { verifyDashboardAuthToken } from "@/lib/auth/dashboardSession";

export async function POST(request) {
  // Require a real session even when the dashboard's requireLogin is disabled.
  // This endpoint grants access to stored provider credentials without an API key.
  const token = request.cookies.get("auth_token")?.value;
  if (!(await verifyDashboardAuthToken(token))) {
    return Response.json({ error: "Dashboard login required" }, { status: 401 });
  }

  // Cookie authentication requires CSRF protection. Basic Chat sends same-origin
  // browser POSTs; do not trust forwarded host headers or grant cross-origin CORS.
  // OpenNext/Next may reconstruct request.url with an internal hostname.
  // Browser Origin must match the incoming Host, not that internal URL.
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try {
    const parsed = new URL(origin);
    sameOrigin = (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.origin === origin &&
      parsed.host === (request.headers.get("host") || new URL(request.url).host);
  } catch {}
  if (!sameOrigin) {
    return Response.json({ error: "Same-origin request required" }, { status: 403 });
  }

  const [{ handleChat }, { initTranslators }] = await Promise.all([
    import("@/sse/handlers/chat.js"),
    import("open-sse/translator/index.js"),
  ]);
  await initTranslators();
  return handleChat(request, null, { authenticatedDashboard: true });
}
