import { describe, it, expect, vi, afterEach } from "vitest";
import {
  processExpoReceipts,
  RECEIPT_READY_MS,
  RECEIPT_TTL_MS,
  type ExpoReceipt,
  type PendingReceipt,
  type ReceiptDeps,
} from "../src/receipts";

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const minutes = (n: number) => n * 60_000;

const ticket = (over: Partial<PendingReceipt> = {}): PendingReceipt => ({
  id: "doc1",
  uid: "u1",
  deviceId: "d1",
  ticketId: "tk1",
  createdAt: NOW - minutes(20),
  ...over,
});

function makeDeps(pending: PendingReceipt[], receipts: Record<string, ExpoReceipt>) {
  const deps: ReceiptDeps = {
    pendingTickets: vi.fn(async () => pending),
    fetchReceipts: vi.fn(async () => receipts),
    removeDevice: vi.fn(async () => {}),
    deleteTicket: vi.fn(async () => {}),
  };
  return deps;
}

afterEach(() => vi.restoreAllMocks());

describe("processExpoReceipts (#1439)", () => {
  it("does not ask Expo for a receipt before it is likely available", async () => {
    const deps = makeDeps([ticket({ createdAt: NOW - minutes(5) })], {});
    const result = await processExpoReceipts(deps, NOW);

    expect(deps.fetchReceipts).not.toHaveBeenCalled();
    expect(deps.deleteTicket).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 0, errors: 0, removed: 0, cleaned: 0 });
  });

  it("fetches every ready ticket's receipt in one call", async () => {
    const deps = makeDeps(
      [ticket({ id: "doc1", ticketId: "tk1" }), ticket({ id: "doc2", ticketId: "tk2" })],
      { tk1: { status: "ok" }, tk2: { status: "ok" } },
    );
    await processExpoReceipts(deps, NOW);

    expect(deps.fetchReceipts).toHaveBeenCalledWith(["tk1", "tk2"]);
  });

  it("cleans up a ticket once its receipt has been handled", async () => {
    const deps = makeDeps([ticket()], { tk1: { status: "ok" } });
    const result = await processExpoReceipts(deps, NOW);

    expect(deps.deleteTicket).toHaveBeenCalledWith("doc1");
    expect(result).toMatchObject({ checked: 1, cleaned: 1 });
  });

  it("logs a failed receipt at ERROR with the uid, device id and service error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = makeDeps([ticket()], {
      tk1: { status: "error", details: { error: "InvalidCredentials" }, message: "bad creds" },
    });
    const result = await processExpoReceipts(deps, NOW);

    expect(error).toHaveBeenCalledTimes(1);
    const logged = error.mock.calls[0][0] as string;
    expect(logged).toContain("u1");
    expect(logged).toContain("d1");
    expect(logged).toContain("InvalidCredentials");
    expect(logged).toContain("bad creds");
    expect(result).toMatchObject({ checked: 1, errors: 1, removed: 0, cleaned: 1 });
  });

  it("removes the device when the receipt says DeviceNotRegistered", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = makeDeps([ticket()], {
      tk1: { status: "error", details: { error: "DeviceNotRegistered" } },
    });
    const result = await processExpoReceipts(deps, NOW);

    expect(deps.removeDevice).toHaveBeenCalledWith("u1", "d1");
    expect(result).toMatchObject({ errors: 1, removed: 1, cleaned: 1 });
  });

  it("cleans up a ticket whose receipt never arrived before it expired", async () => {
    const deps = makeDeps([ticket({ createdAt: NOW - RECEIPT_TTL_MS - 1 })], {});
    const result = await processExpoReceipts(deps, NOW);

    expect(deps.deleteTicket).toHaveBeenCalledWith("doc1");
    expect(result).toMatchObject({ checked: 0, cleaned: 1 });
  });

  it("keeps a ticket queued when the receipt fetch fails, for the next tick", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = makeDeps([ticket()], {});
    deps.fetchReceipts = vi.fn(async () => {
      throw new Error("network");
    });

    const result = await processExpoReceipts(deps, NOW);

    expect(deps.deleteTicket).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    expect(result).toEqual({ checked: 0, errors: 0, removed: 0, cleaned: 0 });
  });

  it("does nothing when no tickets are pending", async () => {
    const deps = makeDeps([], {});
    const result = await processExpoReceipts(deps, NOW);

    expect(deps.fetchReceipts).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 0, errors: 0, removed: 0, cleaned: 0 });
  });

  it("checks a receipt as soon as the readiness window has elapsed", async () => {
    const deps = makeDeps([ticket({ createdAt: NOW - RECEIPT_READY_MS })], { tk1: { status: "ok" } });
    await processExpoReceipts(deps, NOW);

    expect(deps.fetchReceipts).toHaveBeenCalledWith(["tk1"]);
  });
});
