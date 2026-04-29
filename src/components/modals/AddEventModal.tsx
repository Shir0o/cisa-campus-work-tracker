import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, Tag, Plus, Loader2, RefreshCw } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { collection, addDoc, writeBatch, doc } from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { addDays, addWeeks, addMonths, format, parseISO } from 'date-fns';

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEventCount: number;
}

type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly';

export default function AddEventModal({ isOpen, onClose, currentEventCount }: AddEventModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0],
    isRecurring: false,
    recurrenceType: 'weekly' as RecurrenceType,
    recurrenceCount: 4
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.date) return;
    
    setLoading(true);

    try {
      if (formData.isRecurring && formData.recurrenceCount > 1) {
        const batch = writeBatch(db);
        const startDate = parseISO(formData.date);
        
        for (let i = 0; i < formData.recurrenceCount; i++) {
          let eventDate: Date;
          switch (formData.recurrenceType) {
            case 'daily':
              eventDate = addDays(startDate, i);
              break;
            case 'weekly':
              eventDate = addWeeks(startDate, i);
              break;
            case 'monthly':
              eventDate = addMonths(startDate, i);
              break;
            default:
              eventDate = startDate;
          }

          const eventRef = doc(collection(db, 'events'));
          batch.set(eventRef, {
            name: formData.name + (formData.recurrenceCount > 1 ? ` (${i + 1})` : ''),
            date: format(eventDate, 'yyyy-MM-dd'),
            order: currentEventCount + i,
            isRecurring: true,
            recurrenceType: formData.recurrenceType,
            recurrenceCount: formData.recurrenceCount,
            createdAt: new Date().toISOString()
          });
        }
        await batch.commit();
      } else {
        await addDoc(collection(db, 'events'), {
          name: formData.name,
          date: formData.date,
          order: currentEventCount,
          isRecurring: false,
          recurrenceType: 'none',
          createdAt: new Date().toISOString()
        });
      }
      
      setFormData({ 
        name: '', 
        date: new Date().toISOString().split('T')[0],
        isRecurring: false,
        recurrenceType: 'weekly',
        recurrenceCount: 4
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'events');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-6 overflow-y-auto pb-12">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[-1]"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="relative w-full max-w-sm bg-surface-container rounded-3xl shadow-2xl border border-outline-variant overflow-hidden"
          >
            {/* Header */}
            <div className="px-5 py-3 border-b border-outline-variant flex items-center justify-between pointer-events-auto">
              <h2 className="text-sm font-black uppercase tracking-widest text-on-surface-variant">New Event</h2>
              <button 
                onClick={onClose}
                className="p-1.5 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="space-y-4">
                {/* Event Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                    <Tag className="w-3 h-3" /> Event Name
                  </label>
                  <input
                    required
                    autoFocus
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                    className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface text-sm"
                    placeholder="e.g. Wednesday Workshop"
                  />
                </div>

                {/* Event Date */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                    <Calendar className="w-3 h-3" /> Date
                  </label>
                  <input
                    required
                    type="date"
                    value={formData.date}
                    onChange={e => setFormData(f => ({ ...f, date: e.target.value }))}
                    className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface text-sm"
                  />
                </div>

                {/* Recurrence Toggle */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-container-high border border-outline/30">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                      formData.isRecurring ? "bg-primary/10 text-primary" : "bg-on-surface/5 text-on-surface-variant"
                    )}>
                      <RefreshCw className={cn("w-4 h-4", formData.isRecurring && "animate-spin-slow")} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-on-surface">Recurring Event</p>
                      <p className="text-[10px] text-on-surface-variant">Repeat this event</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData(f => ({ ...f, isRecurring: !f.isRecurring }))}
                    className={cn(
                      "w-10 h-6 rounded-full relative transition-colors duration-200 ease-in-out cursor-pointer",
                      formData.isRecurring ? "bg-primary" : "bg-outline"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ease-in-out",
                      formData.isRecurring && "translate-x-4"
                    )} />
                  </button>
                </div>

                {/* Recurrence Options */}
                <AnimatePresence>
                  {formData.isRecurring && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-4 overflow-hidden"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] font-black text-on-surface-variant uppercase px-1 tracking-wider">Frequency</label>
                          <select
                            value={formData.recurrenceType}
                            onChange={e => setFormData(f => ({ ...f, recurrenceType: e.target.value as RecurrenceType }))}
                            className="w-full h-10 px-3 rounded-xl bg-surface-container-high border border-outline outline-none text-xs text-on-surface"
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </div>
                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] font-black text-on-surface-variant uppercase px-1 tracking-wider">Occurrences</label>
                          <input
                            type="number"
                            min="2"
                            max="52"
                            value={formData.recurrenceCount}
                            onChange={e => setFormData(f => ({ ...f, recurrenceCount: parseInt(e.target.value) }))}
                            className="w-full h-10 px-3 rounded-xl bg-surface-container-high border border-outline outline-none text-xs text-on-surface"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Actions */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-10 rounded-xl font-bold text-xs text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={loading || !formData.name || !formData.date}
                  type="submit"
                  className="flex-[1.5] h-10 rounded-xl bg-primary text-on-primary font-bold text-xs shadow-md shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale cursor-pointer"
                >
                  {loading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-3 h-3" />
                      {formData.isRecurring ? `Create ${formData.recurrenceCount} Events` : 'Create Event'}
                    </>
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
