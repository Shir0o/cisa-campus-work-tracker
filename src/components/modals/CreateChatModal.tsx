import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, MessageSquare, Users, Megaphone, Loader2 } from 'lucide-react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { AppUser } from '../../types';
import { useAuth } from '../AuthProvider';
import { getOrCreateDirectChat, createGroupChat, createAnnouncementRoom } from '../../services/chat';
import { getUserInitials } from '../../lib/utils';

interface CreateChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRoom: (roomId: string) => void;
}

export default function CreateChatModal({ isOpen, onClose, onSelectRoom }: CreateChatModalProps) {
  const { user: currentUser, role } = useAuth();
  // Only a Full-timer may open an announcement room — the same gate
  // firestore.rules applies to a chatRooms create with type 'announcement'.
  const canAnnounce = role === 'admin';
  const [tab, setTab] = useState<'direct' | 'group' | 'announcement'>('direct');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [search, setSearch] = useState('');
  const [groupName, setGroupName] = useState('');
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

  const handleStartDirectChat = async (targetUser: AppUser) => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const roomId = await getOrCreateDirectChat(
        { uid: currentUser.uid, displayName: currentUser.displayName || 'Member' },
        { uid: targetUser.uid, displayName: targetUser.displayName }
      );
      onSelectRoom(roomId);
      onClose();
    } catch (error) {
      console.error('Failed to create/fetch direct chat:', error);
    } finally {
      setLoading(false);
    }
  };

  // One form for both room kinds — an announcement is a group everyone reads
  // and only Full-timers post to, so the inputs are identical.
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !groupName.trim() || selectedUids.length === 0) return;
    const create = tab === 'announcement' ? createAnnouncementRoom : createGroupChat;
    setLoading(true);
    try {
      const roomId = await create(
        groupName.trim(),
        selectedUids,
        { uid: currentUser.uid, displayName: currentUser.displayName || 'Member' }
      );
      onSelectRoom(roomId);
      onClose();
    } catch (error) {
      console.error(`Failed to create ${tab} chat:`, error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectUser = (uid: string) => {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
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
            className="relative w-full max-w-md h-[550px] bg-surface rounded-3xl border border-outline-variant shadow-2xl overflow-hidden flex flex-col z-[101]"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-low shrink-0">
              <div>
                <h3 className="font-serif text-xl text-on-surface">Start Conversation</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Send a message or create a group</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-outline-variant shrink-0 bg-surface-container-low/55 p-1.5 gap-1">
              <button
                onClick={() => {
                  setTab('direct');
                  setSearch('');
                }}
                className={`flex-1 py-2 px-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  tab === 'direct'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                Direct Message
              </button>
              <button
                onClick={() => {
                  setTab('group');
                  setSearch('');
                }}
                className={`flex-1 py-2 px-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  tab === 'group'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                <Users className="w-4 h-4" />
                New Group
              </button>
              {canAnnounce && (
                <button
                  onClick={() => {
                    setTab('announcement');
                    setSearch('');
                  }}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    tab === 'announcement'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  <Megaphone className="w-4 h-4" />
                  Announcement
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="px-5 py-3 border-b border-outline-variant bg-surface shrink-0 flex items-center gap-3">
              <Search className="w-4 h-4 text-on-surface-variant shrink-0" />
              <input
                type="text"
                placeholder="Search users by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/70"
              />
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-container-lowest">
              {fetching ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-on-surface-variant">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="text-xs">Fetching users...</span>
                </div>
              ) : tab === 'direct' ? (
                /* DIRECT MESSAGE TAB */
                filteredUsers.length === 0 ? (
                  <div className="text-center py-12 text-on-surface-variant text-sm">
                    No approved users found.
                  </div>
                ) : (
                  filteredUsers.map((u) => (
                    <button
                      key={u.uid}
                      disabled={loading}
                      onClick={() => handleStartDirectChat(u)}
                      className="w-full p-3 rounded-2xl bg-surface border border-outline-variant/50 hover:border-primary/40 hover:bg-primary/5 flex items-center gap-3.5 transition-all text-left cursor-pointer disabled:opacity-50"
                    >
                      <div className="w-10 h-10 rounded-full bg-stage-accent-soft text-stage-accent font-semibold flex items-center justify-center shrink-0 border border-outline-variant/30">
                        {u.photoURL ? (
                          <img
                            src={u.photoURL}
                            alt={u.displayName}
                            className="w-full h-full object-cover rounded-full"
                          />
                        ) : (
                          getUserInitials(u.displayName)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-sm text-on-surface truncate">
                          {u.displayName}
                        </h4>
                        <p className="text-xs text-on-surface-variant truncate">
                          {u.email}
                        </p>
                      </div>
                    </button>
                  ))
                )
              ) : (
                /* GROUP / ANNOUNCEMENT TAB — same inputs, different room type */
                <form id="create-group-form" onSubmit={handleCreateRoom} className="space-y-4">
                  {tab === 'announcement' && (
                    <p className="text-xs text-on-surface-variant leading-relaxed px-1">
                      Everyone here reads it; only Full-timers can post. Replies come
                      back to the team directly.
                    </p>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-on-surface-variant px-1 uppercase tracking-wider">
                      {tab === 'announcement' ? 'Announcement Name' : 'Group Name'}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={
                        tab === 'announcement'
                          ? 'e.g. Weekly notes, Campus updates'
                          : 'e.g. Outreach Team, Trainee Hub'
                      }
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      className="w-full h-11 px-4 rounded-xl bg-surface border border-outline focus:border-primary outline-none transition-all text-sm text-on-surface"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-on-surface-variant px-1 uppercase tracking-wider block">
                      {tab === 'announcement' ? 'Who receives it' : 'Invite Members'} ({selectedUids.length} selected)
                    </label>
                    <div className="space-y-2 max-h-[170px] overflow-y-auto p-1">
                      {filteredUsers.length === 0 ? (
                        <div className="text-center py-6 text-on-surface-variant text-xs">
                          No users found.
                        </div>
                      ) : (
                        filteredUsers.map((u) => {
                          const isChecked = selectedUids.includes(u.uid);
                          return (
                            <div
                              key={u.uid}
                              onClick={() => toggleSelectUser(u.uid)}
                              className={`p-2.5 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
                                isChecked
                                  ? 'border-primary bg-primary/5 text-on-surface'
                                  : 'border-outline-variant/60 bg-surface text-on-surface hover:bg-surface-container-high'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}} // toggled on container click
                                className="w-4 h-4 rounded text-primary border-outline accent-primary cursor-pointer shrink-0"
                              />
                              <div className="w-8 h-8 rounded-full bg-stage-accent-soft text-stage-accent font-semibold flex items-center justify-center text-xs shrink-0">
                                {u.photoURL ? (
                                  <img
                                    src={u.photoURL}
                                    alt={u.displayName}
                                    className="w-full h-full object-cover rounded-full"
                                  />
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
                  </div>
                </form>
              )}
            </div>

            {/* Footer (only for the Group / Announcement form) */}
            {tab !== 'direct' && (
              <div className="px-6 py-4 border-t border-outline-variant shrink-0 flex gap-3 bg-surface-container-low">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-11 rounded-full font-bold text-primary hover:bg-primary/5 transition-all text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  form="create-group-form"
                  type="submit"
                  disabled={loading || !groupName.trim() || selectedUids.length === 0}
                  className="flex-[2] h-11 rounded-full bg-primary text-on-primary font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {loading ? (
                    <span className="animate-pulse">
                      {tab === 'announcement' ? 'Creating announcement...' : 'Creating group...'}
                    </span>
                  ) : tab === 'announcement' ? (
                    'Create Announcement'
                  ) : (
                    'Create Group'
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
