import { describe, expect, it } from "vitest";
import { collectFilesRecursive } from "../../providers/local-file-utils";

describe("local provider file utilities", () => {
  it("surfaces directory read failures to the provider service", async () => {
    await expect(
      collectFilesRecursive("/tmp/augmeter-directory-that-does-not-exist", () => true)
    ).rejects.toThrow();
  });
});
