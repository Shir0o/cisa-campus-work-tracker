import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import { Feedback, FeedbackKind } from '../types';
import { FEEDBACK_KINDS, kindMeta, typeToKind, TONE_CLASSES } from '../lib/feedbackKinds';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trash2,
  CheckCircle,
  Clock,
  Search,
  Filter,
  ShieldAlert,
  Archive,
  RefreshCw,
  Github,
  Link,
  Unlink,
  ZoomIn,
  X
} from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';
import PageContainer from '../components/layout/PageContainer';

/** Resolve a granular kind, falling back to the legacy `type` for older docs. */
const resolveKind = (item: Feedback): FeedbackKind => item.kind ?? typeToKind(item.type);

const gitHubRepo = import.meta.env.VITE_GITHUB_REPO || 'Shir0o/cisa-campus-work-traker';
const gitHubRepoUrl = `https://github.com/${gitHubRepo}`;

const getGitHubIssueUrl = (item: Feedback) => {
  const kindLabel = item.kind ? kindMeta(item.kind).label : item.type;
  const title = `[Feedback] ${kindLabel}: ${item.message.slice(0, 50)}${item.message.length > 50 ? '...' : ''}`;
  let body = `### Feedback Details
- **Submitted By:** ${item.userName} (${item.userEmail})
- **Type:** ${item.type}
- **Kind:** ${kindLabel}
- **Date:** ${item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
- **Status:** ${item.status}

### Message
\`\`\`text
${item.message}
\`\`\`

### Diagnostics
- **URL:** ${item.url || 'N/A'}
- **Viewport:** ${item.viewport || 'N/A'}
- **User Agent:** ${item.userAgent || 'N/A'}

---
*Created from CISA Campus Work Tracker user feedback.*`;

  if (item.screenshot && item.id) {
    const imageUrl = `${window.location.origin}/api/feedback/${item.id}/screenshot`;
    body += `\n\n### Screenshot\n![Feedback Screenshot](${imageUrl})\n\n*(View screenshot directly on GitHub or in app admin panel)*`;
  }

  const labels = [item.type, 'feedback'].join(',');
  const params = new URLSearchParams({ title, body, labels });
  return `${gitHubRepoUrl}/issues/new?${params.toString()}`;
};

const extractIssueNumber = (url?: string) => {
  if (!url) return '';
  const match = url.match(/\/issues\/(\d+)/);
  return match ? `#${match[1]}` : 'Issue';
};

const resolveIssueUrl = (input: string) => {
  const clean = input.trim();
  if (!clean) return '';
  if (/^#?\d+$/.test(clean)) {
    const num = clean.replace('#', '');
    return `https://github.com/Shir0o/cisa-campus-work-traker/issues/${num}`;
  }
  return clean;
};

