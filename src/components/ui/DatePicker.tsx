import React, { useState, useRef, useEffect } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  parseISO, 
  isValid,
  startOfToday,
  isBefore,
  addYears,
  subYears,
  setMonth as setDateMonth,
  setYear as setDateYear,
  getYear,
  getMonth
} from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface DatePickerProps {
  label: string;
  value: string; // ISO format yyyy-mm-dd
  onChange: (value: string) => void;
  required?: boolean;
}

export default function DatePicker({ label, value, onChange, required }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedDate = value ? parseISO(value) : null;
  const [viewDate, setViewDate] = useState(selectedDate && isValid(selectedDate) ? selectedDate : startOfToday());
  const [view, setView] = useState<'calendar' | 'month' | 'year'>('calendar');

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleDateSelect = (date: Date) => {
    onChange(format(date, 'yyyy-MM-dd'));
    setIsOpen(false);
  };

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const days = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const currentYear = getYear(viewDate);
  const years = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i);

  return (
    <div className="relative space-y-1.5" ref={containerRef}>
      <label className="text-[10px] font-black text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
        <CalendarIcon className="w-3 h-3" /> {label}
      </label>
      
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setView('calendar');
          if (selectedDate && isValid(selectedDate)) {
            setViewDate(selectedDate);
          }
        }}
        className={cn(
          "w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface text-sm flex items-center justify-between text-left",
          isOpen && "border-primary ring-1 ring-primary"
        )}
      >
        <span>{selectedDate && isValid(selectedDate) ? format(selectedDate, 'MMM d, yyyy') : 'Select date'}</span>
        <CalendarIcon className="w-4 h-4 text-on-surface-variant" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute left-0 right-0 mt-2 z-[110] bg-surface-container-highest rounded-3xl shadow-2xl border border-outline-variant overflow-hidden"
          >
            {/* M3 Header */}
            <div className="bg-surface-container px-6 py-4 border-b border-outline-variant">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Select date</p>
              <h3 className="text-xl font-bold text-on-surface">
                {selectedDate && isValid(selectedDate) ? format(selectedDate, 'EEE, MMM d') : format(viewDate, 'EEE, MMM d')}
              </h3>
            </div>

            {/* Calendar Controls */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setView(view === 'month' ? 'calendar' : 'month')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-on-surface/5 text-sm font-medium text-on-surface transition-colors"
                  >
                    {format(viewDate, 'MMMM')}
                    <ChevronDown className={cn("w-4 h-4 transition-transform", view === 'month' && "rotate-180")} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setView(view === 'year' ? 'calendar' : 'year')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-on-surface/5 text-sm font-medium text-on-surface transition-colors"
                  >
                    {format(viewDate, 'yyyy')}
                    <ChevronDown className={cn("w-4 h-4 transition-transform", view === 'year' && "rotate-180")} />
                  </button>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setViewDate(subMonths(viewDate, 1))}
                    className="p-2 rounded-full hover:bg-on-surface/5 text-on-surface-variant transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewDate(addMonths(viewDate, 1))}
                    className="p-2 rounded-full hover:bg-on-surface/5 text-on-surface-variant transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* View Switcher */}
              <div className="relative min-h-[250px]">
                {view === 'calendar' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-7 gap-1"
                  >
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
                      <div key={day} className="h-10 flex items-center justify-center text-[10px] font-bold text-on-surface-variant uppercase">
                        {day}
                      </div>
                    ))}
                    {days.map((day, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleDateSelect(day)}
                        className={cn(
                          "h-10 w-full rounded-full flex items-center justify-center text-xs transition-all relative group",
                          !isSameMonth(day, monthStart) && "text-on-surface-variant/30",
                          isSameMonth(day, monthStart) && "text-on-surface hover:bg-primary/10",
                          selectedDate && isSameDay(day, selectedDate) && "bg-primary text-on-primary hover:bg-primary",
                          isSameDay(day, startOfToday()) && !isSameDay(day, selectedDate || 0) && "border border-primary text-primary"
                        )}
                      >
                        {format(day, 'd')}
                        {isSameDay(day, startOfToday()) && !isSameDay(day, selectedDate || 0) && (
                          <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}

                {view === 'month' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-3 gap-2"
                  >
                    {months.map((m, i) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setViewDate(setDateMonth(viewDate, i));
                          setView('calendar');
                        }}
                        className={cn(
                          "h-12 rounded-xl flex items-center justify-center text-xs font-medium transition-all",
                          getMonth(viewDate) === i ? "bg-primary text-on-primary" : "hover:bg-on-surface/5 text-on-surface"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </motion.div>
                )}

                {view === 'year' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-3 gap-2 h-[250px] overflow-y-auto custom-scrollbar pr-1"
                  >
                    {years.map(y => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => {
                          setViewDate(setDateYear(viewDate, y));
                          setView('calendar');
                        }}
                        className={cn(
                          "h-12 rounded-xl flex items-center justify-center text-xs font-medium transition-all",
                          getYear(viewDate) === y ? "bg-primary text-on-primary" : "hover:bg-on-surface/5 text-on-surface"
                        )}
                      >
                        {y}
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 bg-surface-container flex justify-end gap-2 border-t border-outline-variant">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 rounded-full text-primary text-xs font-bold hover:bg-primary/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
