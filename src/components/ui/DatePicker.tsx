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

  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');

  // Handle placement & clicking outside to close
  useEffect(() => {
    if (!isOpen) return;

    const updatePlacement = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        if (spaceBelow < 380 && spaceAbove > spaceBelow) {
          setPlacement('top');
        } else {
          setPlacement('bottom');
        }
      }
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleDateSelect = (date: Date) => {
    onChange(format(date, 'yyyy-MM-dd'));
    setIsOpen(false);
  };

  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [parseHint, setParseHint] = useState<string | null>(null);

  // Sync value to inputValue when NOT focused
  useEffect(() => {
    if (!isFocused) {
      if (value) {
        const parsed = parseISO(value);
        if (isValid(parsed)) {
          setInputValue(format(parsed, 'MMM d, yyyy'));
        } else {
          setInputValue(value);
        }
      } else {
        setInputValue('');
      }
      setParseHint(null);
    }
  }, [value, isFocused]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    
    if (!val.trim()) {
      setParseHint(null);
      onChange('');
      return;
    }

    const parsed = parseSmartDate(val);
    if (parsed) {
      setParseHint(`Matches: ${format(parsed, 'EEE, MMM d, yyyy')}`);
      onChange(format(parsed, 'yyyy-MM-dd'));
    } else {
      setParseHint('Type date (e.g. "tomorrow", "Friday", "7/18")');
    }
  };

  const handleInputBlur = () => {
    // Small timeout to allow click events on calendar to register before blur resets state
    setTimeout(() => {
      setIsFocused(false);
    }, 150);
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
      <label className="text-xs font-medium text-on-surface-variant flex items-center gap-2 px-1">
        <CalendarIcon className="w-3 h-3" /> {label}
      </label>
      
      <div
        className={cn(
          "w-full h-11 rounded-xl bg-surface-container-high border border-outline focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all text-on-surface text-sm flex items-center justify-between overflow-hidden",
          isOpen && "border-primary ring-1 ring-primary"
        )}
      >
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            setIsFocused(true);
            setIsOpen(true);
            setView('calendar');
            if (selectedDate && isValid(selectedDate)) {
              setViewDate(selectedDate);
            }
          }}
          onBlur={handleInputBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
              setIsOpen(false);
            }
          }}
          placeholder='Type a date (e.g. "Friday", "tomorrow")'
          className="flex-1 h-full bg-transparent border-0 outline-none px-4 text-on-surface text-sm placeholder:text-on-surface-variant/40"
        />
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            setView('calendar');
            if (selectedDate && isValid(selectedDate)) {
              setViewDate(selectedDate);
            }
          }}
          aria-label="Toggle calendar picker"
          className="h-full px-3 text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center border-l border-outline/20"
        >
          <CalendarIcon className="w-4 h-4 text-on-surface-variant" />
        </button>
      </div>

      {parseHint && (
        <div className="text-[11.5px] text-accent/90 font-medium px-1 flex items-center gap-1 mt-1 transition-all">
          {parseHint}
        </div>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: placement === 'top' ? -10 : 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: placement === 'top' ? -10 : 10, scale: 0.95 }}
            className={cn(
              "absolute left-0 right-0 z-[110] bg-surface-container-highest rounded-3xl shadow-2xl border border-outline-variant overflow-hidden max-h-[min(380px,80vh)] overflow-y-auto custom-scrollbar",
              placement === 'top' ? "bottom-full mb-2" : "top-full mt-2"
            )}
          >
            {/* M3 Header */}
            <div className="bg-surface-container px-6 py-4 border-b border-outline-variant">
              <p className="text-xs font-medium text-on-surface-variant mb-1">Select date</p>
              <h3 className="text-xl font-semibold text-on-surface">
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
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                      <div key={`${day}-${idx}`} className="h-10 flex items-center justify-center text-[10px] font-medium text-on-surface-variant">
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
                          isSameDay(day, startOfToday()) && !isSameDay(day, selectedDate || 0) && "border border-primary text-accent"
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
                className="px-4 py-2 rounded-full text-accent text-xs font-medium hover:bg-primary/5 transition-colors"
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

