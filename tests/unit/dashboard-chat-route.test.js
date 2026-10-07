import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  chat: vi.fn(),
  translators: vi.fn(),
}));
vi.mock("@/lib/auth/dashboardSession", () => ({ verifyDashboardAuthToken: mocks.verify }));
vi.mock("@/sse/handlers/chat.js", () => ({ handleChat: mocks.chat }));
vi.mock("open-sse/translator/index.js", () => ({ initTranslators: mocks.translators }));

import { POST } from "../../src/app/api/dashboard/chat/completions/route.js";

function request({ token, origin = "https://router.example", body = {} } = {}) {
  const req = new Request("https://router.example/api/dashboard/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origin === null ? {} : { origin }) },
    body: JSON.stringify(body),
  });
  req.cookies = { get: (name) => name === "auth_token" && token ? { value: token } : undefined };
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockImplementation(async (token) => token === "valid-session");
  mocks.chat.mockImplementation(async () => new Response("data: test\n\n", {
    headers: { "Content-Type": "text/event-stream" },
  }));
});

describe("Dashboard Basic Chat authentication", () => {
  it.each([undefined, "invalid-session"])("rejects missing/invalid session (%s)", async (token) => {
    const res = await POST(request({ token, body: { authenticatedDashboard: true } }));
    expect(res.status).toBe(401);
    expect(mocks.chat).not.toHaveBeenCalled();
    expect(mocks.translators).not.toHaveBeenCalled();
  });

  it.each([null, "https://attacker.example", "null"])("rejects an untrusted origin (%s)", async (origin) => {
    const res = await POST(request({ token: "valid-session", origin }));
    expect(res.status).toBe(403);
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it("forwards authenticated same-origin requests and preserves streaming", async () => {
    const req = request({ token: "valid-session" });
    const res = await POST(req);
    expect(mocks.translators).toHaveBeenCalledOnce();
    expect(mocks.chat).toHaveBeenCalledWith(req, null, { authenticatedDashboard: true });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await res.text()).toBe("data: test\n\n");
  });
});