export default function FeedbackList() {
  const { isAdmin, user } = useAuth();
  const isMe = user?.email?.toLowerCase() === 'yilongwang05@gmail.com';
  const hasAccess = isAdmin || isMe;

  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | FeedbackKind>('all');
  const [statusFilter, setStatusFilter] = useState<'unresolved' | 'all' | 'new' | 'in_progress' | 'resolved'>('unresolved');
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [isLinkingId, setIsLinkingId] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEnlargedImage(null);
    };
    if (enlargedImage) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [enlargedImage]);

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
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'feedback');
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const updateFeedbackBackend = async (id: string, fields: { status?: string; archived?: boolean; githubIssueUrl?: string | null }) => {
    try {
      let token: string | null = null;
      try {
        if (user && typeof user.getIdToken === 'function') {
          token = await user.getIdToken();
        }
      } catch (tokenErr) {
        console.error('Failed to get Firebase ID token:', tokenErr);
      }

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/feedback/update', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, ...fields }),
      });
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to update feedback via backend:', error);
      alert('Failed to update feedback. Please try again.');
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: 'new' | 'in_progress' | 'resolved') => {
    await updateFeedbackBackend(id, { status: newStatus });
  };

  const handleToggleArchive = async (id: string, archived: boolean) => {
    await updateFeedbackBackend(id, { archived });
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

  const handleCreateGitHubIssue = (item: Feedback) => {
    const url = getGitHubIssueUrl(item);
    window.open(url, '_blank', 'noopener,noreferrer');
    if (item.status === 'new') {
      handleUpdateStatus(item.id, 'in_progress');
    }
  };

  const handleSaveLink = async (id: string) => {
    const resolvedUrl = resolveIssueUrl(linkInput);
    await updateFeedbackBackend(id, { githubIssueUrl: resolvedUrl || null });
    setIsLinkingId(null);
    setLinkInput('');
  };

  const handleUnlink = async (id: string) => {
    if (!window.confirm('Are you sure you want to unlink this GitHub issue?')) return;
    await updateFeedbackBackend(id, { githubIssueUrl: null });
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
            You must be a Full-timer to view and manage user feedback submissions.
            If you believe this is an error, please get in touch with a Full-timer.
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
    
    const matchesKind = activeTab === 'all' || resolveKind(item) === activeTab;
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'unresolved'
        ? item.status !== 'resolved'
        : item.status === statusFilter;

    const isArchived = item.archived === true;
    const matchesArchive = 
      archiveFilter === 'all' ||
      (archiveFilter === 'active' && !isArchived) ||
      (archiveFilter === 'archived' && isArchived);

    return matchesSearch && matchesKind && matchesStatus && matchesArchive;
  });

  const kindCount = (id: FeedbackKind) => feedback.filter((f) => resolveKind(f) === id && !f.archived).length;
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
    <PageContainer variant="wide" className="space-y-8" id="feedback-admin-panel">
      {/* Header and overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-regular tracking-tight text-on-background">User Feedback</h1>
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
            {FEEDBACK_KINDS.map((k) => {
              const Icon = k.icon;
              const on = activeTab === k.id;
              return (
                <button
                  key={k.id}
                  onClick={() => setActiveTab(k.id)}
                  className={`flex items-center gap-1.5 py-1.5 px-4 rounded-xl font-bold text-xs transition-all border-none ${
                    on
                      ? `${TONE_CLASSES[k.tone].chip}`
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {k.label} ({kindCount(k.id)})
                </button>
              );
            })}
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
                <option value="unresolved">Unresolved Only (Default)</option>
                <option value="all">All Statuses</option>
                <option value="new">New Only</option>
                <option value="in_progress">In Progress Only</option>
                <option value="resolved">Resolved Only</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-on-surface-variant shrink-0" />
              <select
                value={archiveFilter}
                onChange={(e) => setArchiveFilter(e.target.value as any)}
                className="bg-surface border border-outline-variant text-on-surface rounded-full py-2 px-4 text-xs focus:ring-2 focus:ring-primary focus:outline-none h-10"
              >
                <option value="active">Active Only</option>
                <option value="archived">Archived Only</option>
                <option value="all">All Feedback</option>
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
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredFeedback.map((item) => {
              const k = resolveKind(item);
              const meta = kindMeta(k);
              const tone = TONE_CLASSES[meta.tone];
              const KindIcon = meta.icon;
              return (
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
                <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${tone.bar}`} />

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pl-2">
                  {/* Submitter User Details */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-on-surface text-base">{item.userName}</span>
                      <span className="text-xs text-on-surface-variant/80 font-mono">({item.userEmail})</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
                      <span className={`flex items-center gap-1 text-xs font-bold py-0.5 px-2 rounded-md ${tone.chip}`}>
                        <KindIcon className="w-3 h-3" />
                        {meta.label}
                      </span>
                      <span>•</span>
                      <span>{getFormattedDate(item.createdAt)}</span>
                    </div>
                  </div>

                  {/* Actions & Status Dropdown on Top Right */}
                  <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-center">
                    {isLinkingId === item.id ? (
                      <div className="flex items-center gap-2 bg-surface border border-outline-variant rounded-xl p-1.5 shadow-xs">
                        <input
                          type="text"
                          placeholder="Paste issue URL or #number..."
                          value={linkInput}
                          onChange={(e) => setLinkInput(e.target.value)}
                          className="bg-transparent text-[11px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none w-48 px-1.5"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveLink(item.id);
                            if (e.key === 'Escape') setIsLinkingId(null);
                          }}
                        />
                        <button
                          onClick={() => handleSaveLink(item.id)}
                          className="px-2 py-1 bg-primary text-on-primary rounded-lg text-[10px] font-bold border-none cursor-pointer"
                        >
                          Link
                        </button>
                        <button
                          onClick={() => setIsLinkingId(null)}
                          className="px-2 py-1 bg-surface-container-high text-on-surface-variant rounded-lg text-[10px] font-bold border-none cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        {item.githubIssueUrl ? (
                          <div className="flex items-center gap-1">
                            <a
                              href={item.githubIssueUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 py-1 px-3 bg-neutral-500/10 text-neutral-700 dark:text-neutral-400 hover:bg-neutral-500/20 font-bold text-xs rounded-full transition-all"
                              title="View GitHub Issue"
                            >
                              <Github className="w-3.5 h-3.5" />
                              {extractIssueNumber(item.githubIssueUrl)}
                            </a>
                            <button
                              onClick={() => {
                                setIsLinkingId(item.id);
                                setLinkInput(item.githubIssueUrl || '');
                              }}
                              className="p-1 text-on-surface-variant hover:text-primary rounded-full transition-colors border-none cursor-pointer"
                              title="Edit GitHub Link"
                            >
                              <Link className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleUnlink(item.id)}
                              className="p-1 text-on-surface-variant hover:text-error rounded-full transition-colors border-none cursor-pointer"
                              title="Unlink GitHub Issue"
                            >
                              <Unlink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="text-[10px] font-semibold text-on-surface-variant/60 uppercase tracking-wide"
                              title="No GitHub issue was auto-created for this item — the server-side GitHub integration may not be configured. Use Create Issue or Link to attach one manually."
                            >
                              Not auto-synced
                            </span>
                            <button
                              onClick={() => handleCreateGitHubIssue(item)}
                              className="flex items-center gap-1.5 py-1 px-3 bg-primary/10 text-primary hover:bg-primary/20 font-bold text-xs rounded-full transition-all border-none cursor-pointer"
                              title="Create prefilled GitHub Issue"
                            >
                              <Github className="w-3.5 h-3.5" />
                              Create Issue
                            </button>
                            <button
                              onClick={() => {
                                setIsLinkingId(item.id);
                                setLinkInput('');
                              }}
                              className="p-1 text-on-surface-variant hover:text-primary rounded-full transition-colors border-none cursor-pointer"
                              title="Link existing GitHub Issue"
                            >
                              <Link className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

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
                          onClick={() => handleToggleArchive(item.id, !item.archived)}
                          className={`p-1.5 rounded-full transition-colors border-none cursor-pointer ${
                            item.archived
                              ? 'text-primary hover:bg-primary-container/20'
                              : 'text-on-surface-variant hover:text-primary hover:bg-primary/10'
                          }`}
                          title={item.archived ? "Restore from Archive" : "Archive Feedback"}
                        >
                          <Archive className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDeleteFeedback(item.id)}
                          className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container/10 rounded-full transition-colors border-none cursor-pointer"
                          title="Delete Feedback"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Feedback Message Content */}
                <div className="bg-surface/50 border border-outline-variant/40 rounded-2xl p-4 text-sm text-on-surface leading-relaxed pl-2 whitespace-pre-wrap font-sans">
                  {item.message}
                </div>

                {/* Captured Diagnostics metadata */}
                {(item.url || item.viewport || item.userAgent) && (
                  <div className="flex flex-col gap-1.5 text-xs text-on-surface-variant/80 border-t border-outline-variant/30 pt-3 pl-2 font-mono">
                    {item.url && (
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-bold text-on-surface">URL:</span>
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary truncate">
                          {item.url}
                        </a>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {item.viewport && (
                        <div>
                          <span className="font-bold text-on-surface">Viewport:</span> {item.viewport}
                        </div>
                      )}
                      {item.userAgent && (
                        <div className="truncate max-w-md" title={item.userAgent}>
                          <span className="font-bold text-on-surface">User Agent:</span> {item.userAgent}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {item.screenshot && (
                  <details className="text-xs text-on-surface-variant pl-2 cursor-pointer mt-3">
                    <summary className="font-semibold select-none hover:text-primary list-item">
                      View Screenshot
                    </summary>
                    <div className="mt-2 border border-outline-variant rounded-xl overflow-hidden max-w-lg bg-surface shadow-xs relative group">
                      <img
                        src={item.screenshot}
                        alt="Captured Screenshot"
                        className="w-full object-contain max-h-[400px] cursor-zoom-in transition-transform group-hover:scale-[1.01]"
                        onClick={() => setEnlargedImage(item.screenshot)}
                        title="Click to enlarge screenshot"
                      />
                      <div
                        onClick={() => setEnlargedImage(item.screenshot)}
                        className="absolute bottom-2 right-2 px-2.5 py-1 bg-surface/90 text-on-surface text-[11px] font-medium rounded-lg border border-outline-variant/50 shadow-xs backdrop-blur-xs flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <ZoomIn className="w-3.5 h-3.5" /> Click to enlarge
                      </div>
                    </div>
                  </details>
                )}
              </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Enlarged Screenshot Modal Overlay */}
      <AnimatePresence>
        {enlargedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEnlargedImage(null)}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm p-4 md:p-8 flex items-center justify-center cursor-zoom-out"
            aria-label="Enlarged screenshot view"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-outline-variant/30 shadow-2xl bg-surface p-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setEnlargedImage(null)}
                aria-label="Close enlarged screenshot"
                className="absolute top-4 right-4 p-2 bg-surface/90 text-on-surface rounded-full hover:bg-surface border border-outline-variant/40 shadow-md transition-all z-10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <img
                src={enlargedImage}
                alt="Enlarged Screenshot"
                className="max-w-full max-h-[85vh] object-contain rounded-xl"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageContainer>
  );
}
