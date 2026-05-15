import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Briefcase, MapPin, Mail, Phone, Loader2, Calendar, Tag, MessageSquare } from 'lucide-react';
import { db, handleFirestoreError, OperationType, logActivity, sendNotification } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { cn, formatPhoneNumber, validatePhoneNumber } from '../../lib/utils';
import { useAuth } from '../AuthProvider';
import { Contact, Stage } from '../../types';

interface NewContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NewContactModal({ isOpen, onClose }: NewContactModalProps) {
  const { user } = useAuth();
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
        tags: formData.tags,
        notes: formData.notes,
        initials: getInitials(formData.firstName, formData.lastName),
        lastSeen: 'Just now',
        createdAt: new Date().toISOString(),
        serverCreatedAt: serverTimestamp(),
        createdBy: user?.uid,
        createdByName: user?.displayName || 'Tony Wang',
        hasNewActivity: true,
        attendance: {}
      };

      const docRef = await addDoc(collection(db, 'contacts'), contactData);
      
      const fieldsLog = [
        `Group: ${formData.role}`,
        `Stage: ${formData.stage}`,
        `First Met: ${formData.location}`,
        formData.email ? `Email: ${formData.email}` : '',
        formData.phone ? `Phone: ${formData.phone}` : '',
        formData.tags.length > 0 ? `Tags: ${formData.tags.join(', ')}` : '',
        formData.notes ? `Notes: ${formData.notes}` : ''
      ].filter(Boolean).join('\n');

      logActivity({
        action: 'created a new contact',
        targetId: docRef.id,
        targetName: fullName,
        targetType: 'contact',
        type: 'create',
        description: fieldsLog
      });

      if (user) {
        await sendNotification({
          userId: user.uid,
          title: 'Contact Created',
          message: `Successfully added ${fullName} to your directory.`,
          type: 'success',
          link: '/directory',
          targetId: docRef.id
        });
      }

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
        tags: [],
        notes: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'contacts');
    } finally {
      setLoading(false);
    }
  };

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
            className="relative w-full max-w-2xl bg-surface-container rounded-[28px] shadow-2xl border border-outline-variant overflow-hidden flex flex-col max-h-full"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-xl">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-on-surface">New Contact</h2>
                  <p className="text-sm text-on-surface-variant font-medium">Add a new connection to your network</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <div className="overflow-y-auto custom-scrollbar flex-1 p-6">
              <form id="new-contact-form" onSubmit={handleSubmit} className="space-y-6">
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
                    <Briefcase className="w-3.5 h-3.5" /> CONTACT GROUP
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
                    <Calendar className="w-3.5 h-3.5" /> PIPELINE STAGE
                  </label>
                  <select
                    value={formData.stage}
                    onChange={e => setFormData(f => ({ ...f, stage: e.target.value }))}
                    className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary outline-none transition-all text-sm text-on-surface appearance-none cursor-pointer"
                  >
                    {stages.map(s => (
                      <option key={s.id} value={s.label}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Tags */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                    <Tag className="w-3.5 h-3.5" /> TAGS (COMMA SEPARATED)
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
                  <label className="text-xs font-bold text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                    <MessageSquare className="w-3.5 h-3.5" /> NOTES
                  </label>
                  <textarea
                    required
                    value={formData.notes}
                    onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                    className="w-full min-h-[120px] p-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface resize-none"
                    placeholder="Add some context about this contact..."
                  />
                </div>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-outline-variant shrink-0 flex items-center gap-3 bg-surface-container-low/50">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-full font-bold text-primary hover:bg-primary/5 transition-all text-sm cursor-pointer"
            >
              Cancel
            </button>
            <button
              form="new-contact-form"
              disabled={loading}
              type="submit"
              className="flex-[2] h-11 rounded-full bg-primary text-on-primary font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed text-sm"
            >
              {loading ? (
                <span className="animate-pulse">Adding Contact...</span>
              ) : (
                'Add Contact'
              )}
            </button>
          </div>
        </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
