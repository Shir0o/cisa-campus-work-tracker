import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  HeartHandshake,
  Zap,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  X,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getUserInitials } from '../lib/utils';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, getDocs, limit } from 'firebase/firestore';
import { useSeason, getAutoSemesterAndSchoolYearTags, SEASON_ORDER, SEASONS, seasonYear, SeasonId } from '../lib/seasons';
import { useAuth } from '../components/AuthProvider';

export const MAJORS = [
  'Computer Science', 'Biology', 'Economics', 'Mech. Engineering', 'Psychology',
  'English Lit', 'Business', 'Architecture', 'Music', 'Math', 'Nursing',
  'Linguistics', 'Civil Eng.', 'Sociology',
];

export const HALLS = [
  'Whitman Hall', 'Ridgewood House', 'Oak Commons', 'Eastfield Apts',
  'Briarcliff', 'Stratton Tower', 'off-campus',
];

export const INTERESTS = [
  'Friday gathering', 'Small group', 'Worship team',
  'Outreach', 'Prayer group', 'Getting discipled',
];

export const HOW_HEARD = [
  'Friend', 'Org Fair', 'Welcome BBQ', 'Dorm flyer', 'Instagram', 'Other',
];

export const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'];

const emptyForm = {
  name: '',
  pronouns: '',
  year: '',
  major: '',
  phone: '',
  email: '',
  instagram: '',
  hall: '',
  howHeard: '',
  openToPrayer: '',
  interests: [] as string[],
  notes: '',
  botField: '',
};

export type SignUpFormState = typeof emptyForm;

const inputCls =
  'w-full h-11 px-3.5 bg-surface-container rounded-xl border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface placeholder:text-on-surface-variant/50';
const textareaCls =
  'w-full px-3.5 py-3 bg-surface-container rounded-xl border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface placeholder:text-on-surface-variant/50 resize-none';

interface SignUpProps {
  onBack?: () => void;
  onSubmitted?: (name: string) => void;
  isMobile?: boolean;
  role?: string;
}

