import React, { useEffect, useState } from 'react';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  onSnapshot,
  query,
  orderBy,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { AppUser, Invitation } from '../types';
import { useAuth } from '../components/AuthProvider';
import { 
  Users, 
  Shield, 
  UserCog, 
  CheckCircle2, 
  XCircle,
  MoreVertical,
  Search,
  Filter,
  UserPlus,
  Mail,
  Trash2,
  Loader2,
  Info,
  Moon,
  Sun,
  Monitor
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Skeleton } from '../components/ui/Skeleton';
import { useTheme } from '../components/ThemeProvider';

export default function Settings() {
  const { user: currentUser, isAdmin, isManager } = useAuth();
  const { theme, setTheme } = useTheme();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showRoleInfo, setShowRoleInfo] = useState(false);
  
  // Member Form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'manager' | 'operator' | 'viewer'>('operator');
  const [isInviting, setIsInviting] = useState(false);

  const roleDefinitions = [
    { name: 'Admin', desc: 'Full control over settings, users, and data management.' },
    { name: 'Manager', desc: 'Can manage users and access all directory features.' },
    { name: 'Operator', desc: 'Can add and edit directory/attendance records.' },
    { name: 'Viewer', desc: 'Read-only access to view data and dashboards.' }
  ];

  useEffect(() => {
    if (!isManager) return;

    // Listen to users
    const usersQ = query(collection(db, 'users'), orderBy('email', 'asc'));
    const unsubscribeUsers = onSnapshot(usersQ, (snapshot) => {
      const userData = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as AppUser[];
      setUsers(userData);
      setTimeout(() => setLoading(false), 800);
    }, (error) => {
      console.error("Error fetching users:", error);
      setTimeout(() => setLoading(false), 800);
    });

    // Listen to invitations
    const invitesQ = query(collection(db, 'invitations'), orderBy('createdAt', 'desc'));
    const unsubscribeInvites = onSnapshot(invitesQ, (snapshot) => {
      const inviteData = snapshot.docs.map(doc => doc.data() as Invitation);
      setInvitations(inviteData);
    }, (error) => {
      console.error("Error fetching invitations:", error);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeInvites();
    };
  }, [isManager]);

  const sendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || isInviting || !currentUser) return;

    setIsInviting(true);
    try {
      const emailLower = inviteEmail.trim().toLowerCase();
      
      // Check if user already exists
      if (users.some(u => u.email.toLowerCase() === emailLower)) {
        alert('A user with this email already exists.');
        return;
      }

      const invitationPath = `invitations/${emailLower}`;
      try {
        await setDoc(doc(db, 'invitations', emailLower), {
          email: emailLower,
          role: inviteRole,
          approved: true, // Auto-approve invited members
          invitedBy: currentUser.uid,
          createdAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, invitationPath);
      }
      
      setInviteEmail('');
      setInviteRole('operator');
    } catch (error) {
      console.error("Error adding member:", error);
      alert('Failed to add member. Please try again.');
    } finally {
      setIsInviting(false);
    }
  };

  const revokeInvitation = async (email: string) => {
    if (!confirm('Are you sure you want to revoke this invitation?')) return;
    
    try {
      await deleteDoc(doc(db, 'invitations', email.toLowerCase()));
    } catch (error) {
      console.error("Error revoking invitation:", error);
    }
  };

  const toggleApproval = async (uid: string, currentStatus: boolean) => {
    setUpdatingId(uid);
    const userPath = `users/${uid}`;
    try {
      await updateDoc(doc(db, 'users', uid), {
        approved: !currentStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userPath);
    } finally {
      setUpdatingId(null);
    }
  };

  const changeRole = async (uid: string, newRole: 'admin' | 'manager' | 'operator' | 'viewer') => {
    setUpdatingId(uid);
    const userPath = `users/${uid}`;
    try {
      await updateDoc(doc(db, 'users', uid), {
        role: newRole,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userPath);
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         user.displayName?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const filteredInvites = invitations.filter(invite => {
    // Hide if user already exists
    if (users.some(u => u.email.toLowerCase() === invite.email.toLowerCase())) return false;
    const matchesSearch = invite.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const ThemeSection = () => (
    <div className="mt-8">
      <h2 className="text-xl font-bold text-on-surface mb-4">App Preferences</h2>
      <div className="bg-surface-container rounded-[2rem] border border-outline-variant/50 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="font-bold text-on-surface">Appearance</h3>
            <p className="text-sm text-on-surface-variant">Customize how the application looks on your device.</p>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-4">
          {(['light', 'dark', 'system'] as const).map((t) => {
            const Icon = t === 'light' ? Sun : t === 'dark' ? Moon : Monitor;
            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  "flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all",
                  theme === t 
                    ? "bg-primary/10 border-primary text-primary shadow-sm" 
                    : "bg-surface-container-high border-transparent text-on-surface-variant hover:bg-surface-variant"
                )}
              >
                <Icon className={cn("w-6 h-6", theme === t ? "text-primary" : "text-on-surface-variant")} />
                <span className="text-xs font-bold capitalize">{t}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (!isManager) {
    // ... (rest of the non-admin view remains same)
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto pb-24 lg:pb-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-on-surface mb-2">My Profile</h1>
          <p className="text-on-surface-variant">Manage your account information and preferences.</p>
        </div>
        
        <div className="bg-surface-container rounded-[2rem] border border-outline-variant/50 p-8 flex flex-col md:flex-row items-center gap-8 shadow-sm">
          <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-primary/10 shadow-inner shrink-0 bg-secondary-container flex items-center justify-center">
             {currentUser?.photoURL ? (
               <img 
                 src={currentUser.photoURL} 
                 alt={currentUser.displayName || ''} 
                 className="w-full h-full object-cover" 
                 referrerPolicy="no-referrer"
               />
             ) : (
               <span className="text-4xl font-black text-secondary">{currentUser?.displayName?.[0] || currentUser?.email?.[0]?.toUpperCase()}</span>
             )}
          </div>
          <div className="text-center md:text-left flex-1">
            <h2 className="text-2xl font-black text-on-surface mb-1">{currentUser?.displayName || 'Campus User'}</h2>
            <p className="text-on-surface-variant mb-6">{currentUser?.email}</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm font-medium">
              <div className="p-4 bg-surface-container-high rounded-2xl flex flex-col gap-1">
                <span className="text-xs text-on-surface-variant uppercase tracking-wider">Account Status</span>
                <span className="text-success-container text-success font-bold px-2 py-0.5 bg-success/10 rounded-full w-fit">Approved</span>
              </div>
              <div className="p-4 bg-surface-container-high rounded-2xl flex flex-col gap-1">
                <span className="text-xs text-on-surface-variant uppercase tracking-wider">Assigned Role</span>
                <span className="text-primary font-bold capitalize">{users.find(u => u.uid === currentUser?.uid)?.role?.replace('_', ' ') || 'Member'}</span>
              </div>
            </div>
          </div>
        </div>

        <ThemeSection />

        <div className="mt-12 text-center py-6 px-4 bg-surface-variant/5 rounded-[2rem] border border-dashed border-outline-variant/30">
          <p className="text-xs text-on-surface-variant italic">More account settings will be available in future updates.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-24 lg:pb-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-on-surface mb-2">User Management</h1>
          <p className="text-on-surface-variant">Manage application users, approve access, and assign roles.</p>
        </div>
        <button 
          onClick={() => setShowInviteDialog(true)}
          className="md:static fixed bottom-24 right-6 z-40 bg-primary text-on-primary md:px-6 md:py-3 p-4 rounded-full md:rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 md:shadow-lg md:shadow-primary/20"
        >
          <UserPlus className="w-6 h-6 md:w-5 md:h-5" />
          <span className="hidden md:inline">Add Member</span>
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
          <input 
            type="text"
            placeholder="Search users or invites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-surface-container rounded-2xl border border-outline-variant/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
          />
        </div>
      </div>

      <div className="bg-surface-container rounded-[1.5rem] sm:rounded-[2.5rem] border border-outline-variant/40 overflow-hidden shadow-sm">
        {/* Desktop Table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/20 bg-surface-container-high/50">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Identity</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Role</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Status</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-on-surface-variant text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              <AnimatePresence initial={false}>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <motion.tr 
                      key={`skeleton-${i}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="w-10 h-10 rounded-full" />
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-48" />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><Skeleton className="h-8 w-24 rounded-full" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-8 w-20 rounded-full" /></td>
                      <td className="px-6 py-4 text-right"><Skeleton className="ml-auto h-8 w-24 rounded-xl" /></td>
                    </motion.tr>
                  ))
                ) : (
                  [
                    ...filteredInvites.map((invite) => (
                      <motion.tr 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        key={`invite-${invite.email}`} 
                        className="bg-primary/5 hover:bg-primary/10 transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-primary font-bold shadow-sm">
                              <Mail className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-bold text-on-surface leading-tight italic">Pending Activation</p>
                              <p className="text-xs text-on-surface-variant">{invite.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-surface-variant/50 border border-outline-variant/50 text-on-surface-variant">
                            {invite.role.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                            Invited
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => revokeInvitation(invite.email)}
                            className="p-2 text-error hover:bg-error-container/30 rounded-lg transition-all"
                            title="Revoke Invitation"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </motion.tr>
                    )),
                    ...filteredUsers.map((u) => (
                      <motion.tr 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        key={u.uid} 
                        className="hover:bg-surface-container-high/50 transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full overflow-hidden border border-outline-variant/50 relative shadow-sm">
                              {u.photoURL ? (
                                <img src={u.photoURL} alt={u.displayName} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-secondary-container flex items-center justify-center text-secondary font-bold">
                                  {u.displayName?.[0] || u.email[0].toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-on-surface leading-tight">
                                {u.displayName || 'Unnamed User'}
                                {u.uid === currentUser?.uid && (
                                  <span className="ml-2 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md uppercase tracking-wider">You</span>
                                )}
                              </p>
                              <p className="text-xs text-on-surface-variant">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <select 
                            value={u.role || 'viewer'} 
                            onChange={(e) => changeRole(u.uid, e.target.value as any)}
                            disabled={updatingId === u.uid || u.uid === currentUser?.uid || !isAdmin}
                            className="text-xs font-bold px-3 py-1.5 rounded-full bg-surface-variant/50 border border-outline-variant focus:ring-1 focus:ring-primary outline-none disabled:opacity-50 cursor-pointer hover:bg-surface-variant"
                          >
                            <option value="viewer">Viewer</option>
                            <option value="operator">Operator</option>
                            <option value="manager">Manager</option>
                            {isAdmin && <option value="admin">Administrator</option>}
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <div className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold",
                            u.approved 
                              ? "bg-success-container/30 text-success border border-success/20" 
                              : "bg-warning-container/30 text-warning border border-warning/20"
                          )}>
                            {u.approved ? (
                              <><CheckCircle2 className="w-3.5 h-3.5" /> Approved</>
                            ) : (
                              <><XCircle className="w-3.5 h-3.5" /> Pending</>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => toggleApproval(u.uid, u.approved)}
                            disabled={updatingId === u.uid || u.uid === currentUser?.uid || !isManager}
                            className={cn(
                              "px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50",
                              u.approved 
                                ? "text-error hover:bg-error-container/30" 
                                : "text-primary hover:bg-primary-container/30"
                            )}
                          >
                            {u.approved ? 'Revoke Access' : 'Approve User'}
                          </button>
                        </td>
                      </motion.tr>
                    ))
                  ]
                )}
              </AnimatePresence>
              
              {(!loading && filteredUsers.length === 0 && filteredInvites.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-on-surface-variant">
                    No team members or invitations found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile App Cards */}
        <div className="sm:hidden flex flex-col gap-4 p-4 bg-surface-container">
          <AnimatePresence initial={false}>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <motion.div key={`m-skeleton-${i}`} className="bg-surface-container-high border border-outline-variant/40 rounded-2xl p-4 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <Skeleton className="h-8 w-1/2 rounded-full" />
                    <Skeleton className="h-8 w-1/3 rounded-full" />
                  </div>
                  <Skeleton className="h-10 w-full rounded-xl" />
                </motion.div>
              ))
            ) : (
              [
                ...filteredInvites.map((invite) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={`m-invite-${invite.email}`}
                    className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex flex-col gap-4 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-primary font-bold shadow-sm shrink-0">
                        <Mail className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-on-surface leading-tight italic truncate">Pending Activation</p>
                        <p className="text-xs text-on-surface-variant truncate">{invite.email}</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center bg-surface-container px-3 py-2 rounded-xl">
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-surface-variant/50 border border-outline-variant/50 text-on-surface-variant">
                        {invite.role.replace('_', ' ')}
                      </span>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                        Invited
                      </div>
                    </div>
                    <button
                      onClick={() => revokeInvitation(invite.email)}
                      className="w-full py-3 bg-error-container/30 text-error rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
                    >
                      <Trash2 className="w-4 h-4" /> Revoke Invitation
                    </button>
                  </motion.div>
                )),
                ...filteredUsers.map((u) => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={`m-${u.uid}`}
                    className="bg-surface-container-high border border-outline-variant/40 rounded-2xl p-4 flex flex-col gap-4 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden border border-outline-variant/50 relative shadow-sm shrink-0">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt={u.displayName} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-secondary-container flex items-center justify-center text-secondary font-bold">
                            {u.displayName?.[0] || u.email[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-on-surface leading-tight truncate">
                          {u.displayName || 'Unnamed User'}
                          {u.uid === currentUser?.uid && (
                            <span className="ml-2 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md uppercase tracking-wider">You</span>
                          )}
                        </p>
                        <p className="text-xs text-on-surface-variant truncate">{u.email}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between gap-4 bg-surface-container px-3 py-2 rounded-xl">
                      <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Role</label>
                        <select 
                          value={u.role || 'viewer'} 
                          onChange={(e) => changeRole(u.uid, e.target.value as any)}
                          disabled={updatingId === u.uid || u.uid === currentUser?.uid || !isAdmin}
                          className="w-full text-xs font-bold px-2 py-1.5 rounded-lg bg-surface-variant/50 border border-outline-variant focus:ring-1 focus:ring-primary outline-none disabled:opacity-50 cursor-pointer"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="operator">Operator</option>
                          <option value="manager">Manager</option>
                          {isAdmin && <option value="admin">Administrator</option>}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Status</label>
                        <div className={cn(
                          "inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold",
                          u.approved 
                            ? "bg-success-container/30 text-success border border-success/20" 
                            : "bg-warning-container/30 text-warning border border-warning/20"
                        )}>
                          {u.approved ? (
                            <><CheckCircle2 className="w-3.5 h-3.5" /> Approved</>
                          ) : (
                            <><XCircle className="w-3.5 h-3.5" /> Pending</>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleApproval(u.uid, u.approved)}
                      disabled={updatingId === u.uid || u.uid === currentUser?.uid || !isManager}
                      className={cn(
                        "w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 active:scale-95",
                        u.approved 
                          ? "bg-error-container/20 text-error hover:bg-error-container/40" 
                          : "bg-primary text-on-primary shadow-lg shadow-primary/20 hover:opacity-90"
                      )}
                    >
                      {u.approved ? 'Revoke Access' : 'Approve User'}
                    </button>
                  </motion.div>
                ))
              ]
            )}
          </AnimatePresence>

          {(!loading && filteredUsers.length === 0 && filteredInvites.length === 0) && (
            <div className="p-8 text-center text-on-surface-variant border border-dashed border-outline-variant/30 rounded-2xl">
              No team members or invitations found matching your search.
            </div>
          )}
        </div>
      </div>

      {/* Invitation Dialog */}
      <AnimatePresence>
        {showInviteDialog && (
          <div key="invite-dialog-container" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInviteDialog(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-surface-container rounded-[2.5rem] border border-outline-variant/50 p-8 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 rounded-2xl text-primary">
                    <UserPlus className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-on-surface">Add New Member</h2>
                    <p className="text-sm text-on-surface-variant">Pre-authorize a new person for access</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowInviteDialog(false)}
                  className="p-2 hover:bg-surface-variant rounded-full transition-colors"
                >
                  <XCircle className="w-6 h-6 text-on-surface-variant" />
                </button>
              </div>
              
              <form onSubmit={async (e) => {
                await sendInvitation(e);
                if (!isInviting) setShowInviteDialog(false);
              }} className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
                    <input 
                      type="email"
                      required
                      placeholder="member@campus.edu"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-surface-container-high rounded-2xl border border-outline-variant focus:border-primary outline-none transition-all text-sm font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 relative">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest ml-1">Assigned Role</label>
                    <div className="relative">
                      <button 
                        type="button"
                        onMouseEnter={() => setShowRoleInfo(true)}
                        onMouseLeave={() => setShowRoleInfo(false)}
                        onClick={() => setShowRoleInfo(!showRoleInfo)}
                        className="p-1 text-on-surface-variant hover:text-primary transition-colors"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                      
                      <AnimatePresence>
                        {showRoleInfo && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute bottom-full right-0 mb-2 w-64 bg-surface-container-high border border-outline-variant rounded-2xl p-4 shadow-xl z-[110]"
                          >
                            <div className="space-y-3">
                              {roleDefinitions.map(role => (
                                <div key={role.name}>
                                  <h4 className="text-[10px] font-black text-primary uppercase">{role.name}</h4>
                                  <p className="text-[10px] text-on-surface-variant leading-tight">{role.desc}</p>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  <select 
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full px-4 py-4 bg-surface-container-high rounded-2xl border border-outline-variant focus:border-primary outline-none transition-all text-sm font-bold appearance-none cursor-pointer"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="operator">Operator</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowInviteDialog(false)}
                    className="flex-1 py-4 bg-surface-variant text-on-surface-variant rounded-2xl font-bold hover:bg-opacity-80 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isInviting || !inviteEmail}
                    className="flex-[2] py-4 bg-primary text-on-primary rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
                  >
                    {isInviting ? <span className="animate-pulse">Adding...</span> : <><UserPlus className="w-5 h-5" /> Confirm & Add</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <ThemeSection />

      <div className="mt-8 p-6 bg-secondary-container/20 rounded-[2rem] border border-secondary/10 flex items-start gap-4">
        <div className="p-2 bg-secondary/10 rounded-xl text-secondary">
          <Shield className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-on-secondary-container">Admin Security Notice</h3>
          <p className="text-sm text-on-secondary-container/80 mt-1">
            As an administrator, you have the power to approve/revoke access and change user roles. 
            Revoking access will immediately prevent the user from accessing the dashboard. 
            You cannot revoke your own access or change your own role.
          </p>
        </div>
      </div>
    </div>
  );
}
