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
import { db } from '../lib/firebase';
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
  Info
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function Settings() {
  const { user: currentUser, isAdmin, isManager } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'invited'>('all');
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
      setLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      setLoading(false);
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
        handleFirestoreError(error, 'CREATE', invitationPath);
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
      handleFirestoreError(error, 'UPDATE', userPath);
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
      handleFirestoreError(error, 'UPDATE', userPath);
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         user.displayName?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'all' ? true : 
                         filter === 'pending' ? !user.approved : 
                         filter === 'approved' ? user.approved : false;
    return matchesSearch && matchesFilter;
  });

  const filteredInvites = invitations.filter(invite => {
    if (filter !== 'all' && filter !== 'invited') return false;
    const matchesSearch = invite.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const handleFirestoreError = (error: unknown, operationType: string, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: currentUser?.uid,
        email: currentUser?.email,
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  };

  if (!isManager) {
    // ... (rest of the non-admin view remains same)
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto pb-24 lg:pb-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-on-surface mb-2">My Profile</h1>
          <p className="text-on-surface-variant">Manage your account information and preferences.</p>
        </div>
        
        <div className="bg-surface-container rounded-[2rem] border border-outline-variant p-8 flex flex-col md:flex-row items-center gap-8 shadow-sm">
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
                <span className="text-success font-bold">Approved</span>
              </div>
              <div className="p-4 bg-surface-container-high rounded-2xl flex flex-col gap-1">
                <span className="text-xs text-on-surface-variant uppercase tracking-wider">Assigned Role</span>
                <span className="text-primary font-bold capitalize">{users.find(u => u.uid === currentUser?.uid)?.role?.replace('_', ' ') || 'Member'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center py-12 px-4 bg-surface-variant/20 rounded-[2rem] border border-dashed border-outline-variant">
          <p className="text-on-surface-variant italic">Additional profile settings and application preferences will appear here in a future update.</p>
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
            className="w-full pl-12 pr-4 py-3 bg-surface-container rounded-2xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
          />
        </div>
        <div className="flex gap-1 p-1 bg-surface-container rounded-2xl border border-outline-variant overflow-x-auto no-scrollbar min-w-fit">
          {(['all', 'pending', 'approved', 'invited'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "whitespace-nowrap py-2 px-6 rounded-xl text-xs font-bold capitalize transition-all",
                filter === f 
                  ? "bg-secondary text-on-secondary shadow-sm" 
                  : "text-on-surface-variant hover:bg-surface-variant"
              )}
            >
              {f === 'invited' ? 'Invitations' : f}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface-container rounded-[2.5rem] border border-outline-variant overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-high/50">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Identity</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Role</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Status</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-on-surface-variant text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              <AnimatePresence mode="popLayout">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`skeleton-${i}`} className="animate-pulse">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-surface-variant"></div>
                          <div className="space-y-2">
                            <div className="h-4 w-32 bg-surface-variant rounded"></div>
                            <div className="h-3 w-48 bg-surface-variant rounded"></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><div className="h-6 w-20 bg-surface-variant rounded-full"></div></td>
                      <td className="px-6 py-4"><div className="h-6 w-16 bg-surface-variant rounded-full"></div></td>
                      <td className="px-6 py-4"></td>
                    </tr>
                  ))
                ) : (
                  [
                    ...filteredInvites.map((invite) => (
                      <motion.tr 
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
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
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        key={u.uid} 
                        className="hover:bg-surface-container-high/50 transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full overflow-hidden border border-outline-variant relative shadow-sm">
                              {u.photoURL ? (
                                <img src={u.photoURL} alt={u.displayName} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-secondary-container flex items-center justify-center text-secondary font-bold">
                                  {u.displayName?.[0] || u.email[0].toUpperCase()}
                                </div>
                              )}
                              {u.uid === currentUser?.uid && (
                                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse shadow-sm shadow-primary"></div>
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-on-surface leading-tight">{u.displayName || 'Unnamed User'}</p>
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
              className="relative w-full max-w-md bg-surface-container rounded-[2.5rem] border border-outline-variant p-8 shadow-2xl overflow-hidden"
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
                    {isInviting ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                    Confirm & Add
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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
