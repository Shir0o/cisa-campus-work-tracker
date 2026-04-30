import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Briefcase, MapPin, Mail, Phone, Loader2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType, logActivity } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { cn, formatPhoneNumber, validatePhoneNumber } from '../../lib/utils';
import { Contact, Stage } from '../../types';

interface NewContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NewContactModal({ isOpen, onClose }: NewContactModalProps) {
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    role: '',
    location: '',
    email: '',
    phone: '',
    stage: '',
    status: 'Needs Contact' as Contact['status'],
    tags: [] as string[],
    notes: ''
  });
  const [stages, setStages] = useState<Stage[]>([]);

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
    if (isOpen) {
      const fetchStages = async () => {
        try {
          const q = query(collection(db, 'stages'), orderBy('order', 'asc'));
          const querySnapshot = await getDocs(q);
          const stageData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Stage[];
          setStages(stageData);
          
          if (stageData.length > 0) {
            setFormData(f => ({ ...f, stage: stageData[0].label }));
          } else {
            setFormData(f => ({ ...f, stage: 'First Contact' }));
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, 'stages');
          setFormData(f => ({ ...f, stage: 'First Contact' }));
        }
      };
      fetchStages();
    }
  }, [isOpen]);

  const capitalize = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const getInitials = (firstName: string, lastName: string) => {
    return (firstName.charAt(0) + (lastName.charAt(0) || '')).toUpperCase();
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneError) return;
    setLoading(true);

    try {
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();
      const contactData = {
        name: fullName,
        role: formData.role,
        location: formData.location,
        email: formData.email,
        phone: formData.phone,
        stage: formData.stage,
        status: formData.status,
        tags: formData.tags,
        notes: formData.notes,
        initials: getInitials(formData.firstName, formData.lastName),
        lastSeen: 'Just now',
        createdAt: new Date().toISOString(),
        serverCreatedAt: serverTimestamp(),
        hasNewActivity: true,
        attendance: {}
      };

      const docRef = await addDoc(collection(db, 'contacts'), contactData);
      
      logActivity({
        action: 'created a new contact',
        targetId: docRef.id,
        targetName: fullName,
        targetType: 'contact',
        type: 'create'
      });

      onClose();
      // Reset form
      setFormData({
        firstName: '',
        lastName: '',
        role: '',
        location: '',
        email: '',
        phone: '',
        stage: formData.stage,
        status: 'Needs Contact',
        tags: [],
        notes: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'contacts');
    } finally {
      setLoading(false);
    }
  };

  const statusOptions = ['Needs Contact', 'Email Sent', 'Qualified Lead', 'Follow Up Required', 'Meeting Scheduled'];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 md:p-10">
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
            className="relative w-full max-w-lg bg-surface-container rounded-[28px] shadow-2xl border border-outline-variant overflow-hidden flex flex-col max-h-full"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between shrink-0">
              <h2 className="text-xl font-bold text-on-surface">New Contact</h2>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* First Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                    <User className="w-3.5 h-3.5" /> FIRST NAME
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.firstName}
                    onChange={e => setFormData(f => ({ ...f, firstName: capitalize(e.target.value) }))}
                    className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface"
                    placeholder="e.g. Alex"
                  />
                </div>

                {/* Last Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                    <User className="w-3.5 h-3.5" /> LAST NAME
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={e => setFormData(f => ({ ...f, lastName: capitalize(e.target.value) }))}
                    className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface"
                    placeholder="e.g. Johnson"
                  />
                </div>

                {/* Status (role) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                    <Briefcase className="w-3.5 h-3.5" /> STATUS
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.role}
                    onChange={e => setFormData(f => ({ ...f, role: e.target.value }))}
                    className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface"
                    placeholder="e.g. Student, Faculty"
                  />
                </div>

                {/* First Met (location) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                    <MapPin className="w-3.5 h-3.5" /> FIRST MET
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.location}
                    onChange={e => setFormData(f => ({ ...f, location: e.target.value }))}
                    className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface"
                    placeholder="e.g. Campus Coffee"
                  />
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                    <Mail className="w-3.5 h-3.5" /> EMAIL
                  </label>
                  <input
                    required
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                    className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface"
                    placeholder="alex@campus.edu"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                    <Phone className="w-3.5 h-3.5" /> PHONE
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
                      "w-full h-11 px-4 rounded-xl bg-surface-container-high border outline-none transition-all text-sm text-on-surface",
                      phoneError ? "border-error focus:border-error focus:ring-1 focus:ring-error" : "border-outline focus:border-primary focus:ring-1 focus:ring-primary"
                    )}
                    placeholder="(555) 000-0000"
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

                {/* Stage selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                    <MapPin className="w-3.5 h-3.5" /> STAGE
                  </label>
                  <select
                    value={formData.stage}
                    onChange={e => setFormData(f => ({ ...f, stage: e.target.value }))}
                    className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary outline-none transition-all text-sm text-on-surface appearance-none"
                  >
                    {stages.map(s => (
                      <option key={s.id} value={s.label}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Interaction Status */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                    <X className="w-3.5 h-3.5 rotate-45" /> INTERACTION STATUS
                  </label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData(f => ({ ...f, status: e.target.value as Contact['status'] }))}
                    className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary outline-none transition-all text-sm text-on-surface appearance-none"
                  >
                    {statusOptions.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                {/* Tags */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                    TAGS (COMMA SEPARATED)
                  </label>
                  <input
                    type="text"
                    value={formData.tags.join(', ')}
                    onChange={e => setFormData(f => ({ 
                      ...f, 
                      tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) 
                    }))}
                    placeholder="e.g. Lead, Fall2023"
                    className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">NOTES</label>
                  <textarea
                    required
                    value={formData.notes}
                    onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                    className="w-full min-h-[100px] p-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface resize-none"
                    placeholder="Add some context about this contact..."
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 flex gap-3 sticky bottom-0 bg-surface-container pb-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-12 rounded-full font-bold text-primary hover:bg-primary/5 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={loading}
                  type="submit"
                  className="flex-[2] h-12 rounded-full bg-primary text-on-primary font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="animate-pulse">Adding Contact...</span>
                  ) : (
                    'Add Contact'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
