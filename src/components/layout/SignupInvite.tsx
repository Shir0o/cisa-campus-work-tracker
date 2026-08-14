import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { cn } from '../../lib/utils';

export const SIGNUP_TITLE = "Sign-up form";
export const SIGNUP_WHAT = "Not a login for this app — it's the short form a new friend fills in so we can stay in touch with them.";
export const SIGNUP_WHAT_SHORT = "So someone new can ask to hear from us.";

export const signupLink = () => {
  try {
    if (typeof window !== 'undefined' && window.location) {
      return `${window.location.origin}/signup`;
    }
    return "https://cisa.campus/signup";
  } catch {
    return "https://cisa.campus/signup";
  }
};

export const copySignupLink = async (onToast?: (msg: string) => void) => {
  const link = signupLink();
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(link);
    }
  } catch {
    // Clipboard blocked in some frames
  }
  if (onToast) {
    onToast("Sign-up link copied — text it, or put it on a poster.");
  }
};

interface SignupInviteProps {
  onOpen?: (view?: string) => void;
  onToast?: (msg: string) => void;
}

export default function SignupInvite({ onOpen, onToast }: SignupInviteProps) {
  const [open, setOpen] = useState(false);
  const [localToast, setLocalToast] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  const handleOpen = () => {
    setOpen(false);
    if (onOpen) {
      onOpen('signup');
    } else {
      navigate('/signup');
    }
  };

  const handleCopy = async () => {
    setOpen(false);
    const toastMsg = "Sign-up link copied — text it, or put it on a poster.";
    await copySignupLink(onToast);
    if (!onToast) {
      setLocalToast(toastMsg);
      setTimeout(() => setLocalToast(null), 3000);
    }
  };

  return (
    <div className="sgi-wrap">
      <button
        type="button"
        className={cn("sgi-btn", open && "on")}
        title={`${SIGNUP_TITLE} — ${SIGNUP_WHAT_SHORT}`}
        aria-label={SIGNUP_TITLE}
        onClick={() => setOpen((o) => !o)}
      >
        <FileText className="w-5 h-5" />
      </button>

      {open && (
        <>
          <div className="sgi-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="sgi-pop" role="dialog" aria-label={SIGNUP_TITLE}>
            <div className="sgi-head">
              <FileText className="w-3.5 h-3.5" />
              <b>{SIGNUP_TITLE}</b>
            </div>
            <p className="sgi-what">{SIGNUP_WHAT}</p>
            <button type="button" className="sgi-act" onClick={handleOpen}>
              <b>Open it here</b>
              <span>Hand over your screen — it takes about two minutes</span>
            </button>
            <button type="button" className="sgi-act" onClick={handleCopy}>
              <b>Copy the link</b>
              <span>Send it to them instead</span>
            </button>
          </div>
        </>
      )}

      {localToast && (
        <div className="fixed bottom-6 right-6 z-[999] bg-surface-container-highest text-on-surface border border-outline-variant px-4 py-2.5 rounded-xl shadow-lg text-sm animate-in fade-in duration-150">
          {localToast}
        </div>
      )}
    </div>
  );
}