export default function SignUp({ onBack: onBackProp, onSubmitted, isMobile: isMobileProp, role: roleProp }: SignUpProps) {
  const navigate = useNavigate();
  const auth = useAuth();
  const season = useSeason();

  const role = roleProp || auth?.role;
  const isStaffView = role !== 'operator' && role !== 'viewer' && role !== 'student' && role !== 'community';

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<SignUpFormState>(emptyForm);
  const [suMore, setSuMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 720 : false,
  );

  useEffect(() => {
    const checkViewport = () => setIsMobileViewport(window.innerWidth <= 720);
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  const isMobile = isMobileProp !== undefined ? isMobileProp : isMobileViewport;

  const handleBack = () => {
    if (onBackProp) {
      onBackProp();
    } else {
      navigate('/');
    }
  };

  const set = <K extends keyof SignUpFormState>(k: K, v: SignUpFormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const toggleInterest = (i: string) =>
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(i) ? prev.interests.filter((x) => x !== i) : [...prev.interests, i],
    }));

  const resetForm = () => {
    setForm(emptyForm);
    setSuMore(false);
    setError(null);
    setStep(1);
  };

  const submit = async () => {
    setError(null);

    // Anti-abuse honeypot check
    if (form.botField) {
      setStep(3);
      if (onSubmitted) onSubmitted(form.name);
      return;
    }

    if (!form.name.trim()) {
      setError('Please provide your name.');
      setStep(1);
      return;
    }

    setLoading(true);
    try {
      const stagesSnapshot = await getDocs(query(collection(db, 'stages'), limit(1)));
      const firstStage = stagesSnapshot.empty ? 'Lead' : stagesSnapshot.docs[0].data().label;

      const autoTags = getAutoSemesterAndSchoolYearTags();
      const allTags = Array.from(
        new Set([
          'New Sign Up',
          ...autoTags,
          ...season.tags,
          ...(season.clubRush ? ['club-rush'] : []),
        ]),
      );

      const now = new Date();
      const contactData: Record<string, any> = {
        name: form.name.trim(),
        year: form.year || null,
        major: form.major || null,
        pronouns: form.pronouns.trim() || null,
        hall: form.hall || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        instagram: form.instagram.trim() || null,
        location: form.hall || 'Online Form',
        role: 'Student',
        stage: firstStage,
        initials: getUserInitials(form.name),
        notes: [form.notes.trim(), form.openToPrayer.trim() && ('Open to prayer: ' + form.openToPrayer.trim())]
          .filter(Boolean)
          .join(' · '),
        prayerRequest: form.openToPrayer.trim() || null,
        howHeard: form.howHeard || null,
        interests: form.interests,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdTime: now.toISOString(),
        lastSeen: now.toLocaleDateString(),
        tags: allTags,
      };

      if (auth?.user?.uid) {
        contactData.createdBy = auth.user.uid;
        contactData.createdByName = auth.user.displayName || auth.user.email || null;
        contactData.lastContactedById = auth.user.uid;
        contactData.lastContactedBy = auth.user.displayName || auth.user.email || null;
        contactData.lastContactedDate = now.toISOString();
      }

      await addDoc(collection(db, 'contacts'), contactData);

      try {
        await addDoc(collection(db, 'notifications'), {
          userId: 'ALL_ADMINS',
          title: 'New Student Sign-up',
          message: `${form.name} has signed up via the public form.`,
          type: 'event' as const,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notifyError) {
        console.error('Failed to broadcast admin notification:', notifyError);
      }

      setStep(3);
      if (onSubmitted) {
        setTimeout(() => onSubmitted(form.name), 1800);
      }
    } catch (submitError) {
      handleFirestoreError(submitError, OperationType.CREATE, 'contacts');
    } finally {
      setLoading(false);
    }
  };

  const firstName = form.name.trim().split(' ')[0] || 'friend';

  // ── Step 1 Form Body (Shared between Desktop & Mobile) ──────────
  const step1Body = (
    <div>
      <div className="flex flex-col gap-1.5 mb-3.5">
        <label htmlFor="signup-name" className="text-[13px] font-medium text-on-surface-variant">Your name</label>
        <input
          id="signup-name"
          className={inputCls}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="First name is plenty"
        />
      </div>

      <div className="flex flex-col gap-1.5 mb-3.5">
        <label htmlFor="signup-phone" className="text-[13px] font-medium text-on-surface-variant">Phone</label>
        <input
          id="signup-phone"
          className={inputCls}
          type="tel"
          inputMode="tel"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="(___) ___-____"
        />
      </div>

      <p className="qa-enough">That's all we need. The rest is up to you.</p>

      <button
        type="button"
        className={cn('qa-disc', suMore && 'open')}
        onClick={() => setSuMore(!suMore)}
      >
        <b>{suMore ? "That's plenty" : 'Tell us a bit more'}</b>
        <span>{suMore ? '' : 'All optional'}</span>
        <s aria-hidden="true" />
      </button>

      {suMore && (
        <div className="qa-mored">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-pronouns" className="text-[13px] font-medium text-on-surface-variant">Pronouns (optional)</label>
              <input
                id="signup-pronouns"
                className={inputCls}
                value={form.pronouns}
                onChange={(e) => set('pronouns', e.target.value)}
                placeholder="she / her"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-year" className="text-[13px] font-medium text-on-surface-variant">Year</label>
              <select
                id="signup-year"
                className={cn(inputCls, 'cursor-pointer', !form.year && 'text-on-surface-variant/60')}
                value={form.year}
                onChange={(e) => set('year', e.target.value)}
              >
                <option value="">Choose…</option>
                {YEARS.map((y) => (
                  <option key={y} value={y} className="text-on-surface">
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-major" className="text-[13px] font-medium text-on-surface-variant">Major</label>
            <select
              id="signup-major"
              className={cn(inputCls, 'cursor-pointer', !form.major && 'text-on-surface-variant/60')}
              value={form.major}
              onChange={(e) => set('major', e.target.value)}
            >
              <option value="">Choose…</option>
              {MAJORS.map((m) => (
                <option key={m} value={m} className="text-on-surface">
                  {m}
                </option>
              ))}
              <option value="Other / undecided" className="text-on-surface">
                Other / undecided
              </option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-email" className="text-[13px] font-medium text-on-surface-variant">Email</label>
            <input
              id="signup-email"
              className={inputCls}
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="you@umail.edu"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-instagram" className="text-[13px] font-medium text-on-surface-variant">Instagram (optional)</label>
              <input
                id="signup-instagram"
                className={inputCls}
                value={form.instagram}
                onChange={(e) => set('instagram', e.target.value)}
                placeholder="@handle"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-hall" className="text-[13px] font-medium text-on-surface-variant">Where do you live?</label>
              <select
                id="signup-hall"
                className={cn(inputCls, 'cursor-pointer', !form.hall && 'text-on-surface-variant/60')}
                value={form.hall}
                onChange={(e) => set('hall', e.target.value)}
              >
                <option value="">Choose…</option>
                {HALLS.map((h) => (
                  <option key={h} value={h} className="text-on-surface">
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── Step 2 Form Body (Shared between Desktop & Mobile) ──────────
  const step2Body = (
    <div>
      <div className="flex flex-col gap-2 mb-4">
        <label className="text-[13px] font-medium text-on-surface-variant">How did you hear about us?</label>
        <div className="su-chips">
          {HOW_HEARD.map((o) => (
            <button
              type="button"
              key={o}
              onClick={() => set('howHeard', form.howHeard === o ? '' : o)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors cursor-pointer',
                form.howHeard === o
                  ? 'bg-stage-accent-soft text-stage-accent border-stage-accent/40 font-medium'
                  : 'border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-surface',
              )}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        <label className="text-[13px] font-medium text-on-surface-variant">What are you drawn to?</label>
        <div className="su-chips">
          {INTERESTS.map((i) => {
            const active = form.interests.includes(i);
            return (
              <button
                type="button"
                key={i}
                onClick={() => toggleInterest(i)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors cursor-pointer',
                  active
                    ? 'bg-stage-accent-soft text-stage-accent border-stage-accent/40 font-medium'
                    : 'border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-surface',
                )}
              >
                {active && <Check className="w-3.5 h-3.5" />}
                {i}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 mb-3.5">
        <label className="text-[13px] font-medium text-on-surface-variant">Anything we can pray for?</label>
        <textarea
          rows={3}
          className={textareaCls}
          value={form.openToPrayer}
          onChange={(e) => set('openToPrayer', e.target.value)}
          placeholder="Totally optional. We hold these confidentially."
        />
      </div>

      <div className="flex flex-col gap-1.5 mb-3.5">
        <label className="text-[13px] font-medium text-on-surface-variant">Anything else?</label>
        <textarea
          rows={2}
          className={textareaCls}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Allergies, schedule conflicts, questions…"
        />
      </div>

      {/* Anti-abuse: honeypot field (hidden from screen readers & users) */}
      <div className="absolute left-[-9999px] top-auto w-1 h-1 overflow-hidden" aria-hidden="true">
        <label htmlFor="botField">Leave this field blank</label>
        <input
          id="botField"
          name="botField"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.botField}
          onChange={(e) => set('botField', e.target.value)}
        />
      </div>
    </div>
  );

  const stepHead = (
    <div>
      <div className="su-progress">
        <span className="su-step">Step {step} of 2</span>
        <div className="h-1 w-full max-w-[180px] rounded-full bg-surface-container-high overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: step === 1 ? '50%' : '100%' }}
          />
        </div>
      </div>
      <h1 className="font-serif text-2xl lg:text-3xl font-medium tracking-tight text-on-surface mt-1 mb-1">
        {step === 1 ? 'Tell us about you.' : 'And a little more.'}
      </h1>
      <p className="text-sm text-on-surface-variant leading-relaxed mb-4">
        {step === 1
          ? "Just the basics. We'll cover the rest in person."
          : "All optional — skip anything you'd rather not answer."}
      </p>
    </div>
  );

  const successBody = (
    <div className="su-done">
      <div className="su-done-ic">
        <CheckCircle2 className="w-8 h-8" />
      </div>
      <h1 className="font-serif text-2xl lg:text-3xl font-medium tracking-tight text-on-surface">
        {`Thanks, ${firstName}.`}
      </h1>
      <p className="text-[15px] leading-relaxed text-on-surface-variant max-w-[46ch]">
        We got it — you're part of our {season.label} cohort now. Someone from the team — probably Jordan or Ana —
        will reach out within two days. If you'd like, you're always welcome at our Friday gathering this week (7pm,
        Lower Common Room).
      </p>
      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 px-4 h-11 rounded-full border border-outline-variant text-sm text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
        >
          &larr; Back to app
        </button>
        <button
          type="button"
          onClick={resetForm}
          className="px-5 h-11 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
        >
          Add another
        </button>
      </div>
      <div className="su-note mt-4 text-[13px] text-on-surface-variant/80">
        We'll only ever use this to stay in touch with you.
      </div>
    </div>
  );

  // ── Staff Preview Strip (Season Override + Club Rush Toggle) ────
  const adminStrip = (
    <div className="su-admin">
      <div className="su-admin-l">
        <FileText className="w-3.5 h-3.5 shrink-0" />
        <span>You're previewing the sign-up form — how someone new asks to hear from us. It isn't an app account.</span>
      </div>
      <div className="su-admin-r">
        <span className="su-admin-lbl">Tagging sign-ups for</span>
        <select
          className="su-admin-sel"
          value={season.activeId}
          onChange={(e) => season.setSeason(e.target.value as SeasonId)}
        >
          {SEASON_ORDER.map((id) => (
            <option key={id} value={id}>
              {SEASONS[id].label} '{seasonYear()}{id === season.autoId ? ' (now)' : ''}
            </option>
          ))}
        </select>
        {!season.isAuto && (
          <button
            type="button"
            className="su-admin-reset"
            onClick={() => season.resetSeason()}
            title="Back to the current term"
          >
            reset
          </button>
        )}
        <button
          type="button"
          className={cn('su-admin-toggle', season.clubRush && 'on')}
          onClick={() => season.toggleClubRush()}
          title="Turn on during the busy intake weeks"
        >
          <span className="su-admin-knob" />
          Club rush
        </button>
      </div>
    </div>
  );

  // ═══════════════════ MOBILE — Native Single-Column Flow ═══════════════════
  if (isMobile) {
    return (
      <div className="signup-wrap sum min-h-screen bg-surface flex flex-col">
        {isStaffView && adminStrip}

        {step === 3 ? (
          <div className="sum-body sum-done-wrap flex-1 flex flex-col justify-center">{successBody}</div>
        ) : (
          <>
            {/* Compact, warm hero */}
            <div className="sum-hero">
              <div className="sum-hero-top">
                <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center font-serif text-base font-semibold text-on-primary shrink-0">
                  C
                </div>
                <div className="sum-brand min-w-0">
                  <div className="font-semibold text-[15px] text-on-surface leading-tight">CISA Campus</div>
                  <div className="text-xs text-on-surface-variant">Christian Fellowship · {season.label}</div>
                </div>
                <button
                  type="button"
                  className="sum-back"
                  onClick={handleBack}
                  aria-label="Back to app"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {season.clubRush && (
                <div className="su-clubrush">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stage-accent-soft text-stage-accent text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-stage-accent" />
                    {season.active.label} intake · club rush
                  </span>
                </div>
              )}

              <h2 className="sum-hero-title">Hey — we'd love to know you.</h2>
              <p className="sum-hero-lead">
                A community of students figuring out what it means to follow Jesus here. No pressure — just real
                conversations. Takes about two minutes.
              </p>

              <div className="sum-trust">
                {[
                  { icon: Users, label: 'Real people' },
                  { icon: HeartHandshake, label: 'Honest faith' },
                  { icon: Zap, label: '2 minutes' },
                ].map((x) => (
                  <span key={x.label} className="sum-trust-item">
                    <x.icon className="w-3.5 h-3.5" />
                    {x.label}
                  </span>
                ))}
              </div>
            </div>

            {/* The form */}
            <div className="sum-body flex-1">
              {stepHead}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mb-3"
                  >
                    <div className="bg-error/10 text-error px-4 py-2.5 rounded-xl text-sm font-medium">{error}</div>
                  </motion.div>
                )}
              </AnimatePresence>

              {step === 1 ? step1Body : step2Body}
              <div className="su-note mt-3">We hold your details with care, and never share them.</div>
            </div>

            {/* Sticky, thumb-reachable action bar */}
            <div className="sum-bar">
              {step === 1 ? (
                <>
                  <button
                    type="button"
                    className="sum-bar-sec px-4 text-sm text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                    onClick={handleBack}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="sum-bar-pri inline-flex items-center gap-2 px-5 h-12 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
                    onClick={() => {
                      if (!form.name.trim()) {
                        setError('Please provide your name.');
                        return;
                      }
                      setError(null);
                      setStep(2);
                    }}
                    disabled={!form.name.trim()}
                  >
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="sum-bar-sec px-4 text-sm text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                    onClick={() => {
                      setError(null);
                      setStep(1);
                    }}
                  >
                    &larr; Back
                  </button>
                  <button
                    type="button"
                    className="sum-bar-pri inline-flex items-center gap-2 px-5 h-12 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
                    onClick={submit}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Sending…
                      </>
                    ) : (
                      <>
                        Send it <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ═══════════════════ DESKTOP — Two-Panel Welcome ═══════════════════
  return (
    <div className="signup-wrap min-h-screen bg-surface flex flex-col">
      {isStaffView && adminStrip}

      <div className="signup flex-1">
        {/* ── Left: A warm welcome ── */}
        <div className="signup-hero">
          <div className="su-brand">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center font-serif text-lg font-semibold text-on-primary shadow-sm shrink-0">
              C
            </div>
            <div>
              <div className="su-brand-name">CISA Campus</div>
              <div className="su-brand-sub">Christian Fellowship · {season.label}</div>
            </div>
            <button
              type="button"
              className="ml-auto text-[13px] text-on-surface-variant hover:text-on-surface transition-colors whitespace-nowrap cursor-pointer px-3 py-1.5 rounded-lg hover:bg-surface-container-high"
              onClick={handleBack}
            >
              &larr; Back to app
            </button>
          </div>

          <div>
            {season.clubRush && (
              <div className="su-clubrush">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stage-accent-soft text-stage-accent text-xs font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-stage-accent" />
                  {season.active.label} intake · club rush
                </span>
              </div>
            )}
            <h2 className="su-hero-title">
              Hey — we'd love
              <br />
              to know you.
            </h2>
            <p className="su-hero-lead">
              We're a community of students figuring out what it means to follow Jesus on this campus. No assumptions,
              no pressure — just real conversations, shared meals, and questions held with honesty.
            </p>
          </div>

          <div className="su-feats">
            {[
              {
                icon: Users,
                title: 'Real people',
                body: 'Show up to a meal, a small group, or just a coffee.',
              },
              {
                icon: HeartHandshake,
                title: 'Honest faith',
                body: 'Bring your questions. Nothing is off-limits.',
              },
              {
                icon: Zap,
                title: 'Two minutes',
                body: "This takes about 120 seconds. We'll reach out within two days.",
              },
            ].map((item) => (
              <div key={item.title} className="su-feat">
                <div className="su-feat-ic">
                  <item.icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="su-feat-t">{item.title}</div>
                  <div className="su-feat-b">{item.body}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="su-note mt-auto">
            We hold your details with care, and never share them. You can ask us to remove them any time.
          </div>
        </div>

        {/* ── Right: The form ── */}
        <div className="signup-form">
          {step === 3 ? (
            successBody
          ) : (
            <>
              {stepHead}

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mb-4"
                  >
                    <div className="bg-error/10 text-error px-4 py-3 rounded-xl text-sm font-medium">{error}</div>
                  </motion.div>
                )}
              </AnimatePresence>

              {step === 1 && (
                <div>
                  {step1Body}
                  <div className="flex items-center justify-between mt-6 pt-2">
                    <button
                      type="button"
                      className="text-sm text-on-surface-variant hover:text-on-surface transition-colors px-3 py-2 cursor-pointer"
                      onClick={handleBack}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 px-5 h-11 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
                      onClick={() => {
                        if (!form.name.trim()) {
                          setError('Please provide your name.');
                          return;
                        }
                        setError(null);
                        setStep(2);
                      }}
                      disabled={!form.name.trim()}
                    >
                      Continue <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  {step2Body}
                  <div className="flex items-center justify-between mt-6 pt-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors px-3 py-2 cursor-pointer"
                      onClick={() => {
                        setError(null);
                        setStep(1);
                      }}
                    >
                      &larr; Back
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 px-5 h-11 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
                      onClick={submit}
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Sending…
                        </>
                      ) : (
                        <>
                          Send it <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
