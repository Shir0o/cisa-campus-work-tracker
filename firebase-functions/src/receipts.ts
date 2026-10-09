// Expo accepts a push with a *ticket*; the real FCM/APNs outcome arrives later
// in a *receipt*. dispatchNotification records each ok ticket, and this module
// reads the receipts so a refused push is logged and a dead device is pruned
// instead of silently counted as sent (#1439).

/** The Expo delivery result for one ticket. Only `error` carries a reason. */
export interface ExpoReceipt {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

/** A stored Expo ticket awaiting its receipt. */
export interface PendingReceipt {
  /** The store's own handle, used to delete the ticket. */
  id: string;
  uid: string;
  deviceId: string;
  ticketId: string;
  /** Epoch ms the ticket was recorded. */
  createdAt: number;
}

/** Expo recommends waiting ~15 minutes before trusting a missing receipt. */
export const RECEIPT_READY_MS = 15 * 60_000;
/** Expo keeps receipts for 24 hours; older ones will never arrive. */
export const RECEIPT_TTL_MS = 24 * 60 * 60_000;

export interface ReceiptDeps {
  /** Every recorded ticket not yet receipted. */
  pendingTickets(): Promise<PendingReceipt[]>;
  fetchReceipts(ticketIds: string[]): Promise<Record<string, ExpoReceipt>>;
  removeDevice(uid: string, deviceId: string): Promise<void>;
  deleteTicket(id: string): Promise<void>;
}

export interface ReceiptResult {
  checked: number;
  errors: number;
  removed: number;
  cleaned: number;
}

/** One pass: fetch the receipts that are due, log every delivery failure,
 *  prune devices Expo reports gone, and drop each handled or expired ticket. */
export async function processExpoReceipts(
  deps: ReceiptDeps,
  now: number = Date.now(),
): Promise<ReceiptResult> {
  const result: ReceiptResult = { checked: 0, errors: 0, removed: 0, cleaned: 0 };
  const ready = (await deps.pendingTickets()).filter((t) => now - t.createdAt >= RECEIPT_READY_MS);
  if (ready.length === 0) return result;

  let receipts: Record<string, ExpoReceipt>;
  try {
    receipts = await deps.fetchReceipts(ready.map((t) => t.ticketId));
  } catch (e) {
    // Nothing is deleted: the tickets stay queued for the next tick.
    console.error("[pushReceipts] failed to fetch Expo receipts", e);
    return result;
  }

  for (const t of ready) {
    const receipt = receipts[t.ticketId];
    if (receipt) {
      result.checked++;
      if (receipt.status === "error") {
        result.errors++;
        console.error(
          `[pushReceipts] Expo delivery failed for ${t.uid}/${t.deviceId}: ` +
            `${receipt.details?.error ?? "unknown"} — ${receipt.message ?? ""}`,
        );
        if (receipt.details?.error === "DeviceNotRegistered") {
          await deps.removeDevice(t.uid, t.deviceId);
          result.removed++;
        }
      }
      await deps.deleteTicket(t.id);
      result.cleaned++;
    } else if (now - t.createdAt >= RECEIPT_TTL_MS) {
      // The receipt window closed with no answer; stop tracking the ticket.
      await deps.deleteTicket(t.id);
      result.cleaned++;
    }
  }
  return result;
}
