import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  User, 
  Briefcase, 
  MapPin, 
  Mail, 
  Phone, 
  Loader2, 
  Trash2, 
  Edit3, 
  Calendar,
  MessageSquare,
  ChevronRight,
  Send,
  UserCircle,
  Clock,
  Plus,
  Sparkles
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { 
  doc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  orderBy, 
  getDocs, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { cn, formatPhoneNumber, validatePhoneNumber } from '../../lib/utils';
import { Contact, Stage, Interaction, Comment } from '../../types';
import { useAuth } from '../AuthProvider';
import { Skeleton } from '../ui/Skeleton';
import { aiService } from '../../services/aiService';

interface ContactDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
}

export default function ContactDetailsModal({ isOpen, onClose, contact }: ContactDetailsModalProps) {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [interactionsLoading, setInteractionsLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [stages, setStages] = useState<Stage[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [newInteraction, setNewInteraction] = useState({
    content: '',
    dateTime: new Date().toISOString().slice(0, 16),
    duration: ''
  });
  const [submittingInteraction, setSubmittingInteraction] = useState(false);
  const [isLoggingInteraction, setIsLoggingInteraction] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    location: '',
    email: '',
    phone: '',
    stage: '',
    status: '',
    notes: ''
  });

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
    if (contact) {
      setFormData({
        name: contact.name || '',
        role: contact.role || '',
        location: contact.location || '',
        email: contact.email || '',
        phone: contact.phone || '',
        stage: contact.stage || '',
        status: contact.status || '',
        notes: contact.notes || ''
      });
      setIsEditing(false);
    }
  }, [contact]);

  useEffect(() => {
    if (isOpen) {
      const fetchStages = async () => {
        try {
          const q = query(collection(db, 'stages'), orderBy('order', 'asc'));
          const querySnapshot = await getDocs(q);
          const stageData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Stage[];
          setStages(stageData);
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, 'stages');
        }
      };
      fetchStages();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && contact) {
      const interactionsRef = collection(db, 'contacts', contact.id, 'interactions');
      const q = query(interactionsRef, orderBy('createdAt', 'asc'));
      
      setInteractionsLoading(true);
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const interactionData = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt
          } as Interaction;
        });
        setInteractions(interactionData);
        setInteractionsLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `contacts/${contact.id}/interactions`);
      });

      return () => unsubscribe();
    }
  }, [isOpen, contact]);

  useEffect(() => {
    if (isOpen && contact) {
      const commentsRef = collection(db, 'contacts', contact.id, 'comments');
      const q = query(commentsRef, orderBy('createdAt', 'asc'));
      
      setCommentsLoading(true);
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const commentData = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt
          } as Comment;
        });
        setComments(commentData);
        setCommentsLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `contacts/${contact.id}/comments`);
      });

      return () => unsubscribe();
    }
  }, [isOpen, contact]);

  useEffect(() => {
    const triggerAI = async () => {
      if (!isOpen || !contact || isAnalyzing) return;
      if (interactionsLoading || commentsLoading) return;
      
      const lastAnalysis = contact.lastAiAnalysisAt ? new Date(contact.lastAiAnalysisAt) : null;
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const hasRecentData = (data: (Interaction | Comment)[]) => {
        if (!lastAnalysis) return data.length > 0;
        return data.some(item => {
          const createdAt = item.createdAt ? new Date(item.createdAt) : new Date(0);
          return createdAt > lastAnalysis;
        });
      };

      const needsAnalysis = !lastAnalysis || 
                           lastAnalysis < twentyFourHoursAgo || 
                           hasRecentData(interactions) || 
                           hasRecentData(comments);

      if (needsAnalysis && (interactions.length > 0 || comments.length > 0)) {
        console.log('Triggering automatic AI activity analysis for', contact.name);
        handleAIAnalyze();
      }
    };

    triggerAI();
  }, [isOpen, contact?.id, interactionsLoading, commentsLoading]);

  if (!contact) return null;

  const handlePhoneBlur = () => {
    if (!formData.phone) {
      setPhoneError(null);
      return;
    }
    const formatted = formatPhoneNumber(formData.phone);
    setFormData(f => ({ ...f, phone: formatted }));
    
    if (!validatePhoneNumber(formData.phone)) {
      const digits = formData.phone.replace(/[^\d]/g, '');
      if (digits.length < 10) {
        setPhoneError('Phone number too short (need 10 digits)');
      } else if (digits.length > 10) {
        setPhoneError('Phone number too long (need 10 digits)');
      } else {
        setPhoneError(null);
      }
    } else {
      setPhoneError(null);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const contactRef = doc(db, 'contacts', contact.id);
      await updateDoc(contactRef, {
        ...formData,
        updatedAt: new Date().toISOString()
      });
      setIsEditing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `contacts/${contact.id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'contacts', contact.id));
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `contacts/${contact.id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInteraction.content.trim() || !newInteraction.dateTime || !user || !contact) return;

    setSubmittingInteraction(true);
    try {
      const interactionsRef = collection(db, 'contacts', contact.id, 'interactions');
      await addDoc(interactionsRef, {
        userId: user.uid,
        userName: user.displayName || user.email?.split('@')[0] || 'Anonymous',
        userPhoto: user.photoURL || '',
        content: newInteraction.content.trim(),
        dateTime: newInteraction.dateTime,
        duration: newInteraction.duration.trim() || null,
        createdAt: serverTimestamp()
      });
      setNewInteraction({
        content: '',
        dateTime: new Date().toISOString().slice(0, 16),
        duration: ''
      });
      setIsLoggingInteraction(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `contacts/${contact.id}/interactions`);
    } finally {
      setSubmittingInteraction(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user || !contact) return;

    setSubmittingComment(true);
    try {
      const commentsRef = collection(db, 'contacts', contact.id, 'comments');
      await addDoc(commentsRef, {
        userId: user.uid,
        userName: user.displayName || user.email?.split('@')[0] || 'Anonymous',
        userPhoto: user.photoURL || '',
        text: newComment.trim(),
        createdAt: serverTimestamp()
      });
      setNewComment('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `contacts/${contact.id}/comments`);
    } finally {
      setSubmittingComment(true); // Keep spinner until next tick or just reset
      setSubmittingComment(false);
    }
  };

  const handleAIAnalyze = async () => {
    if (!contact || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const analysis = await aiService.analyzeContact(contact, interactions, comments);
      
      const contactRef = doc(db, 'contacts', contact.id);
      const now = new Date().toISOString();
      
      // If AI suggests Needs Contact and we aren't already there or explicitly follow up
      const shouldUpdateStage = analysis.needsContact.suggested && contact.stage !== 'Needs Contact';
      
      await updateDoc(contactRef, {
        lastSeen: new Date(analysis.lastSeen.timestamp).toLocaleDateString(),
        updatedAt: now,
        lastAiAnalysisAt: now,
        lastSeenAiReason: `${analysis.lastSeen.reasoning} (${analysis.lastSeen.source})`,
        needsContactAiReason: analysis.needsContact.suggested ? analysis.needsContact.reasoning : null,
        ...(shouldUpdateStage ? { stage: 'Needs Contact' } : {})
      });

    } catch (error) {
      console.error("AI Analysis Error:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const statusOptions = ['Needs Contact', 'Email Sent', 'Qualified Lead', 'Follow Up Required', 'Meeting Scheduled'];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[-1]"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-surface-container rounded-[28px] shadow-2xl border border-outline-variant overflow-hidden flex flex-col max-h-full"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-xl">
                  {contact.initials}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-on-surface line-clamp-1">{isEditing ? 'Edit Contact' : contact.name}</h2>
                  {!isEditing && <p className="text-sm text-on-surface-variant font-medium">{contact.role}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isEditing && (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant"
                    title="Edit Contact"
                  >
                    <Edit3 className="w-5 h-5" />
                  </button>
                )}
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {isEditing ? (
                <form id="edit-contact-form" onSubmit={handleUpdate} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                        <User className="w-3.5 h-3.5" /> Full Name
                      </label>
                      <input
                        required
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                        <Briefcase className="w-3.5 h-3.5" /> Status/Role
                      </label>
                      <input
                        required
                        type="text"
                        value={formData.role}
                        onChange={e => setFormData(f => ({ ...f, role: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                        <Mail className="w-3.5 h-3.5" /> Email
                      </label>
                      <input
                        required
                        type="email"
                        value={formData.email}
                        onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                        <Phone className="w-3.5 h-3.5" /> Phone
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={e => {
                          setFormData(f => ({ ...f, phone: e.target.value }));
                          if (phoneError) setPhoneError(null);
                        }}
                        onBlur={handlePhoneBlur}
                        className={cn(
                          "w-full h-11 px-4 rounded-xl bg-surface-container-high border outline-none transition-all text-sm",
                          phoneError ? "border-error focus:border-error focus:ring-1 focus:ring-error" : "border-outline focus:border-primary focus:ring-1 focus:ring-primary"
                        )}
                      />
                      <AnimatePresence>
                        {phoneError && (
                          <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="text-[10px] font-bold text-error px-1 uppercase tracking-wider"
                          >
                            {phoneError}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                        <Calendar className="w-3.5 h-3.5" /> Stage
                      </label>
                      <select
                        value={formData.stage}
                        onChange={e => setFormData(f => ({ ...f, stage: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary outline-none transition-all text-sm appearance-none"
                      >
                        {stages.map(s => (
                          <option key={s.id} value={s.label}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                        <ChevronRight className="w-3.5 h-3.5" /> Interaction Status
                      </label>
                      <select
                        value={formData.status}
                        onChange={e => setFormData(f => ({ ...f, status: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary outline-none transition-all text-sm appearance-none"
                      >
                        <option value="">Select Status</option>
                        {statusOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                      <MessageSquare className="w-3.5 h-3.5" /> Notes
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                      className="w-full min-h-[120px] p-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm resize-none"
                    />
                  </div>
                </form>
              ) : (
                <div className="space-y-8">
                  {/* Info Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shrink-0 transition-colors">
                        <Mail className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-0.5">Email Address</p>
                        <p className="text-sm font-bold text-on-surface break-all">{contact.email}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shrink-0">
                        <Phone className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-0.5">Phone Number</p>
                        <p className="text-sm font-bold text-on-surface">{contact.phone || 'Not provided'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shrink-0">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-0.5">First Met</p>
                        <p className="text-sm font-bold text-on-surface">{contact.location || 'Not recorded'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shrink-0">
                        <Briefcase className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-0.5">Current Stage</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold uppercase tracking-tight">
                            {contact.stage}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Notes Section */}
                  <div className="p-5 rounded-[20px] bg-surface-container-low border border-outline-variant">
                    <h3 className="text-sm font-black text-on-surface uppercase tracking-widest flex items-center gap-2 mb-4">
                      <MessageSquare className="w-4 h-4 text-primary" /> Contact Notes
                    </h3>
                    <div className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap min-h-[60px]">
                      {contact.notes || "No notes recorded for this contact yet."}
                    </div>
                  </div>

                  {/* Interactions Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                      <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
                        Interaction Log ({interactions.length})
                      </h3>
                      <button
                        onClick={() => setIsLoggingInteraction(!isLoggingInteraction)}
                        className="p-1 px-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
                      >
                        {isLoggingInteraction ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        {isLoggingInteraction ? 'Cancel' : 'Log Interaction'}
                      </button>
                    </div>
                    
                    {/* Log Interaction Form */}
                    <AnimatePresence>
                      {isLoggingInteraction && (
                        <motion.form
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          onSubmit={handleAddInteraction}
                          className="space-y-3 p-4 rounded-2xl bg-surface-container-high border border-primary/20 overflow-hidden"
                        >
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5 px-1">
                                <Calendar className="w-3 h-3" /> Date & Time
                              </label>
                              <input
                                required
                                type="datetime-local"
                                value={newInteraction.dateTime}
                                onChange={e => setNewInteraction(prev => ({ ...prev, dateTime: e.target.value }))}
                                className="w-full h-9 px-3 rounded-lg bg-surface-container border border-outline-variant focus:border-primary outline-none transition-all text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5 px-1">
                                <Clock className="w-3 h-3" /> Duration (e.g. 15m)
                              </label>
                              <input
                                type="text"
                                placeholder="Optional"
                                value={newInteraction.duration}
                                onChange={e => setNewInteraction(prev => ({ ...prev, duration: e.target.value }))}
                                className="w-full h-9 px-3 rounded-lg bg-surface-container border border-outline-variant focus:border-primary outline-none transition-all text-xs"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5 px-1">
                              <MessageSquare className="w-3 h-3" /> Content
                            </label>
                            <textarea
                              required
                              placeholder="Describe the interaction..."
                              value={newInteraction.content}
                              onChange={e => setNewInteraction(prev => ({ ...prev, content: e.target.value }))}
                              className="w-full min-h-[80px] p-3 rounded-lg bg-surface-container border border-outline-variant focus:border-primary outline-none transition-all text-xs resize-none"
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="submit"
                              disabled={submittingInteraction || !newInteraction.content.trim()}
                              className="px-4 h-9 rounded-full bg-primary text-on-primary font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2 text-xs"
                            >
                              {submittingInteraction ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              Log Interaction
                            </button>
                          </div>
                        </motion.form>
                      )}
                    </AnimatePresence>

                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {interactionsLoading ? (
                        <div className="space-y-3">
                          {[1, 2].map(i => (
                            <div key={i} className="flex gap-3">
                              <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-3 w-24 rounded-full" />
                                <Skeleton className="h-12 w-full rounded-xl" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : interactions.length === 0 ? (
                        <div className="text-center py-8 px-4 rounded-[20px] bg-surface-container-low/50 border border-dashed border-outline-variant">
                          <MessageSquare className="w-8 h-8 text-on-surface-variant/20 mx-auto mb-2" />
                          <p className="text-xs font-bold text-on-surface-variant/40 uppercase tracking-wider">No interactions logged yet.</p>
                        </div>
                      ) : (
                        [...interactions].reverse().map(interaction => (
                          <div key={interaction.id} className="flex gap-3 group">
                            <div className="shrink-0 mt-0.5">
                              {interaction.userPhoto ? (
                                <img src={interaction.userPhoto} alt={interaction.userName} className="w-8 h-8 rounded-full border border-outline-variant" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
                                  <UserCircle className="w-5 h-5" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-on-surface uppercase tracking-tight">{interaction.userName}</span>
                                  <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-widest">
                                    {new Date(interaction.dateTime).toLocaleDateString()}
                                  </span>
                                </div>
                                {interaction.duration && (
                                  <span className="text-[10px] font-bold text-on-surface-variant flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> {interaction.duration}
                                  </span>
                                )}
                              </div>
                              <div className="p-3 rounded-2xl rounded-tl-none bg-surface-container-high text-on-surface text-sm leading-relaxed border border-outline-variant/30 group-hover:border-outline-variant transition-colors">
                                {interaction.content}
                              </div>
                              <div className="mt-1 flex items-center gap-2">
                                <span className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">
                                  {interaction.createdAt ? (
                                    `Logged ${new Date(interaction.createdAt).toLocaleDateString()} at ${new Date(interaction.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                  ) : (
                                    'Logging...'
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Team Discussion Section */}
                  <div className="space-y-4 pt-4 border-t border-outline-variant">
                    <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-widest flex items-center gap-2 px-2">
                       Team Discussion ({comments.length})
                    </h3>
                    
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {commentsLoading ? (
                        <div className="space-y-3">
                          {[1, 2].map(i => (
                            <div key={i} className="flex gap-3">
                              <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-3 w-24 rounded-full" />
                                <Skeleton className="h-12 w-full rounded-xl" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : comments.length === 0 ? (
                        <div className="text-center py-6 px-4 rounded-[20px] bg-surface-container-low/50 border border-dashed border-outline-variant">
                          <MessageSquare className="w-8 h-8 text-on-surface-variant/20 mx-auto mb-2" />
                          <p className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-wider">No comments yet. Start the conversation.</p>
                        </div>
                      ) : (
                        comments.map(comment => (
                          <div key={comment.id} className="flex gap-3 group">
                            <div className="shrink-0 mt-0.5">
                              {comment.userPhoto ? (
                                <img src={comment.userPhoto} alt={comment.userName} className="w-8 h-8 rounded-full border border-outline-variant" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
                                  <UserCircle className="w-5 h-5" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-black text-on-surface uppercase tracking-tight">{comment.userName}</span>
                                <span className="text-[10px] font-bold text-on-surface-variant/40">
                                  {comment.createdAt ? (
                                    `${new Date(comment.createdAt).toLocaleDateString()} at ${new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                  ) : (
                                    'Sending...'
                                  )}
                                </span>
                              </div>
                              <div className="p-3 rounded-2xl rounded-tl-none bg-surface-container-high text-on-surface text-sm leading-relaxed border border-outline-variant/30 group-hover:border-outline-variant transition-colors">
                                {comment.text}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* New Comment Input */}
                    <form onSubmit={handleAddComment} className="relative mt-2">
                      <div className="relative group">
                        <textarea
                          placeholder="Add a comment to the discussion..."
                          value={newComment}
                          onChange={e => setNewComment(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleAddComment(e);
                            }
                          }}
                          className="w-full min-h-[80px] p-4 pr-12 rounded-[24px] bg-surface-container-high border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm resize-none"
                        />
                        <button
                          type="submit"
                          disabled={submittingComment || !newComment.trim()}
                          className="absolute right-3 bottom-3 p-2 bg-primary text-on-primary rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-95 transition-all disabled:opacity-50 disabled:shadow-none"
                        >
                          {submittingComment ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Timestamps */}
                  <div className="flex items-center justify-between px-2 pt-2 border-t border-outline-variant/30">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">Last Seen: {contact.lastSeen}</span>
                        <button
                          onClick={handleAIAnalyze}
                          disabled={isAnalyzing}
                          className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary/70 transition-colors disabled:opacity-50"
                          title="Recalculate using AI analysis"
                        >
                          {isAnalyzing ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3 text-primary-active" />
                          )}
                          {isAnalyzing ? 'Analyzing...' : 'AI Recalculate'}
                        </button>
                      </div>
                      {contact.lastSeenAiReason && (
                        <span className="text-[9px] text-primary/60 italic leading-tight max-w-xs">activity: {contact.lastSeenAiReason}</span>
                      )}
                      {contact.needsContactAiReason && (
                        <span className="text-[9px] text-error/70 italic leading-tight max-w-xs">attention: {contact.needsContactAiReason}</span>
                      )}
                      <span className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest">Added: {new Date(contact.createdAt || '').toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-outline-variant shrink-0 flex items-center justify-between bg-surface-container-low/50">
              <div className="hidden sm:block">
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 h-10 rounded-full text-error font-bold text-sm hover:bg-error/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {loading ? <span className="animate-pulse">Deleting...</span> : 'Delete Contact'}
                </button>
              </div>
              
              <div className="flex gap-3 w-full sm:w-auto">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="flex-1 sm:flex-none px-6 h-10 rounded-full font-bold text-on-surface-variant hover:bg-surface-variant text-sm transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      form="edit-contact-form"
                      type="submit"
                      disabled={loading}
                      className="flex-[2] sm:flex-none px-8 h-10 rounded-full bg-primary text-on-primary font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-70"
                    >
                      {loading ? <span className="animate-pulse">Saving...</span> : 'Save Changes'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={onClose}
                    className="w-full sm:w-auto px-8 h-10 rounded-full bg-secondary-container text-on-secondary-container font-bold hover:shadow-md transition-all text-sm"
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
            
            {/* Mobile-only delete button */}
            <div className="sm:hidden px-6 pb-6 pt-0">
               <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 h-10 rounded-full text-error font-bold text-sm border border-error/20 hover:bg-error/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {loading ? <span className="animate-pulse">Deleting...</span> : 'Delete Contact'}
                </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
