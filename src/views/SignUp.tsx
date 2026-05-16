import React, { useState } from 'react';
import { 
  UserPlus, 
  User, 
  Phone, 
  Users, 
  ChevronRight,
  ArrowRight,
  Mail,
  MapPin,
  CheckCircle2,
  Sparkles,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getUserInitials } from '../lib/utils';
import { db, handleFirestoreError, OperationType, sendNotification } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, limit } from 'firebase/firestore';

export default function SignUp() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    residenceHall: '',
    spiritualBackground: '',
    botField: '' // Honeypot
  });
  
  // Anti-abuse math challenge
  const [mathChallenge, setMathChallenge] = useState({ a: 0, b: 0 });
  const [mathAnswer, setMathAnswer] = useState('');

  // Initialize math challenge
  React.useEffect(() => {
    setMathChallenge({
      a: Math.floor(Math.random() * 10) + 1,
      b: Math.floor(Math.random() * 10) + 1
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Anti-abuse: Honeypot check
    // If botField is filled, silently succeed without writing to db
    if (formData.botField) {
      setSubmitted(true);
      return;
    }

    // Anti-abuse: Math Challenge
    if (parseInt(mathAnswer) !== mathChallenge.a + mathChallenge.b) {
      setError("Incorrect math answer. Are you human?");
      return;
    }

    // Client-side validation
    if (!formData.name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!formData.email.trim() || !/^\S+@\S+\.\S+$/.test(formData.email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!formData.phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }
    if (!formData.spiritualBackground) {
      setError("Please select your interest/background.");
      return;
    }

    setLoading(true);

    try {
      // Find the first stage (Lead/New) to assign
      const stagesQuery = query(collection(db, 'stages'), limit(1));
      const stagesSnapshot = await getDocs(stagesQuery);
      const firstStage = stagesSnapshot.empty ? 'Lead' : stagesSnapshot.docs[0].data().label;

      const contactData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        location: formData.residenceHall || 'Online Form',
        role: 'Student',
        stage: firstStage,
        initials: getUserInitials(formData.name),
        notes: '',
        spiritualBackground: formData.spiritualBackground,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastSeen: new Date().toLocaleDateString(),
        tags: ['New Sign Up']
      };

      const docRef = await addDoc(collection(db, 'contacts'), contactData);

      // Notify admins/managers about the new public sign-up
      try {
        const notificationData = {
          userId: 'ALL_ADMINS',
          title: 'New Student Sign-up',
          message: `${formData.name} has signed up via the public form.`,
          type: 'event' as const,
          read: false,
          createdAt: serverTimestamp()
        };
        await addDoc(collection(db, 'notifications'), notificationData);
      } catch (notifyError) {
        console.error('Failed to broadcast admin notification:', notifyError);
      }

      setSubmitted(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'contacts');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 md:p-8 relative overflow-hidden bg-surface">
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute -top-[10%] -right-[10%] w-[50vw] h-[50vw] rounded-full bg-primary-fixed opacity-30 blur-[120px]"></div>
          <div className="absolute -bottom-[10%] -left-[10%] w-[40vw] h-[40vw] rounded-full bg-secondary-fixed opacity-40 blur-[120px]"></div>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-[440px] bg-surface-container-lowest rounded-[32px] shadow-2xl border border-outline-variant/30 flex flex-col z-10 relative overflow-hidden p-8 text-center"
        >
          <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-8 mx-auto ring-8 ring-primary/5">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-on-surface mb-4">You're in!</h1>
          <p className="text-on-surface-variant leading-relaxed mb-8">
            Thanks for joining, <span className="font-bold text-on-surface">{formData.name}</span>. Your information has been received and you'll hear from a member of our team soon.
          </p>
          <button 
            onClick={() => setSubmitted(false)}
            className="w-full py-4 bg-surface-container-highest text-on-surface rounded-full font-bold text-sm hover:bg-surface-variant transition-all"
          >
            Submit Another Response
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 md:p-8 relative overflow-hidden bg-surface">
      {/* Ambient Decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -right-[10%] w-[50vw] h-[50vw] rounded-full bg-primary-fixed opacity-30 blur-[120px]"></div>
        <div className="absolute -bottom-[10%] -left-[10%] w-[40vw] h-[40vw] rounded-full bg-secondary-fixed opacity-40 blur-[120px]"></div>
      </div>

      <motion.main 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[480px] bg-surface-container-lowest rounded-[32px] shadow-2xl border border-outline-variant/30 flex flex-col z-10 relative overflow-hidden"
      >
        <div className="px-8 pt-10 pb-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-primary text-on-primary rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-primary/20 transform -rotate-3 group-hover:rotate-0 transition-transform">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-on-surface mb-2">Student Connect</h1>
          <p className="text-sm text-on-surface-variant max-w-[280px]">Fill out the form below to get connected with the campus community.</p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 pb-10 flex flex-col gap-5">
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0, scale: 0.95 }}
                animate={{ opacity: 1, height: 'auto', scale: 1 }}
                exit={{ opacity: 0, height: 0, scale: 0.95 }}
                className="bg-error/10 text-error p-4 rounded-2xl text-sm font-medium origin-top"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant px-1" htmlFor="name">Full Name</label>
            <div className="relative group">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant group-focus-within:text-primary transition-colors" />
              <input 
                required
                id="name"
                type="text" 
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Example: Alex Johnson"
                className="w-full pl-12 pr-4 h-14 bg-surface-container rounded-2xl border border-transparent focus:border-primary focus:bg-surface-container-highest transition-all outline-none text-on-surface font-medium placeholder:text-on-surface-variant/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant px-1" htmlFor="email">Email</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant group-focus-within:text-primary transition-colors" />
                <input 
                  required
                  id="email"
                  type="email" 
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="alex@school.edu"
                  className="w-full pl-12 pr-4 h-14 bg-surface-container rounded-2xl border border-transparent focus:border-primary focus:bg-surface-container-highest transition-all outline-none text-on-surface font-medium placeholder:text-on-surface-variant/40"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant px-1" htmlFor="phone">Phone</label>
              <div className="relative group">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant group-focus-within:text-primary transition-colors" />
                <input 
                  required
                  id="phone"
                  type="tel" 
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(555) 000-0000"
                  className="w-full pl-12 pr-4 h-14 bg-surface-container rounded-2xl border border-transparent focus:border-primary focus:bg-surface-container-highest transition-all outline-none text-on-surface font-medium placeholder:text-on-surface-variant/40"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant px-1" htmlFor="location">Campus / Residence Hall</label>
            <div className="relative group">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant group-focus-within:text-primary transition-colors" />
              <input 
                id="location"
                type="text" 
                value={formData.residenceHall}
                onChange={e => setFormData({ ...formData, residenceHall: e.target.value })}
                placeholder="e.g. North Campus, Miller Hall"
                className="w-full pl-12 pr-4 h-14 bg-surface-container rounded-2xl border border-transparent focus:border-primary focus:bg-surface-container-highest transition-all outline-none text-on-surface font-medium placeholder:text-on-surface-variant/40"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant px-1" htmlFor="spiritual">Information you'd like to share</label>
            <div className="relative group">
              <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant group-focus-within:text-primary transition-colors" />
              <select 
                id="spiritual"
                required
                value={formData.spiritualBackground}
                onChange={e => setFormData({ ...formData, spiritualBackground: e.target.value })}
                className="w-full pl-12 pr-10 h-14 bg-surface-container rounded-2xl border border-transparent focus:border-primary focus:bg-surface-container-highest transition-all appearance-none cursor-pointer text-on-surface font-medium"
              >
                <option value="" disabled>Select your interest/background</option>
                <option value="Exploring">Exploring Faith</option>
                <option value="Christian">Christian</option>
                <option value="Catholic">Catholic</option>
                <option value="Other">Other Religion / Background</option>
                <option value="None">None</option>
              </select>
              <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant rotate-90 pointer-events-none" />
            </div>
          </div>

          {/* Anti-abuse: Honeypot (visually hidden but accessible to bots) */}
          <div className="absolute left-[-9999px] top-auto w-1 h-1 overflow-hidden" aria-hidden="true">
            <label htmlFor="botField">Leave this field blank</label>
            <input
              id="botField"
              name="botField"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={formData.botField}
              onChange={e => setFormData({ ...formData, botField: e.target.value })}
            />
          </div>

          {/* Anti-abuse: Math Challenge */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant px-1" htmlFor="math">Human verification: {mathChallenge.a} + {mathChallenge.b} = ?</label>
            <div className="relative group">
              <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant group-focus-within:text-primary transition-colors" />
              <input 
                required
                id="math"
                type="number"
                min="0"
                value={mathAnswer}
                onChange={e => setMathAnswer(e.target.value)}
                placeholder="Enter the result"
                className="w-full pl-12 pr-4 h-14 bg-surface-container rounded-2xl border border-transparent focus:border-primary focus:bg-surface-container-highest transition-all outline-none text-on-surface font-medium placeholder:text-on-surface-variant/40"
              />
            </div>
          </div>

          <div className="pt-4">
            <button 
              disabled={loading}
              className="w-full h-14 bg-primary text-on-primary rounded-2xl font-bold text-sm hover:translate-y-[-2px] hover:shadow-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 group disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Connect with Community
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </div>

          <p className="text-center text-[10px] text-on-surface-variant opacity-60 mt-2 px-6 leading-relaxed">
            By connecting, you agree to receive follow-up information about campus events and community news.
          </p>
        </form>
      </motion.main>
    </div>
  );
}
