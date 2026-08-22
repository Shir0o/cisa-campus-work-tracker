import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, User, Loader2 } from 'lucide-react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { AppUser } from '../../types';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import { getOrCreateDirectChat, createGroupChat, createAnnouncementRoom } from '../../services/chat';
import { getUserInitials, firstName } from '../../lib/utils';

// Ported from the design's NewMessageModal (views/messages.jsx): a "Message"
// tab that starts a direct chat with one person or a group with several, and an
// "Announcement" tab (Full-timers only) for a room everyone reads and only the
// team posts to. The design's audience pills (Whole team / Everyone / New this
// week / My people) rely on mock roster data this app doesn't carry, so the
// announcement tab keeps the picker: you choose who it goes to.
interface CreateChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRoom: (roomId: string) => void;
}

export default function CreateChatModal({ isOpen, onClose, onSelectRoom }: CreateChatModalProps) {
  const { user: currentUser, role } = useAuth();
  const { t } = useLanguage();
  // Only a Full-timer may open an announcement room — the same gate
  // firestore.rules applies to a chatRooms create with type 'announcement'.
  const canAnnounce = role === 'admin';
  const [tab, setTab] = useState<'message' | 'announcement'>('message');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [search, setSearch] = useState('');
  const [groupName, setGroupName] = useState('');
  const [announceName, setAnnounceName] = useState('');
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !currentUser) return;

    setFetching(true);
    const usersQuery = query(collection(db, 'users'), orderBy('displayName', 'asc'));
    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const usersList: AppUser[] = [];
        snapshot.forEach((doc) => {
          const u = doc.data() as AppUser;
          // Exclude current user and test accounts
          const email = (u.email || '').toLowerCase();
          const displayName = (u.displayName || '').toLowerCase();
          const isTest = email.startsWith('cisa-') || displayName.startsWith('cisa-');
          if (doc.id !== currentUser.uid && u.approved && !isTest) {
            usersList.push({ uid: doc.id, ...u });
          }
        });
        setUsers(usersList);
        setFetching(false);
      },
      (error) => {
        console.error('Error fetching users:', error);
        setFetching(false);
      }
    );

    return unsubscribe;
  }, [isOpen, currentUser]);

  const filteredUsers = users.filter((u) => {
    const queryStr = search.toLowerCase();
    return (
      u.displayName.toLowerCase().includes(queryStr) ||
      u.email.toLowerCase().includes(queryStr)
    );
  });

  const toggleSelectUser = (uid: string) => {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  // The design's `start()`: one person → a direct chat, several → a group.
  const startMessage = async () => {
    if (!currentUser || selectedUids.length === 0) return;
    setLoading(true);
    try {
      if (selectedUids.length === 1) {
        const target = users.find((u) => u.uid === selectedUids[0]);
        const roomId = await getOrCreateDirectChat(
          { uid: currentUser.uid, displayName: currentUser.displayName || 'Member' },
          { uid: target!.uid, displayName: target!.displayName }
        );
        onSelectRoom(roomId);
      } else {
        const roomId = await createGroupChat(
          groupName.trim() || selectedUids.map((id) => firstName(users.find((u) => u.uid === id)?.displayName || 'Someone')).join(', '),
          selectedUids,
          { uid: currentUser.uid, displayName: currentUser.displayName || 'Member' }
        );
        onSelectRoom(roomId);
      }
      onClose();
    } catch (error) {
      console.error('Failed to start conversation:', error);
    } finally {
      setLoading(false);
    }
  };

  // Announcement room: a name + who receives it. Same inputs as a group — it
  // is a group everyone reads and only Full-timers post to.
  const sendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !announceName.trim() || selectedUids.length === 0) return;
    setLoading(true);
    try {
      const roomId = await createAnnouncementRoom(
        announceName.trim(),
        selectedUids,
        { uid: currentUser.uid, displayName: currentUser.displayName || 'Member' }
      );
      onSelectRoom(roomId);
      onClose();
    } catch (error) {
      console.error('Failed to create announcement room:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-scrim/55 backdrop-blur-sm"
          />

          {/* Dialog Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="relative w-full max-w-md h-[560px] bg-surface rounded-3xl border border-outline-variant shadow-2xl overflow-hidden flex flex-col z-[101]"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-low shrink-0">
              <h3 className="font-serif text-xl text-on-surface">{t('modals.new_message')}</h3>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs — the design's Message / Announcement */}
            <div className="flex border-b border-outline-variant shrink-0 bg-surface-container-low/55 p-1.5 gap-1">
              <button
                onClick={() => { setTab('message'); setSearch(''); setSelectedUids([]); setGroupName(''); setAnnounceName(''); }}
                className={`flex-1 py-2 px-3 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  tab === 'message'
                    ? 'bg-primary text-on-primary '
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {t('modals.message')}
              </button>
              {canAnnounce && (
                <button
                  onClick={() => { setTab('announcement'); setSearch(''); setSelectedUids([]); setGroupName(''); setAnnounceName(''); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                    tab === 'announcement'
                      ? 'bg-primary text-on-primary '
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {t('modals.announcement')}
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="px-5 py-3 border-b border-outline-variant bg-surface shrink-0 flex items-center gap-3">
              <Search className="w-4 h-4 text-on-surface-variant shrink-0" />
              <input
                type="text"
                placeholder={t('modals.find_someone')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/70"
              />
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 bg-surface-container-lowest">
              {fetching ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-on-surface-variant">
                  <Loader2 className="w-8 h-8 animate-spin text-accent" />
                  <span className="text-xs">{t('modals.fetching_people')}</span>
                </div>
              ) : (
                <>
                  {/* Selected chips — the design's msgs-chips */}
                  {selectedUids.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {selectedUids.map((uid) => {
                        const p = users.find((u) => u.uid === uid);
                        return (
                          <span
                            key={uid}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-accent text-xs font-semibold"
                          >
                            {p?.displayName || uid}
                            <button
                              onClick={() => toggleSelectUser(uid)}
                              className="p-0.5 rounded-full hover:bg-primary/15 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {tab === 'message' ? (
                    <>
                      {selectedUids.length > 1 && (
                        <input
                          type="text"
                          placeholder={t('modals.name_group_optional')}
                          value={groupName}
                          onChange={(e) => setGroupName(e.target.value)}
                          className="w-full h-11 px-4 rounded-xl bg-surface border border-outline focus:border-primary outline-none transition-all text-sm text-on-surface mb-3"
                        />
                      )}
                      {filteredUsers.length === 0 ? (
                        <div className="text-center py-12 text-on-surface-variant text-sm">
                          {t('modals.nobody_by_that_name')}
                        </div>
                      ) : (
                        filteredUsers.map((u) => {
                          const isSelected = selectedUids.includes(u.uid);
                          return (
                            <div
                              key={u.uid}
                              onClick={() => toggleSelectUser(u.uid)}
                              className={`p-2.5 rounded-xl border flex items-center gap-3 transition-all cursor-pointer mb-2 ${
                                isSelected
                                  ? 'border-primary bg-primary/5 text-on-surface'
                                  : 'border-outline-variant/60 bg-surface text-on-surface hover:bg-surface-container-high'
                              }`}
                            >
                              <div className="w-9 h-9 rounded-full bg-primary/10 text-accent font-semibold flex items-center justify-center text-xs shrink-0">
                                {u.photoURL ? (
                                  <img src={u.photoURL} alt={u.displayName} className="w-full h-full object-cover rounded-full" />
                                ) : (
                                  getUserInitials(u.displayName)
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h5 className="font-semibold text-xs text-on-surface truncate">
                                  {u.displayName}
                                </h5>
                                <p className="text-[10px] text-on-surface-variant truncate">
                                  {u.email}
                                </p>
                              </div>
                              {isSelected && (
                                <User className="w-4 h-4 text-accent shrink-0" />
                              )}
                            </div>
                          );
                        })
                      )}
                    </>
                  ) : (
                    /* Announcement form — a name + who receives it. */
                    <form id="create-announcement-form" onSubmit={sendAnnouncement}>
                      <p className="text-xs text-on-surface-variant leading-relaxed px-1 mb-3">
                        {t('modals.announcement_desc')}
                      </p>
                      <input
                        type="text"
                        required
                        placeholder={t('modals.announcement_placeholder')}
                        value={announceName}
                        onChange={(e) => setAnnounceName(e.target.value)}
                        className="w-full h-11 px-4 rounded-xl bg-surface border border-outline focus:border-primary outline-none transition-all text-sm text-on-surface mb-3"
                      />
                      <div className="space-y-2 max-h-[190px] overflow-y-auto p-1">
                        {filteredUsers.length === 0 ? (
                          <div className="text-center py-6 text-on-surface-variant text-xs">
                            {t('modals.no_users_found')}
                          </div>
                        ) : (
                          filteredUsers.map((u) => {
                            const isSelected = selectedUids.includes(u.uid);
                            return (
                              <div
                                key={u.uid}
                                onClick={() => toggleSelectUser(u.uid)}
                                className={`p-2.5 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
                                  isSelected
                                    ? 'border-primary bg-primary/5 text-on-surface'
                                    : 'border-outline-variant/60 bg-surface text-on-surface hover:bg-surface-container-high'
                                }`}
                              >
                                <div className="w-8 h-8 rounded-full bg-primary/10 text-accent font-semibold flex items-center justify-center text-xs shrink-0">
                                  {u.photoURL ? (
                                    <img src={u.photoURL} alt={u.displayName} className="w-full h-full object-cover rounded-full" />
                                  ) : (
                                    getUserInitials(u.displayName)
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h5 className="font-semibold text-xs text-on-surface truncate">
                                    {u.displayName}
                                  </h5>
                                  <p className="text-[10px] text-on-surface-variant truncate">
                                    {u.email}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-outline-variant shrink-0 flex gap-3 bg-surface-container-low">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-11 rounded-full font-semibold text-accent hover:bg-primary/5 transition-all text-sm cursor-pointer"
              >
                {t('modals.cancel')}
              </button>
              {tab === 'message' ? (
                <button
                  type="button"
                  onClick={() => void startMessage()}
                  disabled={loading || selectedUids.length === 0}
                  className="flex-[2] h-11 rounded-full bg-primary text-on-primary font-semibold   hover: active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {loading ? (
                    <span className="animate-pulse">{t('modals.starting')}</span>
                  ) : selectedUids.length > 1 ? (
                    t('modals.start_group').replace('{n}', String(selectedUids.length))
                  ) : (
                    t('modals.start_conversation')
                  )}
                </button>
              ) : (
                <button
                  form="create-announcement-form"
                  type="submit"
                  disabled={loading || !announceName.trim() || selectedUids.length === 0}
                  className="flex-[2] h-11 rounded-full bg-primary text-on-primary font-semibold   hover: active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {loading ? (
                    <span className="animate-pulse">{t('modals.sending')}</span>
                  ) : (
                    t('modals.send_announcement')
                  )}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
