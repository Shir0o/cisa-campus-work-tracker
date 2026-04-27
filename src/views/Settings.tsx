import React, { useEffect, useState } from 'react';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AppUser } from '../types';
import { useAuth } from '../components/AuthProvider';
import { 
  Users, 
  Shield, 
  UserCog, 
  CheckCircle2, 
  XCircle,
  MoreVertical,
  Search,
  Filter
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function Settings() {
  const { user: currentUser, isAdmin } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;

    const q = query(collection(db, 'users'), orderBy('email', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
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

    return () => unsubscribe();
  }, [isAdmin]);

  const toggleApproval = async (uid: string, currentStatus: boolean) => {
    setUpdatingId(uid);
    try {
      await updateDoc(doc(db, 'users', uid), {
        approved: !currentStatus
      });
    } catch (error) {
      console.error("Error updating approval:", error);
    } finally {
      setUpdatingId(null);
    }
  };

  const changeRole = async (uid: string, newRole: 'admin' | 'community_manager') => {
    setUpdatingId(uid);
    try {
      await updateDoc(doc(db, 'users', uid), {
        role: newRole
      });
    } catch (error) {
      console.error("Error updating role:", error);
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         user.displayName?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'all' ? true : 
                         filter === 'pending' ? !user.approved : user.approved;
    return matchesSearch && matchesFilter;
  });

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 text-error mx-auto mb-4 opacity-20" />
        <h2 className="text-2xl font-bold text-on-surface">Access Denied</h2>
        <p className="text-on-surface-variant">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto pb-24 lg:pb-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-on-surface mb-2">User Management</h1>
        <p className="text-on-surface-variant">Manage application users, approve access, and assign roles.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
          <input 
            type="text"
            placeholder="Search users by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-surface-container rounded-2xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
          />
        </div>
        <div className="flex gap-2 p-1 bg-surface-container rounded-2xl border border-outline-variant">
          {(['all', 'pending', 'approved'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex-1 py-2 px-3 rounded-xl text-sm font-medium capitalize transition-all",
                filter === f 
                  ? "bg-secondary text-on-secondary shadow-sm" 
                  : "text-on-surface-variant hover:bg-surface-variant"
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="bg-surface-container rounded-2xl border border-outline-variant px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-medium text-on-surface-variant">Total Users</span>
          <span className="text-xl font-bold text-primary">{users.length}</span>
        </div>
      </div>

      <div className="bg-surface-container rounded-[2rem] border border-outline-variant overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-high/50">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-on-surface-variant">User</th>
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
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-on-surface-variant">
                      No users found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
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
                          <div className="w-10 h-10 rounded-full overflow-hidden border border-outline-variant relative">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt={u.displayName} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-secondary-container flex items-center justify-center text-secondary font-bold">
                                {u.displayName?.[0] || u.email[0].toUpperCase()}
                              </div>
                            )}
                            {u.uid === currentUser?.uid && (
                              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
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
                          value={u.role || 'community_manager'} 
                          onChange={(e) => changeRole(u.uid, e.target.value as any)}
                          disabled={updatingId === u.uid || u.uid === currentUser?.uid}
                          className="text-xs font-bold px-3 py-1.5 rounded-full bg-surface-variant/50 border border-outline-variant focus:ring-1 focus:ring-primary outline-none disabled:opacity-50 cursor-pointer"
                        >
                          <option value="community_manager">Community Manager</option>
                          <option value="admin">Administrator</option>
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
                          disabled={updatingId === u.uid || u.uid === currentUser?.uid}
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
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
      
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
