import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, UserPlus, LogOut, User, Loader2, Mail, ShieldAlert } from 'lucide-react';
import { collection, query, where, getDocs, getDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { AppUser, ChatRoom, Contact } from '../../types';
import { useAuth } from '../AuthProvider';
import { inviteToGroup, leaveGroup } from '../../services/chat';
import { getUserInitials } from '../../lib/utils';
import { useLayout } from '../../App';

interface ChatDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: ChatRoom;
  onLeftGroup: () => void;
}

export default function ChatDetailsModal({ isOpen, onClose, room, onLeftGroup }: ChatDetailsModalProps) {
  const { user: currentUser, role: userRole } = useAuth();
  const { setSelectedContact } = useLayout();
  const [members, setMembers] = useState<AppUser[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [showInviteSection, setShowInviteSection] = useState(false);
  const [selectedInviteUids, setSelectedInviteUids] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [recipientContact, setRecipientContact] = useState<Contact | null>(null);

  // 1. Fetch group members and non-members
  useEffect(() => {
    if (!isOpen || !currentUser) return;

    setLoadingMembers(true);
    const usersQuery = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const roomMembers: AppUser[] = [];
      const nonMembers: AppUser[] = [];
      
      snapshot.forEach((doc) => {
        const u = doc.data() as AppUser;
        const appUser = { uid: doc.id, ...u };
        
        if (room.memberIds.includes(doc.id)) {
          roomMembers.push(appUser);
        } else if (u.approved) {
          nonMembers.push(appUser);
        }
      });
      
      setMembers(roomMembers);
      setAllUsers(nonMembers);
      setLoadingMembers(false);
    }, (err) => {
      console.error('Error fetching chat members:', err);
      setLoadingMembers(false);
    });

    return unsubscribe;
  }, [isOpen, room.memberIds, currentUser]);

  // 2. For direct chats, look up if recipient has a contact profile in Directory
  useEffect(() => {
    if (!isOpen || room.type !== 'direct' || !currentUser) return;

    const fetchContactProfile = async () => {
      try {
        const otherUid = room.memberIds.find(id => id !== currentUser.uid);
        if (!otherUid) return;
        
        // Find other user email
        const userDocSnap = await getDoc(doc(db, 'users', otherUid));
        if (!userDocSnap.exists()) return;
        const otherUserEmail = userDocSnap.data().email;

        // Query contact by email
        const contactsQuery = query(
          collection(db, 'contacts'),
          where('email', '==', otherUserEmail)
        );
        const contactSnap = await getDocs(contactsQuery);
        if (!contactSnap.empty) {
          setRecipientContact({ id: contactSnap.docs[0].id, ...contactSnap.docs[0].data() } as Contact);
        } else {
          setRecipientContact(null);
        }
      } catch (err) {
        console.error('Error fetching contact profile:', err);
      }
    };

    fetchContactProfile();
  }, [isOpen, room, currentUser]);

  const handleInviteMembers = async () => {
    if (selectedInviteUids.length === 0 || !currentUser) return;
    setLoading(true);
    try {
      const invitedUsers = allUsers.filter(u => selectedInviteUids.includes(u.uid));
      const invitedNames = invitedUsers.map(u => u.displayName);
      await inviteToGroup(
        room.id,
        selectedInviteUids,
        invitedNames,
        currentUser.displayName || 'Member'
      );
      setSelectedInviteUids([]);
      setShowInviteSection(false);
    } catch (err) {
      console.error('Failed to invite members:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!currentUser) return;
    if (!confirm('Are you sure you want to leave this group?')) return;
    setLoading(true);
    try {
      await leaveGroup(room.id, { uid: currentUser.uid, displayName: currentUser.displayName || 'Member' });
      onLeftGroup();
      onClose();
    } catch (err) {
      console.error('Failed to leave group:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenContactProfile = () => {
    if (recipientContact) {
      setSelectedContact(recipientContact);
      onClose();
    }
  };

  const toggleInviteUid = (uid: string) => {
    setSelectedInviteUids(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const isUserAdmin = userRole === 'admin';
  const otherMember = members.find(m => m.uid !== currentUser?.uid);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-scrim/55 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="relative w-full max-w-md max-h-[600px] bg-surface rounded-3xl border border-outline-variant shadow-2xl overflow-hidden flex flex-col z-[101]"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-low shrink-0">
              <div>
                <h3 className="font-serif text-xl text-on-surface">
                  {room.type === 'group' ? 'Group Details' : 'Conversation Details'}
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {room.type === 'group' ? `${room.memberIds.length} members` : 'Direct chat info'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-surface-container-lowest">
              {loadingMembers ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-on-surface-variant">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="text-xs">Loading info...</span>
                </div>
              ) : room.type === 'direct' && otherMember ? (
                /* DIRECT CHAT VIEW */
                <div className="space-y-4 text-center">
                  <div className="w-20 h-20 rounded-full bg-stage-accent-soft text-stage-accent font-semibold flex items-center justify-center text-3xl mx-auto border border-outline-variant/30">
                    {otherMember.photoURL ? (
                      <img
                        src={otherMember.photoURL}
                        alt={otherMember.displayName}
                        className="w-full h-full object-cover rounded-full"
                      />
                    ) : (
                      getUserInitials(otherMember.displayName)
                    )}
                  </div>
                  <div>
                    <h4 className="font-serif text-xl text-on-surface">{otherMember.displayName}</h4>
                    <p className="text-sm text-on-surface-variant flex items-center justify-center gap-1.5 mt-1">
                      <Mail className="w-4 h-4 text-on-surface-variant/75" />
                      {otherMember.email}
                    </p>
                    <span className="inline-block text-[11px] font-bold uppercase tracking-wider bg-stage-accent-soft text-stage-accent rounded-full px-2.5 py-0.5 mt-2">
                      Role: {otherMember.role}
                    </span>
                  </div>

                  {recipientContact && (
                    <div className="pt-4 border-t border-outline-variant/60">
                      <button
                        onClick={handleOpenContactProfile}
                        className="w-full py-3 px-4 rounded-xl bg-primary text-on-primary font-bold text-sm shadow-md hover:bg-primary/95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <User className="w-4 h-4" />
                        View Directory Contact Profile
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* GROUP CHAT VIEW */
                <div className="space-y-4">
                  {/* Group Name Card */}
                  <div className="p-4 rounded-2xl bg-surface border border-outline-variant/50 flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Group Name</span>
                    <span className="font-serif text-lg text-on-surface">{room.name}</span>
                    <span className="text-[11px] text-on-surface-variant">Created by {room.createdByName}</span>
                  </div>

                  {/* Members Section */}
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold text-on-surface-variant px-1 uppercase tracking-wider">
                      Members List ({members.length})
                    </h4>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto p-0.5">
                      {members.map(m => (
                        <div key={m.uid} className="flex items-center gap-3 p-2 rounded-xl bg-surface border border-outline-variant/30">
                          <div className="w-8 h-8 rounded-full bg-stage-accent-soft text-stage-accent font-semibold flex items-center justify-center text-xs shrink-0">
                            {m.photoURL ? (
                              <img
                                src={m.photoURL}
                                alt={m.displayName}
                                className="w-full h-full object-cover rounded-full"
                              />
                            ) : (
                              getUserInitials(m.displayName)
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h5 className="font-semibold text-xs text-on-surface truncate">{m.displayName}</h5>
                            <p className="text-[10px] text-on-surface-variant truncate">{m.email}</p>
                          </div>
                          <span className="text-[9px] font-bold uppercase bg-surface-container-high text-on-surface-variant rounded px-1.5 py-0.5 shrink-0">
                            {m.role}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Invite New Members Toggle */}
                  <div className="border-t border-outline-variant/60 pt-4 space-y-3">
                    {!showInviteSection ? (
                      <button
                        onClick={() => setShowInviteSection(true)}
                        className="w-full py-2.5 rounded-xl border border-outline-variant bg-surface hover:bg-surface-container-high font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors text-on-surface"
                      >
                        <UserPlus className="w-4 h-4 text-primary" />
                        Invite new members
                      </button>
                    ) : (
                      <div className="space-y-3 p-3 rounded-2xl bg-surface-container-low border border-outline-variant/50">
                        <div className="flex justify-between items-center px-1">
                          <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                            Select Members to Add ({selectedInviteUids.length})
                          </span>
                          <button
                            onClick={() => {
                              setShowInviteSection(false);
                              setSelectedInviteUids([]);
                            }}
                            className="text-xs text-primary font-bold hover:underline"
                          >
                            Cancel
                          </button>
                        </div>

                        <div className="space-y-2 max-h-[140px] overflow-y-auto p-0.5">
                          {allUsers.length === 0 ? (
                            <div className="text-center py-4 text-on-surface-variant text-xs">
                              All approved users are already in this group.
                            </div>
                          ) : (
                            allUsers.map((u) => {
                              const isChecked = selectedInviteUids.includes(u.uid);
                              return (
                                <div
                                  key={u.uid}
                                  onClick={() => toggleInviteUid(u.uid)}
                                  className={`p-2 rounded-lg border flex items-center gap-3.5 cursor-pointer text-left transition-all ${
                                    isChecked
                                      ? 'border-primary bg-primary/5'
                                      : 'border-outline-variant/40 bg-surface hover:bg-surface-container-high'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {}} // toggled on container click
                                    className="w-3.5 h-3.5 rounded text-primary border-outline accent-primary cursor-pointer shrink-0"
                                  />
                                  <div className="w-6 h-6 rounded-full bg-stage-accent-soft text-stage-accent font-semibold flex items-center justify-center text-[10px] shrink-0">
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
                                    <h5 className="font-semibold text-[11px] text-on-surface truncate">
                                      {u.displayName}
                                    </h5>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>

                        {allUsers.length > 0 && (
                          <button
                            onClick={handleInviteMembers}
                            disabled={loading || selectedInviteUids.length === 0}
                            className="w-full py-2 rounded-xl bg-primary text-on-primary font-bold text-xs shadow-md hover:bg-primary/95 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {loading ? 'Adding...' : `Add Selected`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {room.type === 'group' && (
              <div className="px-6 py-4 border-t border-outline-variant shrink-0 flex gap-3 bg-surface-container-low">
                <button
                  onClick={handleLeaveGroup}
                  disabled={loading}
                  className="w-full h-11 rounded-full border border-error/45 text-error hover:bg-error/5 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                  Leave Group
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
