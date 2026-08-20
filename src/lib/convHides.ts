import { UserEntityState, __resetUserEntityStateCache } from "./userEntityState";

// Conversation hiding — client-only per-user state for hiding a whole
// conversation from one viewer's rail list, backed by unified UserEntityState (#326).

export const ConvHides = {
  has(uid: string, convId: string): boolean {
    return UserEntityState.isDone(uid, `conv:${convId}`);
  },

  hide(uid: string, convId: string): void {
    UserEntityState.markDone(uid, `conv:${convId}`);
  },

  unhide(uid: string, convId: string): void {
    UserEntityState.markUndone(uid, `conv:${convId}`);
  },

  unhideAll(uid: string, convIds?: string[]): void {
    if (convIds && convIds.length > 0) {
      UserEntityState.clearDone(uid, convIds.map((id) => `conv:${id}`));
    } else {
      UserEntityState.clearDone(uid);
    }
  },

  subscribe(fn: () => void): () => void {
    return UserEntityState.subscribe(fn);
  },
};

export const __resetConvHidesCache = () => {
  __resetUserEntityStateCache();
};
