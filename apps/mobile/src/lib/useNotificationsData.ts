// Live data for the native Notifications screen (and the "More" tab's unread
// badge) — mirrors web's src/components/layout/NotificationCenter.tsx.
// Grouping is delegated to the shared, unit-tested groupNotifications.
import { useEffect, useMemo, useState } from 'react';
import { groupNotifications, type Notification } from '@cisa/core';
import { useAuth } from './AuthProvider';
import { handleFirestoreError, OperationType } from './firebase';
import {
  subscribeNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  setAsideNotification,
} from './data/notifications';

export function useNotificationsData() {
  const { uid } = useAuth();
  const [list, setList] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeNotifications(uid, (l) => {
      setList(l);
      setLoading(false);
    }, (e) => {
      setError("Couldn't load notifications.");
      setLoading(false);
      handleFirestoreError(e, OperationType.LIST, 'notifications', { rethrow: false });
    });
    return unsub;
  }, [uid]);

  const { unread, read, unreadCount } = useMemo(() => groupNotifications(list), [list]);

  const markAsRead = async (id: string) => {
    if (!uid) return;
    await markNotificationRead(id, uid);
  };

  const markAllAsRead = async () => {
    if (!uid || unread.length === 0) return;
    await markAllNotificationsRead(unread.map((n) => n.id), uid);
  };

  const setAside = async (notif: Notification) => {
    if (!uid) return;
    await setAsideNotification(notif, uid);
  };

  return { loading, error, unread, read, unreadCount, markAsRead, markAllAsRead, setAside };
}
