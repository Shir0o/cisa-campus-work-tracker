import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  HeartHandshake,
  Zap,
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronDown,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getUserInitials } from '../lib/utils';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, getDocs, limit } from 'firebase/firestore';

// ── Intake options (mirrors docs/design/project/data.jsx) ──────────────
const MAJORS = [
  'Computer Science', 'Biology', 'Economics', 'Mech. Engineering', 'Psychology',
  'English Lit', 'Business', 'Architecture', 'Music', 'Math', 'Nursing',
  'Linguistics', 'Civil Eng.', 'Sociology',
];
const HALLS = [
  'Whitman Hall', 'Ridgewood House', 'Oak Commons', 'Eastfield Apts',
  'Briarcliff', 'Stratton Tower', 'off-campus',
];
const YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'];
const HOW_HEARD = ['Friend', 'Org Fair', 'Welcome BBQ', 'Dorm flyer', 'Instagram', 'Other'];
const INTERESTS = ['Friday gathering', 'Small group', 'Worship team', 'Outreach', 'Prayer group', '1:1 mentorship'];
// Values kept identical to the old form so Directory / Global Search filters stay consistent.
const SPIRITUAL: { value: string; label: string }[] = [
  { value: 'Exploring', label: 'Exploring faith' },
  { value: 'Christian', label: 'Christian' },
  { value: 'Catholic', label: 'Catholic' },
  { value: 'Other', label: 'Other religion / background' },
  { value: 'None', label: 'Prefer not to say' },
];

const FEATURES = [
  { icon: Users, title: 'Real people', body: 'Show up to a meal, a small group, or just a coffee.' },
  { icon: HeartHandshake, title: 'Honest faith', body: 'Bring your questions. Nothing is off-limits.' },
  { icon: Zap, title: 'Two minutes', body: "This takes about 120 seconds. We'll reach out within two days." },
];

const emptyForm = {
  name: '',
  pronouns: '',
  year: '',
  major: '',
  phone: '',
  email: '',
  instagram: '',
  hall: '',
  spiritualBackground: '',
  howHeard: '',
  interests: [] as string[],
  prayerRequest: '',
  notes: '',
  botField: '', // honeypot
};
type FormState = typeof emptyForm;

const inputCls =
  'w-full h-11 px-3.5 bg-surface-container rounded-xl border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface placeholder:text-on-surface-variant/50';
const textareaCls =
  'w-full px-3.5 py-3 bg-surface-container rounded-xl border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface placeholder:text-on-surface-variant/50 resize-none';

// ── Small local form primitives (no shared form lib exists) ────────────
function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-medium text-on-surface-variant">
        {label}
        {optional && <span className="text-on-surface-variant/60"> (optional)</span>}
      </label>
      {children}
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: (string | { value: string; label: string })[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputCls, 'appearance-none pr-9 cursor-pointer', !value && 'text-on-surface-variant/60')}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value;
          const l = typeof o === 'string' ? o : o.label;
          return (
            <option key={v} value={v} className="text-on-surface">
              {l}
            </option>
          );
        })}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors',
        active
          ? 'bg-stage-accent-soft text-stage-accent border-stage-accent/40'
          : 'border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-surface',
      )}
    >
      {children}
    </button>
  );
}

