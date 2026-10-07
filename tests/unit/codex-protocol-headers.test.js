import { describe, expect, it } from "vitest";
import { CodexExecutor } from "../../open-sse/executors/codex.js";

describe("Codex Responses protocol headers", () => {
  it("keeps OAuth account binding and SSE headers with the Responses beta", () => {
    const executor = new CodexExecutor();
    const headers = new Headers(executor.buildHeaders({
      accessToken: "fixture-token",
      connectionId: "fixture-session",
      providerSpecificData: { chatgptAccountId: "fixture-account" },
    }, true));
    expect(headers.get("openai-beta")).toBe("responses=experimental");
    expect(headers.get("authorization")).toBe("Bearer fixture-token");
    expect(headers.get("chatgpt-account-id")).toBe("fixture-account");
    expect(headers.get("accept")).toBe("text/event-stream");
    expect(headers.get("session_id")).toBe("fixture-session");
    expect(headers.get("originator")).toBe("codex_cli_rs");
  });
});
