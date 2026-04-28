import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Briefcase, MapPin, Mail, Phone, Loader2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { Contact } from '../../types';

interface NewContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NewContactModal({ isOpen, onClose }: NewContactModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    location: '',
    email: '',
    phone: '',
    stage: 'New' as Contact['stage'],
    notes: ''
  });

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const contactData = {
        ...formData,
        initials: getInitials(formData.name),
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
        name: '',
        role: '',
        location: '',
        email: '',
        phone: '',
        stage: 'New',
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg bg-surface-container rounded-[28px] shadow-2xl border border-outline-variant overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between">
              <h2 className="text-xl font-bold text-on-surface">New Contact</h2>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium text-on-surface-variant flex items-center gap-2">
                    <User className="w-4 h-4" /> Full Name
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                    className="w-full h-12 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
                    placeholder="e.g. Alex Johnson"
                  />
                </div>

                {/* Role */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-on-surface-variant flex items-center gap-2">
                    <Briefcase className="w-4 h-4" /> Role
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.role}
                    onChange={e => setFormData(f => ({ ...f, role: e.target.value }))}
                    className="w-full h-12 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
                    placeholder="e.g. Student, Faculty"
                  />
                </div>

                {/* Location */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-on-surface-variant flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> Location
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={e => setFormData(f => ({ ...f, location: e.target.value }))}
                    className="w-full h-12 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
                    placeholder="e.g. Building A"
                  />
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-on-surface-variant flex items-center gap-2">
                    <Mail className="w-4 h-4" /> Email
                  </label>
                  <input
                    required
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                    className="w-full h-12 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
                    placeholder="alex@campus.edu"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-on-surface-variant flex items-center gap-2">
                    <Phone className="w-4 h-4" /> Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                    className="w-full h-12 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>

                {/* Stage */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium text-on-surface-variant">Lead Stage</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {['New', 'First Contact', 'Second Contact', 'Regular'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFormData(f => ({ ...f, stage: s as any }))}
                        className={cn(
                          "h-10 rounded-lg text-xs font-semibold transition-all border cursor-pointer",
                          formData.stage === s 
                            ? "bg-primary text-on-primary border-primary" 
                            : "bg-surface-container-highest text-on-surface-variant border-outline hover:border-primary"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium text-on-surface-variant">Initial Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                    className="w-full min-h-[100px] p-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface resize-none"
                    placeholder="Add some context about this contact..."
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 flex gap-3">
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
                    <Loader2 className="w-5 h-5 animate-spin" />
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