export default function SignUp() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Anti-abuse math challenge
  const [mathChallenge, setMathChallenge] = useState({ a: 0, b: 0 });
  const [mathAnswer, setMathAnswer] = useState('');

  useEffect(() => {
    setMathChallenge({ a: Math.floor(Math.random() * 10) + 1, b: Math.floor(Math.random() * 10) + 1 });
  }, []);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((prev) => ({ ...prev, [k]: v }));
  const toggleInterest = (i: string) =>
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(i) ? prev.interests.filter((x) => x !== i) : [...prev.interests, i],
    }));

  // Step-1 required checks — preserves the old form's validation rules.
  const validateBasics = (): string | null => {
    if (!form.name.trim()) return 'Please enter your full name.';
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) return 'Please enter a valid email address.';
    if (!form.phone.trim()) return 'Please enter your phone number.';
    if (!form.spiritualBackground) return 'Please let us know where you are with faith.';
    return null;
  };

  const goNext = () => {
    const err = validateBasics();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep(2);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setMathAnswer('');
    setMathChallenge({ a: Math.floor(Math.random() * 10) + 1, b: Math.floor(Math.random() * 10) + 1 });
    setError(null);
    setStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Enter from step 1 advances rather than submitting.
    if (step === 1) {
      goNext();
      return;
    }
    setError(null);

    // Anti-abuse: honeypot — silently "succeed" with no write.
    if (form.botField) {
      setStep(3);
      return;
    }
    // Anti-abuse: math challenge.
    if (parseInt(mathAnswer) !== mathChallenge.a + mathChallenge.b) {
      setError("Hmm, that didn't quite add up — mind trying the math again?");
      return;
    }
    // Safety: re-check the required basics from step 1.
    const err = validateBasics();
    if (err) {
      setError(err);
      setStep(1);
      return;
    }

    setLoading(true);
    try {
      // Assign the first stage (Lead/New) to the new contact.
      const stagesSnapshot = await getDocs(query(collection(db, 'stages'), limit(1)));
      const firstStage = stagesSnapshot.empty ? 'Lead' : stagesSnapshot.docs[0].data().label;

      const contactData = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        location: form.hall || 'Online Form',
        role: 'Student',
        stage: firstStage,
        initials: getUserInitials(form.name),
        notes: form.notes.trim(),
        spiritualBackground: form.spiritualBackground,
        pronouns: form.pronouns.trim(),
        year: form.year,
        major: form.major,
        instagram: form.instagram.trim(),
        howHeard: form.howHeard,
        interests: form.interests,
        prayerRequest: form.prayerRequest.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastSeen: new Date().toLocaleDateString(),
        tags: ['New Sign Up'],
      };

      await addDoc(collection(db, 'contacts'), contactData);

      // Notify admins/managers about the new public sign-up.
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
    } catch (submitError) {
      handleFirestoreError(submitError, OperationType.CREATE, 'contacts');
    } finally {
      setLoading(false);
    }
  };

  const firstName = form.name.trim().split(' ')[0] || 'friend';

  // ── Brand mark (shared logo with serif "C" fallback, matches Sidebar) ──
  const brandLogo = (
    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-sm overflow-hidden shrink-0">
      <img
        src="/logo.svg"
        alt="CISA Campus"
        className="w-full h-full object-contain"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          if (target.parentElement) {
            target.parentElement.classList.add('font-serif', 'text-lg', 'font-semibold', 'text-on-primary');
            target.parentElement.textContent = 'C';
          }
        }}
      />
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-surface grid grid-cols-1 lg:grid-cols-[1.04fr_1fr]">
      {/* ── Left: a warm welcome ── */}
      <aside
        className="flex flex-col gap-8 p-8 lg:p-[60px] border-b lg:border-b-0 lg:border-r border-outline-variant"
        style={{
          background:
            'radial-gradient(135% 95% at 6% 4%, var(--stage-accent-soft), transparent 56%), var(--surface-container-low)',
        }}
      >
        <div className="flex items-center gap-3">
          {brandLogo}
          <div className="min-w-0">
            <div className="font-serif text-base font-semibold text-on-surface leading-tight">CISA Campus</div>
            <div className="text-[13px] text-on-surface-variant">Christian Fellowship &middot; Spring &rsquo;26</div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="ml-auto text-[13px] text-on-surface-variant hover:text-on-surface transition-colors whitespace-nowrap"
          >
            &larr; Back to app
          </button>
        </div>

        <div>
          <h2 className="font-serif text-4xl font-medium tracking-tight text-on-surface leading-[1.1]">
            Hey &mdash; we&rsquo;d love
            <br />
            to know you.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-on-surface-variant max-w-[46ch]">
            We&rsquo;re a community of students figuring out what it means to follow Jesus on this campus. No
            assumptions, no pressure &mdash; just real conversations, shared meals, and questions held with honesty.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-3.5 p-4 bg-surface border border-outline-variant rounded-xl shadow-sm"
            >
              <div className="w-9 h-9 rounded-lg bg-stage-accent-soft text-stage-accent flex items-center justify-center shrink-0">
                <f.icon className="w-[18px] h-[18px]" />
              </div>
              <div>
                <div className="text-sm font-semibold text-on-surface">{f.title}</div>
                <div className="text-[13px] text-on-surface-variant leading-relaxed">{f.body}</div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[13px] text-on-surface-variant/80 leading-relaxed max-w-[46ch] mt-auto">
          We hold your details with care, and never share them. You can ask us to remove them any time.
        </p>
      </aside>

      {/* ── Right: the form ── */}
      <main className="flex items-center justify-center p-8 lg:p-[60px]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[460px]"
        >
          {step === 3 ? (
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-success-container text-success flex items-center justify-center mb-5">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h1 className="font-serif page-title font-medium tracking-tight text-on-surface">Thanks, {firstName}.</h1>
              <p className="mt-3 text-[15px] leading-relaxed text-on-surface-variant max-w-[42ch]">
                We got it. Someone from the team will reach out within two days. If you&rsquo;d like, you&rsquo;re
                always welcome at our Friday gathering this week (7pm, Lower Common Room).
              </p>
              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="inline-flex items-center gap-1.5 px-4 h-11 rounded-full border border-outline-variant text-sm text-on-surface hover:bg-surface-variant transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to app
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-5 h-11 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Add another
                </button>
              </div>
              <p className="mt-5 text-[13px] text-on-surface-variant/80">
                We&rsquo;ll only ever use this to stay in touch with you.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* Progress */}
              <div className="flex items-center gap-3 mb-5">
                <span className="text-[11px] uppercase tracking-[0.14em] font-medium text-on-surface-variant">
                  Step {step} of 2
                </span>
                <div className="h-1 w-full max-w-[160px] rounded-full bg-surface-variant overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: step === 1 ? '50%' : '100%' }}
                  />
                </div>
              </div>

              <h1 className="font-serif page-title font-medium tracking-tight text-on-surface">
                {step === 1 ? 'Tell us about you.' : 'And a little more.'}
              </h1>
              <p className="mt-1.5 text-[15px] text-on-surface-variant">
                {step === 1
                  ? "Just the basics. We'll cover the rest in person."
                  : 'All optional — skip anything you’d rather not answer.'}
              </p>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-error/10 text-error px-4 py-3 rounded-xl text-sm font-medium mt-4">{error}</div>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div
                key={step}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18 }}
                className="mt-6 flex flex-col gap-4"
              >
                  {step === 1 ? (
                    <>
                      <Field label="Full name">
                        <input
                          className={inputCls}
                          value={form.name}
                          onChange={(e) => set('name', e.target.value)}
                          placeholder="e.g. Naomi Park"
                        />
                      </Field>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Pronouns" optional>
                          <input
                            className={inputCls}
                            value={form.pronouns}
                            onChange={(e) => set('pronouns', e.target.value)}
                            placeholder="she / her"
                          />
                        </Field>
                        <Field label="Year">
                          <SelectInput value={form.year} onChange={(v) => set('year', v)} placeholder="Choose…" options={YEARS} />
                        </Field>
                      </div>
                      <Field label="Major">
                        <SelectInput
                          value={form.major}
                          onChange={(v) => set('major', v)}
                          placeholder="Choose…"
                          options={[...MAJORS, 'Other / undecided']}
                        />
                      </Field>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Phone">
                          <input
                            className={inputCls}
                            type="tel"
                            value={form.phone}
                            onChange={(e) => set('phone', e.target.value)}
                            placeholder="(___) ___-____"
                          />
                        </Field>
                        <Field label="Email">
                          <input
                            className={inputCls}
                            type="email"
                            value={form.email}
                            onChange={(e) => set('email', e.target.value)}
                            placeholder="you@umail.edu"
                          />
                        </Field>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Instagram" optional>
                          <input
                            className={inputCls}
                            value={form.instagram}
                            onChange={(e) => set('instagram', e.target.value)}
                            placeholder="@handle"
                          />
                        </Field>
                        <Field label="Where do you live?">
                          <SelectInput value={form.hall} onChange={(v) => set('hall', v)} placeholder="Choose…" options={HALLS} />
                        </Field>
                      </div>
                      <Field label="Where are you with faith right now?">
                        <SelectInput
                          value={form.spiritualBackground}
                          onChange={(v) => set('spiritualBackground', v)}
                          placeholder="Choose…"
                          options={SPIRITUAL}
                        />
                      </Field>

                      <div className="flex items-center justify-between pt-2">
                        <button
                          type="button"
                          onClick={() => navigate('/')}
                          className="text-sm text-on-surface-variant hover:text-on-surface transition-colors px-2 py-2"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={goNext}
                          disabled={!form.name.trim()}
                          className="inline-flex items-center gap-2 px-5 h-11 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          Continue <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Field label="How did you hear about us?">
                        <div className="flex flex-wrap gap-2">
                          {HOW_HEARD.map((o) => (
                            <Chip key={o} active={form.howHeard === o} onClick={() => set('howHeard', form.howHeard === o ? '' : o)}>
                              {o}
                            </Chip>
                          ))}
                        </div>
                      </Field>

                      <Field label="What are you drawn to?">
                        <div className="flex flex-wrap gap-2">
                          {INTERESTS.map((o) => {
                            const active = form.interests.includes(o);
                            return (
                              <Chip key={o} active={active} onClick={() => toggleInterest(o)}>
                                {active && <Check className="w-3 h-3" />}
                                {o}
                              </Chip>
                            );
                          })}
                        </div>
                      </Field>

                      <Field label="Anything we can pray for?" optional>
                        <textarea
                          rows={3}
                          className={textareaCls}
                          value={form.prayerRequest}
                          onChange={(e) => set('prayerRequest', e.target.value)}
                          placeholder="Totally optional. We hold these confidentially."
                        />
                      </Field>

                      <Field label="Anything else?" optional>
                        <textarea
                          rows={2}
                          className={textareaCls}
                          value={form.notes}
                          onChange={(e) => set('notes', e.target.value)}
                          placeholder="Allergies, schedule conflicts, questions…"
                        />
                      </Field>

                      <Field label={`Quick check — what's ${mathChallenge.a} + ${mathChallenge.b}?`}>
                        <input
                          className={cn(inputCls, 'max-w-[160px]')}
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={mathAnswer}
                          onChange={(e) => setMathAnswer(e.target.value)}
                          placeholder="Your answer"
                        />
                      </Field>

                      {/* Anti-abuse: honeypot (off-screen, accessible to bots) */}
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

                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setStep(1);
                          }}
                          className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors px-2 py-2"
                        >
                          <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="inline-flex items-center gap-2 px-5 h-11 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
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
                    </>
                  )}
              </motion.div>
            </form>
          )}
        </motion.div>
      </main>
    </div>
  );
}
