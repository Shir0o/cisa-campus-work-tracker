import React from 'react';
import { 
  UserPlus, 
  User, 
  Phone, 
  Users, 
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export default function SignUp() {
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
        className="w-full max-w-[440px] bg-surface-container-lowest rounded-3xl shadow-xl border border-outline-variant/30 flex flex-col z-10 relative overflow-hidden"
      >
        <div className="px-8 pt-12 pb-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-secondary-container text-on-secondary-container rounded-full flex items-center justify-center mb-6 shadow-sm">
            <UserPlus className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-regular text-on-surface mb-2">Join CampusHub</h1>
          <p className="text-body-md text-on-surface-variant">Complete your profile to access the portal and begin connecting.</p>
        </div>

        <form className="px-8 pb-12 flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant px-1" htmlFor="fullName">Full Name</label>
            <div className="relative group">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant group-focus-within:text-primary transition-colors" />
              <input 
                id="fullName"
                type="text" 
                placeholder="Jane Doe"
                className="w-full pl-12 pr-4 py-4 bg-surface-container rounded-t-lg border-b border-outline text-on-surface font-medium focus:outline-none focus:border-b-2 focus:border-primary focus:bg-surface-container-highest transition-all placeholder:text-outline-variant"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant px-1" htmlFor="phone">Phone Number</label>
            <div className="relative group">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant group-focus-within:text-primary transition-colors" />
              <input 
                id="phone"
                type="tel" 
                placeholder="(555) 000-0000"
                className="w-full pl-12 pr-4 py-4 bg-surface-container rounded-t-lg border-b border-outline text-on-surface font-medium focus:outline-none focus:border-b-2 focus:border-primary focus:bg-surface-container-highest transition-all placeholder:text-outline-variant"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant px-1" htmlFor="spiritual">Spiritual Background</label>
            <div className="relative group">
              <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant group-focus-within:text-primary transition-colors" />
              <select 
                id="spiritual"
                className="w-full pl-12 pr-10 py-4 bg-surface-container rounded-t-lg border-b border-outline text-on-surface font-medium focus:outline-none focus:border-b-2 focus:border-primary focus:bg-surface-container-highest transition-all appearance-none cursor-pointer"
              >
                <option value="" disabled selected>Select your background</option>
                <option value="christian">Christian (General)</option>
                <option value="catholic">Catholic</option>
                <option value="protestant">Protestant</option>
                <option value="other">Other</option>
              </select>
              <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant rotate-90 pointer-events-none" />
            </div>
          </div>

          <div className="pt-4">
            <button className="w-full py-4 bg-primary text-on-primary rounded-full font-bold text-sm hover:translate-y-[-2px] hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 group">
              Submit Application
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          <p className="text-center text-xs text-on-surface-variant opacity-70 mt-2">
            By signing up, you agree to our <span className="underline cursor-pointer hover:text-primary">Terms of Service</span>.
          </p>
        </form>
      </motion.main>
    </div>
  );
}
