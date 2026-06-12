import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import { Feedback } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bug, 
  Sparkles, 
  Trash2, 
  CheckCircle, 
  Clock, 
  Search, 
  Filter, 
  ShieldAlert,
  Archive,
  RefreshCw
} from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';

export default function FeedbackList() {
  const { isAdmin, user } = useAuth();
  const isMe = user?.email?.toLowerCase() === 'yilongwang05@gmail.com';
  const hasAccess = isAdmin || isMe;
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'bug' | 'enhancement'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'in_progress' | 'resolved'>('all');

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'feedback'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: Feedback[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const createdAt = data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : new Date().toISOString();
        items.push({
          id: docSnap.id,
          ...data,
          createdAt,
        } as Feedback);
      });
      setFeedback(items);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'feedback');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const handleUpdateStatus = async (id: string, newStatus: 'new' | 'in_progress' | 'resolved') => {
    try {
      const docRef = doc(db, 'feedback', id);
      await updateDoc(docRef, { status: newStatus });
    } catch (error) {
      console.error('Failed to update feedback status:', error);
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this feedback item? This action is permanent.')) return;
    try {
      const docRef = doc(db, 'feedback', id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Failed to delete feedback item:', error);
    }
  };

  // Guard: Admin Check
  if (!hasAccess) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center" id="feedback-admin-guard">
        <div className="bg-error-container/10 border border-error-container/30 rounded-3xl p-12 max-w-xl mx-auto my-12 flex flex-col items-center">
          <div className="w-16 h-16 bg-error-container text-error rounded-full flex items-center justify-center mb-6">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold mb-4 text-on-background">Access Denied</h2>
          <p className="text-on-surface-variant leading-relaxed mb-6">
            You must be an Administrator to view and manage user feedback submissions. 
            If you believe this is an error, please get in touch with an administrator.
          </p>
        </div>
      </div>
    );
  }

  // Filter & Search Logic
  const filteredFeedback = feedback.filter((item) => {
    const matchesSearch = 
      item.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.userEmail?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = activeTab === 'all' || item.type === activeTab;
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  const getStatusBadge = (status: Feedback['status']) => {
    switch (status) {
      case 'resolved':
        return (
          <span className="flex items-center gap-1.5 py-1 px-3 bg-green-500/10 text-green-700 dark:text-green-400 font-bold text-xs rounded-full">
            <CheckCircle className="w-3.5 h-3.5" />
            Resolved
          </span>
        );
      case 'in_progress':
        return (
          <span className="flex items-center gap-1.5 py-1 px-3 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold text-xs rounded-full">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} />
            In Progress
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 py-1 px-3 bg-blue-500/10 text-blue-700 dark:text-blue-400 font-bold text-xs rounded-full">
            <Clock className="w-3.5 h-3.5" />
            New
          </span>
        );
    }
  };

  const getFormattedDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return dateStr;
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-8" id="feedback-admin-panel">
      {/* Header and overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-regular tracking-tight text-on-background">User Feedback</h1>
          <p className="text-sm text-on-surface-variant">Review bug reports and feature requests submitted by CISA Campus Work Tracker users.</p>
        </div>
        
        {/* Metric counts */}
        <div className="flex gap-3">
          <div className="bg-surface-container border border-outline-variant rounded-2xl py-2 px-4 shadow-xs text-center min-w-[90px]">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Total</p>
            <p className="text-xl font-bold text-on-surface">{feedback.length}</p>
          </div>
          <div className="bg-error-container/15 border border-error-container/20 rounded-2xl py-2 px-4 shadow-xs text-center min-w-[90px]">
            <p className="text-[10px] font-bold text-error uppercase tracking-wider">Bugs</p>
            <p className="text-xl font-bold text-error">{feedback.filter(f => f.type === 'bug').length}</p>
          </div>
          <div className="bg-primary-container/15 border border-primary-container/20 rounded-2xl py-2 px-4 shadow-xs text-center min-w-[90px]">
            <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Requests</p>
            <p className="text-xl font-bold text-primary">{feedback.filter(f => f.type === 'enhancement').length}</p>
          </div>
        </div>
      </div>

      {/* Control panel containing tabs, search, and filters */}
      <div className="bg-surface-container border border-outline-variant p-4 sm:p-5 rounded-3xl space-y-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
          
          {/* Segmented active tab buttons */}
          <div className="flex flex-wrap gap-1.5 bg-surface p-1 rounded-2xl border border-outline-variant self-start">
            <button
              onClick={() => setActiveTab('all')}
              className={`py-1.5 px-4 rounded-xl font-bold text-xs transition-all border-none ${
                activeTab === 'all'
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              All Items
            </button>
            <button
              onClick={() => setActiveTab('bug')}
              className={`flex items-center gap-1.5 py-1.5 px-4 rounded-xl font-bold text-xs transition-all border-none ${
                activeTab === 'bug'
                  ? 'bg-error-container text-on-error-container'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <Bug className="w-3.5 h-3.5" />
              Bugs Only ({feedback.filter(f => f.type === 'bug').length})
            </button>
            <button
              onClick={() => setActiveTab('enhancement')}
              className={`flex items-center gap-1.5 py-1.5 px-4 rounded-xl font-bold text-xs transition-all border-none ${
                activeTab === 'enhancement'
                  ? 'bg-primary-container text-on-primary-container'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Enhancements ({feedback.filter(f => f.type === 'enhancement').length})
            </button>
          </div>

          {/* Search bar & Status Select filter */}
          <div className="flex flex-col sm:flex-row gap-3 flex-1 lg:max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search feedback, user..."
                className="w-full bg-surface border border-outline-variant rounded-full pl-10 pr-4 py-2 text-xs focus:ring-2 focus:ring-primary focus:outline-none transition-all placeholder:text-on-surface-variant/50 text-on-surface h-10"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-on-surface-variant shrink-0" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-surface border border-outline-variant text-on-surface rounded-full py-2 px-4 text-xs focus:ring-2 focus:ring-primary focus:outline-none h-10"
              >
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Feedback List */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-44 w-full rounded-3xl" />
          <Skeleton className="h-44 w-full rounded-3xl" />
          <Skeleton className="h-44 w-full rounded-3xl" />
        </div>
      ) : filteredFeedback.length === 0 ? (
        <div className="bg-surface-container border border-outline-variant border-dashed rounded-3xl p-16 text-center">
          <Archive className="w-12 h-12 text-on-surface-variant/40 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-on-surface mb-1">No feedback found</h3>
          <p className="text-xs text-on-surface-variant">There are no feedback submissions that match your query.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredFeedback.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                layout
                className={`bg-surface-container border border-outline-variant p-5 sm:p-6 rounded-3xl shadow-sm transition-all flex flex-col gap-5 relative overflow-hidden ${
                  item.status === 'resolved' ? 'opacity-70 group' : ''
                }`}
              >
                {/* Visual marker bar */}
                <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                  item.type === 'bug' ? 'bg-error' : 'bg-primary'
                }`} />

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pl-2">
                  {/* Submitter User Details */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-on-surface text-base">{item.userName}</span>
                      <span className="text-xs text-on-surface-variant/80 font-mono">({item.userEmail})</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
                      <span className="flex items-center gap-1.5">
                        {item.type === 'bug' ? (
                          <span className="flex items-center gap-1 text-error text-xs font-bold bg-error-container/20 py-0.5 px-2 rounded-md">
                            <Bug className="w-3 h-3" />
                            Bug
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-primary text-xs font-bold bg-primary-container/20 py-0.5 px-2 rounded-md">
                            <Sparkles className="w-3 h-3" />
                            Enhancement
                          </span>
                        )}
                      </span>
                      <span>•</span>
                      <span>{getFormattedDate(item.createdAt)}</span>
                    </div>
                  </div>

                  {/* Actions & Status Dropdown on Top Right */}
                  <div className="flex items-center gap-2.5 self-start sm:self-center">
                    {getStatusBadge(item.status)}
                    
                    {/* Select update actions */}
                    <div className="relative">
                      <select
                        aria-label="Update status"
                        value={item.status}
                        onChange={(e) => handleUpdateStatus(item.id, e.target.value as any)}
                        className="bg-surface border border-outline-variant text-on-surface rounded-lg py-1 px-2.5 text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-primary h-8"
                      >
                        <option value="new">Mark New</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>

                    <button
                      onClick={() => handleDeleteFeedback(item.id)}
                      className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container/10 rounded-full transition-colors border-none"
                      title="Delete Feedback"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Feedback Message Content */}
                <div className="bg-surface/50 border border-outline-variant/40 rounded-2xl p-4 text-sm text-on-surface leading-relaxed pl-2 whitespace-pre-wrap font-sans">
                  {item.message}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
