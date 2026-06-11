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
  Moon,
  Sun,
  Monitor,
  Sparkles,
  Zap,
  Terminal,
  Smartphone,
  Copy,
  MessageSquare
} from "lucide-react";
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Skeleton } from '../components/ui/Skeleton';
import { useTheme } from '../components/ThemeProvider';
import FeedbackList from './FeedbackList';

type AppRole = 'admin' | 'manager' | 'operator' | 'viewer';

const ROLE_CARDS: {
  key: AppRole;
  label: string;
  initials: string;
  description: string;
  access: string[];
}[] = [
  {
    key: 'admin',
    label: 'Administrator',
    initials: 'AD',
    description: 'Full-time staff. Sees the whole work — every person, the team board, and all admin tools.',
    access: ['Today', 'People', 'The Journey', 'Gatherings', 'Prayer', 'History', 'Settings'],
  },
  {
    key: 'manager',
    label: 'Manager',
    initials: 'MG',
    description: 'Walks alongside the team. Manages users and accesses all data surfaces, minus dev-only admin.',
    access: ['Today', 'People', 'The Journey', 'Gatherings', 'Prayer', 'History'],
  },
  {
    key: 'operator',
    label: 'Operator',
    initials: 'OP',
    description: 'Can add and update people, log interactions, and mark attendance.',
    access: ['Today', 'People', 'Gatherings', 'Prayer'],
  },
  {
    key: 'viewer',
    label: 'Viewer',
    initials: 'VW',
    description: 'A read-only window — can see gatherings and prayers, nothing else.',
    access: ['Gatherings', 'Prayer'],
  },
];

