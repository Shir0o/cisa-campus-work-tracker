import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Briefcase, MapPin, HeartHandshake, Mail, Phone, Loader2, Calendar, Tag, MessageSquare, Sparkles } from 'lucide-react';
import { db, handleFirestoreError, OperationType, logActivity, sendNotification } from '../../lib/firebase';
import { isTrainee, fullTimerIds } from '../../lib/walking';
import { stampPartners } from '../../lib/partners';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { cn, formatPhoneNumber, validatePhoneNumber } from '../../lib/utils';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import { useSeason } from '../../lib/seasons';
import { UsageStats } from '../../lib/usageStats';
import { Contact, Stage, MET_VIA } from '../../types';
import { inferGenderFromName, genderTag } from '../../lib/gender';
import { normalizeTagList, TAG_SUGGESTIONS, tagStyle } from '../../lib/tags';

interface NewContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-select a stage (e.g. opened from a board column's "Add to …"). */
  initialStage?: string;
}

export default function NewContactModal({ isOpen, onClose, initialStage }: NewContactModalProps) {
  const { user, role } = useAuth();
  const { t } = useLanguage();
  if (role === 'viewer') return null;
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    role: '',
    metVia: '',
    location: '',
    email: '',
    phone: '',
    stage: '',
    gender: '',
    tags: [] as string[],
    notes: '',
    spiritualBackground: ''
  });
  const [tagInput, setTagInput] = useState('');
  // Once the staffer touches the Gender field, stop re-inferring it from the
  // first name on every keystroke — their explicit choice wins.
  const genderManuallySet = useRef(false);
  const [stages, setStages] = useState<Stage[]>([]);
  const [showMore, setShowMore] = useState(false);
  const season = useSeason();

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

          const fallback = stageData.length > 0 ? stageData[0].label : 'First Contact';
          const validStages = new Set<string>(['Unassigned', ...stageData.map(s => s.label)]);
          const stage = initialStage && validStages.has(initialStage) ? initialStage : fallback;
          setFormData(f => ({ ...f, stage }));
        } catch (error) {
          setFormData(f => ({ ...f, stage: initialStage || 'First Contact' }));
          handleFirestoreError(error, OperationType.LIST, 'stages');
        }
      };
      fetchStages();
    }
  }, [isOpen, initialStage]);

  const capitalize = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const getInitials = (firstName: string, lastName: string) => {
    return (firstName.charAt(0) + (lastName.charAt(0) || '')).toUpperCase();
  };

  const handlePhoneBlur = () => {
    if (!formData.phone || !formData.phone.trim()) {
      setPhoneError(null);
      return;
    }
    const formatted = formatPhoneNumber(formData.phone);
    setFormData(f => ({ ...f, phone: formatted }));
    
    if (!validatePhoneNumber(formData.phone)) {
      const digits = formData.phone.replace(/[^\d]/g, '');
      if (digits.length > 0 && digits.length < 10) {
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
    if (!formData.firstName.trim()) return;
    if (phoneError) return;
    setLoading(true);

    try {
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();
      // Auto-tag gender from the first name (editable above), and surface it as
      const autoGenderTag = genderTag(formData.gender);
      const typedTags = tagInput.split(',').map((t) => t.trim()).filter(Boolean);
      const allFormTags = [...formData.tags, ...typedTags];
      const contactData = {
        name: fullName,
        role: formData.role,
        metVia: formData.metVia,
        location: formData.location,
        email: formData.email,
        phone: formData.phone,
        stage: formData.stage,
        gender: formData.gender,
        // Stamp the active season cohort (+ "Club Rush" during intake) alongside
        // any tags the staffer typed, so the contact is findable by cohort later.
        tags: normalizeTagList([...allFormTags, ...season.tags, ...(autoGenderTag ? [autoGenderTag] : [])]),
        notes: formData.notes,
        spiritualBackground: formData.spiritualBackground,
        initials: getInitials(formData.firstName, formData.lastName),
        lastSeen: 'Just now',
        createdAt: new Date().toISOString(),
        serverCreatedAt: serverTimestamp(),
        createdBy: user?.uid,
        createdByName: user?.displayName || 'Tony Wang',
        hasNewActivity: true,
        attendance: {}
      };
      // Gospel partners: a person either member of a pair brings in is shared
      // with the other from the moment they're added (stamped as a co-creator).
      stampPartners(contactData, user?.uid);

      const docRef = await addDoc(collection(db, 'contacts'), contactData);
      
      const fieldsLog = [
        `Group: ${formData.role}`,
        `Stage: ${formData.stage}`,
        formData.metVia ? `How we met: ${formData.metVia}` : '',
        formData.location ? `Address: ${formData.location}` : '',
        formData.email ? `Email: ${formData.email}` : '',
        formData.phone ? `Phone: ${formData.phone}` : '',
        formData.spiritualBackground ? `Spiritual Background: ${formData.spiritualBackground}` : '',
        formData.gender ? `Gender: ${formData.gender}` : '',
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

      // No pairing (#549): when a trainee adds someone, the whole full-timer
      // team is told, so nothing the team does goes unseen.
      if (isTrainee(user?.uid)) {
        const who = (user?.displayName || "A trainee").split(" ")[0];
        for (const ftId of fullTimerIds()) {
          await sendNotification({
            userId: ftId,
            title: `${who} added ${fullName}`,
            message: 'A new person in your circle — take a look when you can.',
            type: 'assignment',
            targetId: docRef.id,
          });
        }
      }

      if (user?.uid) {
        UsageStats.record(user.uid, {
          type: 'create',
          path: typeof window !== 'undefined' ? window.location.pathname : '/',
          role: role || undefined,
          meta: 'contact',
        });
      }

      onClose();
      // Reset form
      setFormData({
        firstName: '',
        lastName: '',
        role: '',
        metVia: '',
        location: '',
        email: '',
        phone: '',
        stage: formData.stage,
        gender: '',
        tags: [],
        notes: '',
        spiritualBackground: ''
      });
      setTagInput('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'contacts');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-10">
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
                <div className="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-semibold text-xl">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-semibold text-on-surface">{t('modals.new_contact')}</h2>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-stage-accent-soft text-stage-accent text-[11px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-stage-accent" />
                      {season.label}{season.clubRush ? ' · club rush' : ''}
                    </span>
                  </div>
                  <p className="text-sm text-on-surface-variant font-medium">{t('modals.tagged_for_season')}</p>
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
                    <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
                      <User className="w-3.5 h-3.5" /> THEIR NAME
                    </label>
                    <input
                      required
                      type="text"
                      value={formData.firstName}
                      onChange={e => {
                        const name = e.target.value;
                        setFormData(f => {
                          const next = { ...f, firstName: name };
                          // Auto-tag gender from the first name until the
                          // staffer overrides it manually.
                          if (!genderManuallySet.current) {
                            const inferred = inferGenderFromName(name);
                            if (inferred) next.gender = inferred;
                          }
                          return next;
                        });
                      }}
                      onBlur={e => setFormData(f => ({ ...f, firstName: capitalize(e.target.value) }))}
                      className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface"
                      placeholder={t('modals.first_name_placeholder')}
                    />
                  </div>

                  {/* Phone */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
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
                          className="text-[10px] font-semibold text-error px-1  "
                        >
                          {phoneError}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <p className="text-xs text-on-surface-variant/80 italic px-1">
                  That's enough to follow up. You can fill in the rest whenever you learn it.
                </p>

                {/* Disclosure toggle button */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowMore(prev => !prev)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline cursor-pointer"
                  >
                    {showMore ? '− Show less' : '+ Add the rest (optional details)'}
                  </button>
                </div>

                {showMore && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-outline-variant/40"
                  >
                    {/* Last Name */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
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
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
                        <Briefcase className="w-3.5 h-3.5" /> CONTACT GROUP
                      </label>
                      <input
                        type="text"
                        value={formData.role}
                        onChange={e => setFormData(f => ({ ...f, role: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface"
                        placeholder="e.g. Student, Faculty"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
                        <User className="w-3.5 h-3.5" /> GENDER (M/F)
                      </label>
                      <select
                        value={formData.gender}
                        onChange={e => {
                          genderManuallySet.current = true;
                          setFormData(f => ({ ...f, gender: e.target.value }));
                        }}
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary outline-none transition-all text-sm appearance-none cursor-pointer"
                      >
                        <option value="">Auto (from name)</option>
                        <option value="M">M</option>
                        <option value="F">F</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
                        <HeartHandshake className="w-3.5 h-3.5" /> HOW WE MET
                      </label>
                      <select
                        value={formData.metVia}
                        onChange={e => setFormData(f => ({ ...f, metVia: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary outline-none transition-all text-sm text-on-surface appearance-none cursor-pointer"
                      >
                        <option value="">{t('modals.how_we_met_placeholder')}</option>
                        {MET_VIA.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
                        <MapPin className="w-3.5 h-3.5" /> ADDRESS
                      </label>
                      <input
                        type="text"
                        value={formData.location}
                        onChange={e => setFormData(f => ({ ...f, location: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface"
                        placeholder="e.g. Miller Hall, off-campus"
                      />
                    </div>

                    {/* Email */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
                        <Mail className="w-3.5 h-3.5" /> EMAIL
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface"
                        placeholder="alex@campus.edu"
                      />
                    </div>

                    {/* Stage selector */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
                        <Calendar className="w-3.5 h-3.5" /> WHERE THEY'RE AT
                      </label>
                      <select
                        aria-label={t('modals.stage')}
                        value={formData.stage}
                        onChange={e => setFormData(f => ({ ...f, stage: e.target.value }))}
                        className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary outline-none transition-all text-sm text-on-surface appearance-none cursor-pointer"
                      >
                        <option value="Unassigned">{t('modals.unassigned')}</option>
                        {stages.map(s => (
                      <option key={s.id} value={s.label}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Tags */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
                    <Tag className="w-3.5 h-3.5" /> TAGS (COMMA SEPARATED)
                  </label>
                  {formData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {formData.tags.map((tag) => (
                        <span
                          key={tag}
                          style={tagStyle(tag)}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--tone-soft)] text-[var(--tone)] text-xs font-medium border border-outline-variant/40"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => setFormData((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }))}
                            className="hover:opacity-75 cursor-pointer ml-0.5 text-xs font-bold leading-none"
                            title={t('modals.contactDetails.remove_tag')}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="e.g. Gospel, Fall2023"
                    className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface"
                  />
                  {TAG_SUGGESTIONS.filter((s) => !formData.tags.includes(s)).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5 pt-0.5">
                      {TAG_SUGGESTIONS.filter((s) => !formData.tags.includes(s)).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            if (!formData.tags.includes(s)) {
                              setFormData((f) => ({ ...f, tags: [...f.tags, s] }));
                            }
                          }}
                          style={tagStyle(s)}
                          className="px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--tone-soft)] text-[var(--tone)] hover:opacity-80 transition-opacity border border-outline-variant/30 cursor-pointer"
                        >
                          + {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Spiritual Background Field */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
                    <Sparkles className="w-3.5 h-3.5" /> SPIRITUAL BACKGROUND
                  </label>
                  <select
                    value={formData.spiritualBackground}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, spiritualBackground: e.target.value }))
                    }
                    className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm appearance-none"
                  >
                    <option value="">{t('modals.select_background')}</option>
                    <option value="Christian">{t('modals.christian')}</option>
                    <option value="Catholic">{t('modals.catholic')}</option>
                    <option value="Other">{t('modals.other_religion')}</option>
                    <option value="None">{t('modals.none')}</option>
                  </select>
                </div>

                {/* Notes */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
                    <MessageSquare className="w-3.5 h-3.5" /> NOTES
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                    className="w-full min-h-[120px] p-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface resize-none"
                    placeholder="Add some context about this contact..."
                  />
                </div>
              </motion.div>
            )}
          </form>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-outline-variant shrink-0 flex items-center gap-3 bg-surface-container-low/50">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-full font-semibold text-accent hover:bg-primary/5 transition-all text-sm cursor-pointer"
            >
              Cancel
            </button>
            <button
              form="new-contact-form"
              disabled={loading}
              type="submit"
              className="flex-[2] h-11 rounded-full bg-primary text-on-primary font-semibold   hover: active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed text-sm"
            >
              {loading ? (
                <span className="animate-pulse">{t('modals.adding_contact')}</span>
              ) : (
                t('modals.add_contact')
              )}
            </button>
          </div>
        </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
