// Conversation hiding — client-only per-user state for hiding a whole
// conversation from one viewer's rail list. Mirrors `src/lib/messageHides.ts`
// and the design project's `ConvHides` (views/messages.jsx).

const CONV_HIDE_PREFIX = 'cisa.conv.hidden.';

export const ConvHides = (() => {
  const subs = new Set<() => void>();

  const key = (uid: string) => CONV_HIDE_PREFIX + uid;

  const load = (uid: string): string[] => {
    try {
      return JSON.parse(localStorage.getItem(key(uid)) || '[]');
    } catch (e) {
      return [];
    }
  };

  const save = (uid: string, arr: string[]) => {
    try {
      localStorage.setItem(key(uid), JSON.stringify(arr));
    } catch (e) {
      // Ignore quota errors
    }
  };

  const emit = () => subs.forEach((fn) => fn());

  return {
    has(uid: string, convId: string): boolean {
      return load(uid).indexOf(convId) > -1;
    },
    hide(uid: string, convId: string): void {
      const arr = load(uid);
      if (arr.indexOf(convId) < 0) {
        arr.push(convId);
        save(uid, arr);
        emit();
      }
    },
    unhide(uid: string, convId: string): void {
      save(uid, load(uid).filter((id) => id !== convId));
      emit();
    },
    unhideAll(uid: string, convIds?: string[]): void {
      if (convIds && convIds.length > 0) {
        const idSet = new Set(convIds);
        save(uid, load(uid).filter((id) => !idSet.has(id)));
      } else {
        save(uid, []);
      }
      emit();
    },
    subscribe(fn: () => void): () => void {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
})();
