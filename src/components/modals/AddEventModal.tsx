import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, Tag, Plus, Loader2, RefreshCw } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { collection, addDoc, writeBatch, doc } from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { addDays, addWeeks, addMonths, format, parseISO, getDay, startOfMonth, endOfMonth, getWeekOfMonth, isBefore, isSameDay } from 'date-fns';

import DatePicker from '../ui/DatePicker';

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEventCount: number;
}

type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly';
type MonthlyType = 'same-day' | 'relative-day';

const DAYS = [
  { label: 'S', labelFull: 'Sunday', value: 0 },
  { label: 'M', labelFull: 'Monday', value: 1 },
  { label: 'T', labelFull: 'Tuesday', value: 2 },
  { label: 'W', labelFull: 'Wednesday', value: 3 },
  { label: 'T', labelFull: 'Thursday', value: 4 },
  { label: 'F', labelFull: 'Friday', value: 5 },
  { label: 'S', labelFull: 'Saturday', value: 6 },
];

export default function AddEventModal({ isOpen, onClose, currentEventCount }: AddEventModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    isRecurring: false,
    recurrenceType: 'weekly' as RecurrenceType,
    recurrenceEndDate: format(addMonths(new Date(), 1), 'yyyy-MM-dd'),
    recurrenceDays: [] as number[],
    monthlyType: 'same-day' as MonthlyType
  });

  useEffect(() => {
    // Initialize recurrence days if empty
    if (formData.date && formData.recurrenceDays.length === 0) {
      const day = getDay(parseISO(formData.date));
      setFormData(f => ({ ...f, recurrenceDays: [day] }));
    }
  }, [formData.date, formData.recurrenceDays.length]);

  const getNthDayOfMonth = (date: Date, dayOfWeek: number, weekIndex: number) => {
    const monthStart = startOfMonth(date);
    let count = 0;
    let current = monthStart;

    // Find the Nth occurrence of dayOfWeek in the month
    while (current.getMonth() === monthStart.getMonth()) {
      if (getDay(current) === dayOfWeek) {
        count++;
        if (count === weekIndex) return current;
      }
      current = addDays(current, 1);
    }
    
    // Fallback: If not found (e.g. some months don't have a 5th Monday), 
    // find the LAST occurrence of that day in the month
    current = endOfMonth(date);
    while (getDay(current) !== dayOfWeek) {
      current = addDays(current, -1);
    }
    return current;
  };

  const getWeekOrdinal = (date: Date) => {
    const weekIndex = Math.ceil(date.getDate() / 7);
    const ordinals = ['1st', '2nd', '3rd', '4th', '5th'];
    return ordinals[weekIndex - 1] || 'last';
  };

  const getRecurrenceSummary = () => {
    if (!formData.isRecurring) return null;
    const date = parseISO(formData.date);
    const endDate = parseISO(formData.recurrenceEndDate);
    
    let summary = '';
    switch (formData.recurrenceType) {
      case 'daily':
        summary = 'Every day';
        break;
      case 'weekly':
        const dayNames = formData.recurrenceDays
          .sort((a, b) => a - b)
          .map(d => DAYS.find(day => day.value === d)?.labelFull);
        summary = `Every ${dayNames.join(', ')}`;
        break;
      case 'monthly':
        if (formData.monthlyType === 'same-day') {
          summary = `Monthly on the ${format(date, 'do')}`;
        } else {
          summary = `Monthly on the ${getWeekOrdinal(date)} ${format(date, 'EEEE')}`;
        }
        break;
    }
    
    return `${summary} until ${format(endDate, 'MMM d, yyyy')}`;
  };

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
      if (formData.isRecurring && formData.recurrenceEndDate) {
        const startDate = parseISO(formData.date);
        const endDate = parseISO(formData.recurrenceEndDate);
        const startDayOfWeek = getDay(startDate);
        const weekOfMonthIndex = Math.ceil(startDate.getDate() / 7);
        
        const occurrences: Date[] = [];
        let currentDate = startDate;
        const maxOccurrences = 100;
        
        while (occurrences.length < maxOccurrences) {
          let eventDate: Date;
          const idx = occurrences.length;
          
          if (idx === 0) {
            eventDate = startDate;
          } else {
            switch (formData.recurrenceType) {
              case 'daily':
                eventDate = addDays(currentDate, 1);
                break;
              case 'weekly':
                let next = addDays(currentDate, 1);
                const allowedDays = formData.recurrenceDays.length > 0 ? formData.recurrenceDays : [startDayOfWeek];
                while (!allowedDays.includes(getDay(next))) {
                  next = addDays(next, 1);
                }
                eventDate = next;
                break;
              case 'monthly':
                if (formData.monthlyType === 'same-day') {
                  eventDate = addMonths(startDate, idx);
                } else {
                  const nextMonth = addMonths(startDate, idx);
                  eventDate = getNthDayOfMonth(nextMonth, startDayOfWeek, weekOfMonthIndex);
                }
                break;
              default:
                eventDate = addWeeks(currentDate, 1);
            }
          }

          if (isBefore(eventDate, endDate) || isSameDay(eventDate, endDate)) {
            currentDate = eventDate;
            occurrences.push(eventDate);
          } else {
            break;
          }
        }

        const batch = writeBatch(db);
        occurrences.forEach((eventDate, i) => {
          const eventRef = doc(collection(db, 'events'));
          batch.set(eventRef, {
            name: formData.name.trim(),
            date: format(eventDate, 'yyyy-MM-dd'),
            order: currentEventCount + i,
            isRecurring: true,
            recurrenceType: formData.recurrenceType,
            recurrenceEndDate: formData.recurrenceEndDate,
            recurrenceDays: formData.recurrenceType === 'weekly' ? formData.recurrenceDays : null,
            monthlyType: formData.recurrenceType === 'monthly' ? formData.monthlyType : null,
            createdAt: new Date().toISOString()
          });
        });
        
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
        date: format(new Date(), 'yyyy-MM-dd'),
        isRecurring: false,
        recurrenceType: 'weekly',
        recurrenceEndDate: format(addMonths(new Date(), 1), 'yyyy-MM-dd'),
        recurrenceDays: [getDay(new Date())],
        monthlyType: 'same-day'
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
                <DatePicker 
                  label="Date"
                  value={formData.date}
                  onChange={val => setFormData(f => ({ ...f, date: val }))}
                  required
                />

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
                            onChange={e => {
                              const newType = e.target.value as RecurrenceType;
                              setFormData(f => ({ 
                                ...f, 
                                recurrenceType: newType,
                                // Reset days if switching away from weekly
                                recurrenceDays: newType === 'weekly' ? f.recurrenceDays : f.recurrenceDays
                              }));
                            }}
                            className="w-full h-10 px-3 rounded-xl bg-surface-container-high border border-outline outline-none text-xs text-on-surface"
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </div>
                        <div className="space-y-1.5 text-left">
                          <DatePicker 
                            label="End By"
                            value={formData.recurrenceEndDate}
                            onChange={val => setFormData(f => ({ ...f, recurrenceEndDate: val }))}
                          />
                        </div>
                      </div>

                      {/* Weekly Day Selection */}
                      {formData.recurrenceType === 'weekly' && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-on-surface-variant uppercase px-1 tracking-wider">Repeat on</label>
                          <div className="flex justify-between gap-1">
                            {DAYS.map(day => (
                              <button
                                key={day.value}
                                type="button"
                                onClick={() => {
                                  setFormData(f => {
                                    const days = f.recurrenceDays.includes(day.value)
                                      ? f.recurrenceDays.filter(d => d !== day.value)
                                      : [...f.recurrenceDays, day.value];
                                    // Don't allow empty selection
                                    return days.length > 0 ? { ...f, recurrenceDays: days } : f;
                                  });
                                }}
                                className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all",
                                  formData.recurrenceDays.includes(day.value)
                                    ? "bg-primary text-on-primary"
                                    : "bg-surface-container-high text-on-surface-variant border border-outline/30 hover:border-outline"
                                )}
                              >
                                {day.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Monthly Options */}
                      {formData.recurrenceType === 'monthly' && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-on-surface-variant uppercase px-1 tracking-wider">Repeat on</label>
                          <div className="grid grid-cols-1 gap-2">
                            <button
                              type="button"
                              onClick={() => setFormData(f => ({ ...f, monthlyType: 'same-day' }))}
                              className={cn(
                                "w-full h-10 px-4 rounded-xl flex items-center justify-between text-xs transition-all border text-left",
                                formData.monthlyType === 'same-day'
                                  ? "bg-primary/10 border-primary text-primary font-bold"
                                  : "bg-surface-container-high border-outline/30 text-on-surface-variant hover:border-outline"
                              )}
                            >
                              <span>Same day of month ({formData.date ? format(parseISO(formData.date), 'do') : ''})</span>
                              {formData.monthlyType === 'same-day' && <Plus className="w-3 h-3" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormData(f => ({ ...f, monthlyType: 'relative-day' }))}
                              className={cn(
                                "w-full h-10 px-4 rounded-xl flex items-center justify-between text-xs transition-all border text-left",
                                formData.monthlyType === 'relative-day'
                                  ? "bg-primary/10 border-primary text-primary font-bold"
                                  : "bg-surface-container-high border-outline/30 text-on-surface-variant hover:border-outline"
                              )}
                            >
                              <span>
                                {formData.date 
                                  ? `${getWeekOrdinal(parseISO(formData.date))} ${format(parseISO(formData.date), 'EEEE')} of month` 
                                  : 'Relative day of month'}
                              </span>
                              {formData.monthlyType === 'relative-day' && <Plus className="w-3 h-3" />}
                            </button>
                          </div>
                          
                          {/* Summary Badge */}
                          <div className="mt-2 p-2 px-3 rounded-lg bg-primary/5 border border-primary/10 flex items-start gap-2">
                            <Calendar className="w-3 h-3 text-primary mt-0.5" />
                            <p className="text-[10px] font-medium text-primary leading-tight">
                              {getRecurrenceSummary()}
                            </p>
                          </div>
                        </div>
                      )}
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
                      {formData.isRecurring ? 'Create Schedule' : 'Create Event'}
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
