import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/cloud/config", () => ({
  isCloudEnabled: () => false,
  isBlobStorageEnabled: () => false,
}));

vi.mock("@/lib/clip/db/projects", () => ({
  listProjectsByUserId: vi.fn(async () => []),
}));

describe("workspace-ui-kit smoke tests", () => {
  it(
    "page module can be imported",
    async () => {
      const mod = await import("../app/page");
      expect(mod).toBeDefined();
    },
    15_000,
  );
});