function parseSmartDate(input: string, referenceDate: Date = new Date()): Date | null {
  const str = input.trim().toLowerCase();
  if (!str) return null;

  const baseDate = new Date(referenceDate);
  baseDate.setHours(0, 0, 0, 0);

  // 1. Relative terms
  if (str === 'today') {
    return baseDate;
  }
  if (str === 'tomorrow' || str === 'tmr') {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (str === 'yesterday') {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - 1);
    return d;
  }

  // 2. Weekdays
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const weekdayAbbreviations: Record<string, string> = {
    'sun': 'sunday', 'mon': 'monday', 'tue': 'tuesday', 'wed': 'wednesday', 'thu': 'thursday', 'fri': 'friday', 'sat': 'saturday'
  };

  let targetWeekday = str;
  let isNextWeek = false;

  if (str.startsWith('next ')) {
    targetWeekday = str.slice(5);
    isNextWeek = true;
  }

  const cleanWeekday = weekdayAbbreviations[targetWeekday] || targetWeekday;
  const weekdayIndex = weekdays.indexOf(cleanWeekday);

  if (weekdayIndex !== -1) {
    const currentWeekdayIndex = baseDate.getDay();
    let daysToAdd = weekdayIndex - currentWeekdayIndex;
    
    if (daysToAdd <= 0 && !isNextWeek) {
      daysToAdd += 7;
    } else if (isNextWeek) {
      if (daysToAdd < 0) {
        daysToAdd += 14;
      } else {
        daysToAdd += 7;
      }
    }
    const d = new Date(baseDate);
    d.setDate(d.getDate() + daysToAdd);
    return d;
  }

  // 3. "in N days/weeks/months"
  const inPattern = /^(?:in\s+)?(\d+)\s+(day|week|month)s?$/i;
  const matchIn = str.match(inPattern);
  if (matchIn) {
    const amount = parseInt(matchIn[1], 10);
    const unit = matchIn[2].toLowerCase();
    const d = new Date(baseDate);
    if (unit === 'day') {
      d.setDate(d.getDate() + amount);
    } else if (unit === 'week') {
      d.setDate(d.getDate() + amount * 7);
    } else if (unit === 'month') {
      d.setMonth(d.getMonth() + amount);
    }
    return d;
  }

  if (str === 'next week') {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + 7);
    return d;
  }

  // 4. M/D or M/D/Y formats
  const dateSlashPattern = /^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/;
  const matchSlash = str.match(dateSlashPattern);
  if (matchSlash) {
    const month = parseInt(matchSlash[1], 10) - 1;
    const day = parseInt(matchSlash[2], 10);
    let year = matchSlash[3] ? parseInt(matchSlash[3], 10) : baseDate.getFullYear();
    if (matchSlash[3] && matchSlash[3].length === 2) {
      year += 2000;
    }
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      if (!matchSlash[3] && d < baseDate) {
        d.setFullYear(year + 1);
      }
      return d;
    }
  }

  // YYYY-MM-DD
  const isoPattern = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/;
  const matchIso = str.match(isoPattern);
  if (matchIso) {
    const year = parseInt(matchIso[1], 10);
    const month = parseInt(matchIso[2], 10) - 1;
    const day = parseInt(matchIso[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // 5. Month Name DD (e.g. July 18, Jul 18)
  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  const monthAbbrs: Record<string, string> = {
    'jan': 'january', 'feb': 'february', 'mar': 'march', 'apr': 'april', 'may': 'may', 'jun': 'june',
    'jul': 'july', 'aug': 'august', 'sep': 'september', 'oct': 'october', 'nov': 'november', 'dec': 'december'
  };

  const monthWordPattern = /^([a-z]{3,9})\s+(\d{1,2})(?:\s*,\s*(\d{2,4}))?$/i;
  const matchMonthWord = str.match(monthWordPattern);
  if (matchMonthWord) {
    const mName = matchMonthWord[1];
    const cleanMName = monthAbbrs[mName] || mName;
    const mIndex = monthNames.indexOf(cleanMName);
    if (mIndex !== -1) {
      const day = parseInt(matchMonthWord[2], 10);
      let year = matchMonthWord[3] ? parseInt(matchMonthWord[3], 10) : baseDate.getFullYear();
      if (matchMonthWord[3] && matchMonthWord[3].length === 2) {
        year += 2000;
      }
      const d = new Date(year, mIndex, day);
      if (!isNaN(d.getTime())) {
        if (!matchMonthWord[3] && d < baseDate) {
          d.setFullYear(year + 1);
        }
        return d;
      }
    }
  }

  // DD Month (e.g. 18 July, 18 Jul)
  const dayMonthPattern = /^(\d{1,2})\s+([a-z]{3,9})(?:\s*,\s*(\d{2,4}))?$/i;
  const matchDayMonth = str.match(dayMonthPattern);
  if (matchDayMonth) {
    const mName = matchDayMonth[2];
    const cleanMName = monthAbbrs[mName] || mName;
    const mIndex = monthNames.indexOf(cleanMName);
    if (mIndex !== -1) {
      const day = parseInt(matchDayMonth[1], 10);
      let year = matchDayMonth[3] ? parseInt(matchDayMonth[3], 10) : baseDate.getFullYear();
      if (matchDayMonth[3] && matchDayMonth[3].length === 2) {
        year += 2000;
      }
      const d = new Date(year, mIndex, day);
      if (!isNaN(d.getTime())) {
        if (!matchDayMonth[3] && d < baseDate) {
          d.setFullYear(year + 1);
        }
        return d;
      }
    }
  }

  // Fallback to standard JS Date parsing, but avoid misinterpreting short numeric strings as epoch milliseconds.
  const isNumericOnly = /^\d+$/.test(input);
  if (isNumericOnly && input.length !== 4) {
    return null;
  }

  const fallback = new Date(input);
  if (!isNaN(fallback.getTime())) {
    return fallback;
  }

  return null;
}