function RolesReference({ currentRole }: { currentRole: AppRole | null }) {
  return (
    <div className="flex flex-col gap-2.5 max-w-2xl">
      {ROLE_CARDS.map(card => {
        const isActive = card.key === currentRole;
        return (
          <div
            key={card.key}
            className={cn(
              'flex gap-4 items-start p-4 rounded-2xl border transition-colors',
              isActive
                ? 'border-primary/30 bg-primary/5'
                : 'bg-surface-container border-outline-variant/30'
            )}
          >
            {/* Avatar */}
            <div className={cn(
              'flex-none w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
              isActive
                ? 'bg-primary/20 text-primary'
                : 'bg-surface-container-high text-on-surface-variant'
            )}>
              {card.initials}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }} className="text-[16.5px] font-semibold text-on-surface leading-tight">
                  {card.label}
                </span>
                {isActive && (
                  <span className="text-[11px] font-semibold text-primary uppercase tracking-wide border border-primary/30 bg-surface-container rounded-full px-2 py-0.5 leading-none">
                    your role
                  </span>
                )}
              </div>
              <p className="text-[13px] text-on-surface-variant mt-0.5 leading-none">
                {card.access.length} section{card.access.length !== 1 ? 's' : ''} accessible
              </p>
              <p className="text-[13.5px] text-on-surface/75 leading-relaxed mt-2 max-w-prose">
                {card.description}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {card.access.map(section => (
                  <span
                    key={section}
                    className="text-[12px] text-on-surface-variant bg-surface-container-high border border-outline-variant/40 rounded-full px-2.5 py-0.5"
                  >
                    {section}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Settings() {
  const { user: currentUser, isAdmin, isManager } = useAuth();
  const isDev = currentUser?.email?.toLowerCase() === 'yilongwang05@gmail.com' || isAdmin || isManager;
  const { theme, setTheme } = useTheme();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  // Member Form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'manager' | 'operator' | 'viewer'>('operator');
  const [isInviting, setIsInviting] = useState(false);

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

  const QuickAddSection = () => {
    const [text, setText] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
    const [result, setResult] = useState<any>(null);
    const [errorMsg, setErrorMsg] = useState("");
    const [copiedCurl, setCopiedCurl] = useState(false);
    const [copiedUrl, setCopiedUrl] = useState(false);
    const [copiedGroupMe, setCopiedGroupMe] = useState(false);
    const [copiedContactCmd, setCopiedContactCmd] = useState(false);
    const [copiedInteractionCmd, setCopiedInteractionCmd] = useState(false);

    const appUrl = typeof window !== "undefined" ? window.location.origin : "https://campus-hub.app";
    const curlCommand = `curl -X POST "${appUrl}/api/quick-add" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Met Sarah Doe yesterday at Campus Coffee. She is a freshman majoring in biology and can be reached at sarah12@campus.edu or (555) 789-0123. Interested in study group."}'`;

    const smsWebhookUrl = `${appUrl}/api/webhook/sms`;
    const groupMeWebhookUrl = `${appUrl}/api/webhook/groupme`;

    const handleCopy = (txt: string, setCopied: (v: boolean) => void) => {
      navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    const handleQuickAdd = async () => {
      if (!text.trim()) return;
      setStatus("loading");
      setResult(null);
      setErrorMsg("");

      try {
        const response = await fetch("/api/quick-add", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            text,
            userId: currentUser?.uid,
            userName: currentUser?.displayName || currentUser?.email || "Unknown User"
          }),
        });

        const data = await response.json();
        if (data.success) {
          setStatus("success");
          setResult(data.contact);
          setText("");
        } else {
          setStatus("error");
          setErrorMsg(data.error || "Failed to process descriptions.");
        }
      } catch (err: any) {
        setStatus("error");
        setErrorMsg(err.message || "An error occurred connecting to server API.");
      }
    };

    return (
      <div className="mt-8">
        <h2 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> AI Quick Add &amp; SMS Integration
        </h2>
        <div className="bg-surface-container rounded-[2rem] border border-outline-variant/50 p-6 shadow-sm space-y-6">
          
          <div>
            <h3 className="font-bold text-on-surface">AI Natural Language Playground</h3>
            <p className="text-sm text-on-surface-variant mb-4">
              Type or paste a raw description of someone you met (as if we texted or voice-entered it).
              The server will parse it using Gemini and add them as a formatted contact instantly!
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="e.g., Met John Doe at Miller Hall. Sophomore philosophy student, phone is 555-1234. Interested in Friday discussions."
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={status === "loading"}
                className="flex-1 px-4 py-3 bg-surface-container-high rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface placeholder:text-on-surface-variant/50"
              />
              <button
                onClick={handleQuickAdd}
                disabled={status === "loading" || !text.trim()}
                className="px-6 py-3 bg-primary text-on-primary font-bold rounded-xl hover:opacity-90 active:scale-95 transition-all text-sm shrink-0 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {status === "loading" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Parsing Text...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>Try Quick Add</span>
                  </>
                )}
              </button>
            </div>

            <AnimatePresence>
              {status === "success" && result && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="mt-4 p-4 bg-success/10 border border-success/30 rounded-xl text-sm"
                >
                  <div className="flex items-center gap-2 text-success font-bold mb-2">
                    <CheckCircle2 className="w-4 h-4" /> Successfully Created Contact!
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-surface-container-high/60 p-3 rounded-lg border border-outline-variant/30">
                    <div>
                      <span className="text-on-surface-variant block uppercase font-bold text-[10px]">Name</span>
                      <span className="font-bold text-on-surface">{result.name}</span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant block uppercase font-bold text-[10px]">Role / Group</span>
                      <span className="text-on-surface">{result.role}</span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant block uppercase font-bold text-[10px]">Location</span>
                      <span className="text-on-surface">{result.location || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant block uppercase font-bold text-[10px]">Pipeline Stage</span>
                      <span className="font-bold text-primary">{result.stage}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs">
                    <span className="text-on-surface-variant block uppercase font-bold text-[10px]">Extracted Notes</span>
                    <p className="text-on-surface mt-0.5">{result.notes}</p>
                  </div>
                </motion.div>
              )}

              {status === "error" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="mt-4 p-4 bg-error/10 border border-error/30 rounded-xl text-sm flex items-start gap-2 text-error"
                >
                  <XCircle className="w-5 h-5 shrink-0" />
                  <div>
                    <span className="font-bold">Error Processing Quick Add:</span>
                    <p className="mt-1 text-xs opacity-90">{errorMsg}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <hr className="border-outline-variant/30" />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* iOS Shortcuts / REST API CARD */}
            <div className="space-y-3 bg-surface-container-low/40 p-4 rounded-2xl border border-outline-variant/20 flex flex-col justify-between">
              <div className="space-y-2">
                <h4 className="font-bold text-on-surface text-sm flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-primary" /> Siri &amp; Developers API
                </h4>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Add contacts via iOS Shortcuts, Siri, or customized automation pipelines. Say "Hey Siri, Quick Add..." and pass raw descriptions.
                </p>
              </div>
              
              <div className="relative bg-surface-container-high rounded-xl p-3 border border-outline-variant/40 font-mono text-[10px] text-on-surface mt-3">
                <button
                  onClick={() => handleCopy(curlCommand, setCopiedCurl)}
                  className="absolute top-2 right-2 p-1.5 hover:bg-surface-variant rounded-md transition-colors text-on-surface-variant cursor-pointer"
                  title="Copy curl command"
                >
                  {copiedCurl ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <span className="text-[9px] text-primary font-bold block mb-1">CURL REQUEST TEMPLATE:</span>
                <pre className="overflow-x-auto whitespace-pre-wrap pr-6 select-all font-sans">{curlCommand}</pre>
              </div>
            </div>

            {/* Twilio SMS & WhatsApp CARD */}
            <div className="space-y-3 bg-surface-container-low/40 p-4 rounded-2xl border border-outline-variant/20 flex flex-col justify-between">
              <div className="space-y-2">
                <h4 className="font-bold text-on-surface text-sm flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-primary" /> SMS &amp; WhatsApp Webhook
                </h4>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Submit contacts straight from standard SMS text messages or official WhatsApp messages using a single Twilio number coordinate!
                </p>
              </div>

              <div className="relative bg-surface-container-high rounded-xl p-3 border border-outline-variant/40 font-mono text-[10px] text-on-surface mt-3">
                <button
                  onClick={() => handleCopy(smsWebhookUrl, setCopiedUrl)}
                  className="absolute top-2 right-2 p-1.5 hover:bg-surface-variant rounded-md transition-colors text-on-surface-variant cursor-pointer"
                  title="Copy Twilio webhook"
                >
                  {copiedUrl ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <span className="text-[9px] text-primary font-bold block mb-1">TWILIO CLOUD WEBHOOK URL:</span>
                <span className="select-all block truncate font-bold text-on-surface-variant pr-6 text-[10px]">{smsWebhookUrl}</span>
              </div>

              <div className="p-3 bg-secondary-container/10 border border-secondary/10 rounded-xl text-[10px] text-on-secondary-container mt-2">
                <span className="font-bold block uppercase text-[9px] mb-1">Easy WhatsApp/SMS Set Up:</span>
                <ol className="list-decimal pl-4 space-y-1 opacity-90 leading-tight">
                  <li>In Twilio, define your phone or sandbox number.</li>
                  <li>Under Messaging webhook settings, paste this Web Address.</li>
                  <li>Choose <strong>HTTP POST</strong> and press Save!</li>
                </ol>
              </div>
            </div>

            {/* GroupMe Bot CARD */}
            <div className="space-y-3 bg-surface-container-low/40 p-4 rounded-2xl border border-outline-variant/20 flex flex-col justify-between">
              <div className="space-y-2">
                <h4 className="font-bold text-on-surface text-sm flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" /> GroupMe Chat Bot
                </h4>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Collaborate in GroupMe! Everyone in the group can text new contacts using prefix trigger lines (e.g. <span className="font-mono bg-surface-variant px-1 rounded text-red-400">!add</span>).
                </p>
              </div>

              <div className="relative bg-surface-container-high rounded-xl p-3 border border-outline-variant/40 font-mono text-[10px] text-on-surface mt-3">
                <button
                  onClick={() => handleCopy(groupMeWebhookUrl, setCopiedGroupMe)}
                  className="absolute top-2 right-2 p-1.5 hover:bg-surface-variant rounded-md transition-colors text-on-surface-variant cursor-pointer"
                  title="Copy GroupMe callback url"
                >
                  {copiedGroupMe ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <span className="text-[9px] text-primary font-bold block mb-1">GROUPME BOT CALLBACK URL:</span>
                <span className="select-all block truncate font-bold text-on-surface-variant pr-6 text-[10px]">{groupMeWebhookUrl}</span>
              </div>

              <div className="p-3 bg-secondary-container/10 border border-secondary/10 rounded-xl text-[10px] text-on-secondary-container mt-2">
                <span className="font-bold block uppercase text-[9px] mb-1">GroupMe Bot Set-Up:</span>
                <ol className="list-decimal pl-4 space-y-1 opacity-90 leading-tight">
                  <li>Go to dev.groupme.com &rarr; click on <strong>Bots</strong> menu.</li>
                  <li>Click <strong>Create Bot</strong>, link your group chat.</li>
                  <li>Paste this <strong>Callback URL</strong> and click Submit!</li>
                  <li>Type a quick command prefix (e.g. <code className="font-bold bg-surface-variant px-1 rounded">!add Jerry...</code>) to begin.</li>
                </ol>
              </div>

              {/* GroupMe Message Parsing Options & Cheat Sheet */}
              <div className="mt-4 border-t border-outline-variant/30 pt-3.5 space-y-3 shrink-0">
                <div>
                  <span className="font-bold block uppercase text-[9px] text-primary mb-1.5">1. Prefix Triggers</span>
                  <p className="text-[10px] text-on-surface-variant leading-relaxed">
                    Start your messages in the GroupMe chat with one of these recognized prefixes to let the AI bot parse it:
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {["!add ", "/add ", "add: "].map((pref) => (
                      <code key={pref} className="px-1.5 py-0.5 bg-surface-container-high text-on-surface hover:text-primary transition-colors font-mono rounded text-[9px] border border-outline-variant/20">
                        {pref}
                      </code>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="font-bold block uppercase text-[9px] text-primary">2. Command Parsing Options</span>
                  <p className="text-[10px] text-on-surface-variant leading-relaxed mb-1">
                    Direct the AI Parser using optional keywords directly after your prefix:
                  </p>

                  {/* Add Contact Card Option */}
                  <div className="bg-surface-container-high rounded-xl p-2.5 border border-outline-variant/40 space-y-1.5 relative group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="px-1.5 py-0.5 bg-primary/10 text-primary font-mono rounded text-[8px] uppercase tracking-wider">
                          contact
                        </span>
                        <span className="text-[9px] text-on-surface-variant/80 italic font-medium">(Default choice)</span>
                      </div>
                      <button
                        onClick={() => handleCopy("!add contact Jerry Doe is a sophomore majoring in history, phone is 555-0192, met at cafeteria.", setCopiedContactCmd)}
                        className="p-1 hover:bg-surface-variant rounded transition-colors text-on-surface-variant cursor-pointer"
                        title="Copy contact example"
                      >
                        {copiedContactCmd ? (
                          <CheckCircle2 className="w-3 h-3 text-success" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <p className="text-[9.5px] text-on-surface leading-normal">
                      Parses name, role, details, contact info, and creates or merges with a directory card.
                    </p>
                    <div className="bg-surface-container-low p-1.5 rounded border border-outline-variant/20 font-mono text-[8.5px] text-on-surface-variant whitespace-pre-wrap select-all">
                      !add contact Jerry Doe is a sophomore majoring in history, phone is 555-0192, met at cafeteria.
                    </div>
                  </div>

                  {/* Add Interaction Option */}
                  <div className="bg-surface-container-high rounded-xl p-2.5 border border-outline-variant/40 space-y-1.5 relative group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="px-1.5 py-0.5 bg-success/10 text-success font-mono rounded text-[8px] uppercase tracking-wider">
                          interaction
                        </span>
                      </div>
                      <button
                        onClick={() => handleCopy("!add interaction Jerry Doe and I studied Romans today, shared about exams and prayed together.", setCopiedInteractionCmd)}
                        className="p-1 hover:bg-surface-variant rounded transition-colors text-on-surface-variant cursor-pointer"
                        title="Copy interaction example"
                      >
                        {copiedInteractionCmd ? (
                          <CheckCircle2 className="w-3 h-3 text-success" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <p className="text-[9.5px] text-on-surface leading-normal">
                      Logs a follow-up conversation event or prayer update in the history list of an existing contact.
                    </p>
                    <div className="bg-surface-container-low p-1.5 rounded border border-outline-variant/20 font-mono text-[8.5px] text-on-surface-variant whitespace-pre-wrap select-all">
                      !add interaction Jerry Doe and I studied Romans today, shared about exams and prayed together.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  };

  const WebhookLogsSection = () => {
    const [logs, setLogs] = useState<any[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
    const [isClearing, setIsClearing] = useState(false);

    useEffect(() => {
      const q = query(
        collection(db, "webhook_logs"),
        orderBy("timestamp", "desc")
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const logsData = snapshot.docs.map(doc => ({
          dbId: doc.id,
          ...doc.data()
        }));
        setLogs(logsData);
        setLoadingLogs(false);
      }, (error) => {
        console.error("Error setting up webhook_logs listener:", error);
        setLoadingLogs(false);
        handleFirestoreError(error, OperationType.LIST, "webhook_logs");
      });

      return () => unsubscribe();
    }, []);

    const handleClearLogs = async () => {
      if (!confirm("Are you sure you want to clear all webhook debugging logs?")) return;
      setIsClearing(true);
      try {
        const snapshot = await getDocs(collection(db, "webhook_logs"));
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
      } catch (err) {
        console.error("Failed to clear webhook logs:", err);
        handleFirestoreError(err, OperationType.DELETE, "webhook_logs");
      } finally {
        setIsClearing(false);
      }
    };

    const toggleExpand = (id: string) => {
      setExpandedLogId(expandedLogId === id ? null : id);
    };

    return (
      <div className="mt-8">
        <h2 className="text-xl font-bold text-on-surface mb-4 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" /> API &amp; Webhook Debugger Console
          </span>
          {logs.length > 0 && (
            <button
              onClick={handleClearLogs}
              disabled={isClearing}
              className="px-3 py-1.5 text-xs bg-error/10 hover:bg-error/20 text-error font-medium rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Logs</span>
            </button>
          )}
        </h2>

        <div className="bg-surface-container rounded-[2rem] border border-outline-variant/50 p-6 shadow-sm space-y-4">
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Verify callback formats from <strong>GroupMe Bots</strong> or <strong>Twilio SMS</strong> in real time. 
            When your webhooks receive requests, they appear here instantly so you can verify payloads, headers, and AI translation results.
          </p>

          {loadingLogs ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-on-surface-variant">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs">Listening for incoming API &amp; webhooks...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center bg-surface-container-low/30 rounded-2xl border border-dashed border-outline-variant/50">
              <Sparkles className="w-8 h-8 text-on-surface-variant/40 mx-auto mb-2" />
              <p className="text-sm font-semibold text-on-surface-variant">No Hook Activity Yet</p>
              <p className="text-xs text-on-surface-variant/70 mt-1">Send a message to your GroupMe bot or try quick add to see webhooks in action.</p>
            </div>
          ) : (
            <div className="space-y-3.5 max-h-[600px] overflow-y-auto pr-1">
              {logs.map((log) => {
                const isSelected = expandedLogId === log.dbId;
                
                const sourceColor = 
                  log.source === "GroupMe" ? "bg-[#33a3fc]/10 text-[#33a3fc] border-[#33a3fc]/20" :
                  log.source === "Twilio SMS" ? "bg-success/10 text-success border-success/20" : 
                  "bg-primary/10 text-primary border-primary/20";

                const statusColor = 
                  log.status === "success" ? "bg-success text-on-success" :
                  log.status === "error" ? "bg-error text-on-error" : 
                  "bg-outline text-on-surface-variant";

                return (
                  <div 
                    key={log.dbId} 
                    className={cn(
                      "rounded-2xl border border-outline-variant/35 bg-surface-container-low/50 hover:bg-surface-container-low transition-all duration-200 overflow-hidden",
                      isSelected ? "ring-1 ring-primary/45 border-primary/40 bg-surface-container-high/40" : ""
                    )}
                  >
                    <div 
                      onClick={() => toggleExpand(log.dbId)}
                      className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className={cn("px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase border rounded-full shrink-0", sourceColor)}>
                          {log.source || "Callback"}
                        </span>
                        <span className={cn("px-2 py-0.5 text-[9px] font-extrabold tracking-widest uppercase rounded shrink-0", statusColor)}>
                          {log.status}
                        </span>
                        <span className="text-xs text-on-surface font-semibold line-clamp-1">
                          {log.result}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-on-surface-variant text-[10px] opacity-75 shrink-0 self-end md:self-auto font-mono">
                        <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        <span className="text-on-surface-variant/40">|</span>
                        <span>{new Date(log.timestamp).toLocaleDateString()}</span>
                        <span className="text-xs text-primary font-bold ml-1">{isSelected ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isSelected && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-outline-variant/25 bg-surface-container-high/60"
                        >
                          <div className="p-4 space-y-4 text-xs font-mono">
                            {log.error && (
                              <div className="p-3 bg-error/10 border border-error/20 rounded-xl text-error font-sans text-xs">
                                <span className="font-bold uppercase tracking-wider block text-[9px] mb-1">Execution Failure detail:</span>
                                {log.error}
                              </div>
                            )}

                            <div>
                              <span className="text-[10px] font-black tracking-widest text-primary uppercase block mb-1">Raw Callback Payload (POST Body):</span>
                              <pre className="bg-surface-container-low border border-outline-variant/40 p-3 rounded-xl overflow-x-auto text-[10.5px] text-on-surface-variant whitespace-pre-wrap select-all">
                                {(() => {
                                  try {
                                    return JSON.stringify(JSON.parse(log.payload), null, 2);
                                  } catch (e) {
                                    return log.payload;
                                  }
                                })()}
                              </pre>
                            </div>

                            <div>
                              <span className="text-[10px] font-black tracking-widest text-primary uppercase block mb-1">Request Headers:</span>
                              <pre className="bg-surface-container-low border border-outline-variant/40 p-3 rounded-xl overflow-x-auto text-[10.5px] text-on-surface-variant whitespace-pre-wrap select-all">
                                {(() => {
                                  try {
                                    return JSON.stringify(JSON.parse(log.headers), null, 2);
                                  } catch (e) {
                                    return log.headers || "{}";
                                  }
                                })()}
                              </pre>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

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

        <div className="mt-8">
          <h2 className="text-lg font-semibold text-on-surface mb-1">Roles &amp; access</h2>
          <p className="text-sm text-on-surface-variant mb-4">
            Roles are labels — a way to know who carries what, and what each person sees.
          </p>
          <RolesReference currentRole={(users.find(u => u.uid === currentUser?.uid)?.role ?? null) as AppRole | null} />
        </div>

        <ThemeSection />
        {isDev && <QuickAddSection />}
        {isDev && <WebhookLogsSection />}

        {currentUser?.email?.toLowerCase() === 'yilongwang05@gmail.com' && (
          <div className="mt-8 border-t border-outline-variant/30 pt-8" id="settings-feedback-list-me">
            <FeedbackList />
          </div>
        )}

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
          className="hidden md:flex md:static bg-primary text-on-primary md:px-6 md:py-3 p-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all md:shadow-lg md:shadow-primary/20"
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
      <div className="mt-8 border-t border-outline-variant/30 pt-8">
        <h2 className="text-lg font-semibold text-on-surface mb-1">Roles &amp; access</h2>
        <p className="text-sm text-on-surface-variant mb-4">
          Roles are labels — a way to know who carries what, and what each person sees.
        </p>
        <RolesReference currentRole={(currentUser ? (users.find(u => u.uid === currentUser.uid)?.role ?? null) : null) as AppRole | null} />
      </div>

      <ThemeSection />
      {isDev && <QuickAddSection />}
      {isDev && <WebhookLogsSection />}

      {currentUser?.email?.toLowerCase() === 'yilongwang05@gmail.com' && (
        <div className="mt-8 border-t border-outline-variant/30 pt-8" id="settings-feedback-list-manager-me">
          <FeedbackList />
        </div>
      )}

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
