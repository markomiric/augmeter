import { describe, expect, it } from "vitest";
import { ProviderConfigSection } from "../core/config/provider-config";

describe("ProviderConfigSection", () => {
  it("preserves path prefixes in Copilot API base URLs", () => {
    const config = {
      get<T>(key: string, defaultValue?: T): T | undefined {
        if (key === "providers.copilot.api.baseUrl") {
          return "https://ghe.example.com/api/v3/" as T;
        }
        return defaultValue;
      },
    };

    const section = new ProviderConfigSection(
      config as never,
      { warning: 75, high: 90, critical: 95 },
      3,
      0
    );

    expect(section.getCopilotApiConfig().baseUrl).toBe("https://ghe.example.com/api/v3");
  });
});
