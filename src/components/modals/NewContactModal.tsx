import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Briefcase, MapPin, Mail, Phone, Loader2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { Contact, Stage } from '../../types';

interface NewContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NewContactModal({ isOpen, onClose }: NewContactModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    role: '',
    location: '',
    email: '',
    phone: '',
    stage: '',
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
    if (isOpen) {
      const fetchDefaultStage = async () => {
        try {
          const q = query(collection(db, 'stages'), orderBy('order', 'asc'), limit(1));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const firstStage = querySnapshot.docs[0].data() as Stage;
            setFormData(f => ({ ...f, stage: firstStage.label }));
          } else {
            // Fallback if no stages exist yet
            setFormData(f => ({ ...f, stage: 'First Contact' }));
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, 'stages');
          setFormData(f => ({ ...f, stage: 'First Contact' }));
        }
      };
      fetchDefaultStage();
    }
  }, [isOpen]);

  const capitalize = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const getInitials = (firstName: string, lastName: string) => {
    return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        notes: formData.notes,
        initials: getInitials(formData.firstName, formData.lastName),
        status: 'Needs Contact',
        lastSeen: 'Just now',
        createdAt: new Date().toISOString(),
        serverCreatedAt: serverTimestamp(), // For firestore rules consistency if needed
        hasNewActivity: true,
        attendance: {}
      };

      await addDoc(collection(db, 'contacts'), contactData);
      onClose();
      // Reset form
      setFormData({
        firstName: '',
        lastName: '',
        role: '',
        location: '',
        email: '',
        phone: '',
        stage: formData.stage, // Keep current stage as default for next entry
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
                  <label className="text-sm font-bold text-on-surface-variant flex items-center gap-2 px-1">
                    <User className="w-4 h-4" /> FIRST NAME
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.firstName}
                    onChange={e => setFormData(f => ({ ...f, firstName: capitalize(e.target.value) }))}
                    className="w-full h-12 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
                    placeholder="e.g. Alex"
                  />
                </div>

                {/* Last Name */}
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-on-surface-variant flex items-center gap-2 px-1">
                    <User className="w-4 h-4" /> LAST NAME
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={e => setFormData(f => ({ ...f, lastName: capitalize(e.target.value) }))}
                    className="w-full h-12 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
                    placeholder="e.g. Johnson"
                  />
                </div>

                {/* Status (formerly Role) */}
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-on-surface-variant flex items-center gap-2 px-1">
                    <Briefcase className="w-4 h-4" /> STATUS
                  </label>
                  <input
                    type="text"
                    value={formData.role}
                    onChange={e => setFormData(f => ({ ...f, role: e.target.value }))}
                    className="w-full h-12 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
                    placeholder="e.g. Student, Faculty"
                  />
                </div>

                {/* First Met (formerly Location) */}
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-on-surface-variant flex items-center gap-2 px-1">
                    <MapPin className="w-4 h-4" /> FIRST MET
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={e => setFormData(f => ({ ...f, location: e.target.value }))}
                    className="w-full h-12 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
                    placeholder="e.g. Campus Coffee"
                  />
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-on-surface-variant flex items-center gap-2 px-1">
                    <Mail className="w-4 h-4" /> EMAIL
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                    className="w-full h-12 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
                    placeholder="alex@campus.edu"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-on-surface-variant flex items-center gap-2 px-1">
                    <Phone className="w-4 h-4" /> PHONE
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                    className="w-full h-12 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>



                {/* Notes */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-bold text-on-surface-variant px-1 uppercase tracking-wider">NOTES</label>
                  <textarea
                    required
                    value={formData.notes}
                    onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                    className="w-full min-h-[100px] p-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface resize-none"
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
