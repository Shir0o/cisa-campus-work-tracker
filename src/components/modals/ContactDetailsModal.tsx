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
  ChevronRight
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { doc, updateDoc, deleteDoc, collection, query, orderBy, getDocs } from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { Contact, Stage } from '../../types';

interface ContactDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
}

export default function ContactDetailsModal({ isOpen, onClose, contact }: ContactDetailsModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);
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
          console.error("Error fetching stages:", error);
        }
      };
      fetchStages();
    }
  }, [isOpen]);

  if (!contact) return null;

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
                        onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                      />
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

                  {/* Timestamps */}
                  <div className="flex items-center justify-between px-2 text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">
                    <span>Last Seen: {contact.lastSeen}</span>
                    <span>Created: {new Date(contact.createdAt || '').toLocaleDateString()}</span>
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
                  {loading ? 'Deleting...' : 'Delete Contact'}
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
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
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
                  {loading ? 'Deleting...' : 'Delete Contact'}
                </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
