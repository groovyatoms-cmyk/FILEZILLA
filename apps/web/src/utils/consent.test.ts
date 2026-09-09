import { beforeEach, describe, expect, it, vi } from "vitest";

const dbClearMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../storage/db", () => ({
  STORES: { settings: "settings", history: "history", pairedDevices: "pairedDevices" },
  dbClear: (store: string) => dbClearMock(store),
}));

const { acceptStorageConsent, getStorageConsent, isOptionalStorageAllowed, rejectStorageConsent } = await import("./consent");

describe("storage consent", () => {
  beforeEach(() => {
    localStorage.clear();
    dbClearMock.mockClear();
  });

  it("defaults to undecided and allows optional storage until the user says otherwise", () => {
    expect(getStorageConsent()).toBeNull();
    expect(isOptionalStorageAllowed()).toBe(true);
  });

  it("accepting persists the choice and keeps optional storage allowed", () => {
    acceptStorageConsent();
    expect(getStorageConsent()).toBe("accepted");
    expect(isOptionalStorageAllowed()).toBe(true);
  });

  it("rejecting persists the choice, disallows future optional storage, and clears what's already there", async () => {
    localStorage.setItem("securetransfer:theme", "light");
    await rejectStorageConsent();

    expect(getStorageConsent()).toBe("rejected");
    expect(isOptionalStorageAllowed()).toBe(false);
    expect(localStorage.getItem("securetransfer:theme")).toBeNull();
    expect(dbClearMock).toHaveBeenCalledWith("settings");
    expect(dbClearMock).toHaveBeenCalledWith("history");
    expect(dbClearMock).toHaveBeenCalledWith("pairedDevices");
  });
});
