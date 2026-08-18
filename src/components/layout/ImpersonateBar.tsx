import React from 'react';
import { Eye, RotateCcw, Users } from 'lucide-react';
import { ImpersonateTarget } from '../../types';
import { impScope } from '../../lib/impersonate';

interface ImpersonateBarProps {
  target: ImpersonateTarget;
  onSwitch: () => void;
  onExit: () => void;
}

export default function ImpersonateBar({ target, onSwitch, onExit }: ImpersonateBarProps) {
  const sc = impScope(target);
  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 text-on-surface px-4 py-2.5 pt-[calc(0.625rem+env(safe-area-inset-top,0px))] flex flex-wrap items-center justify-between gap-3 text-xs z-50 transition-all">
      <div className="flex items-center gap-2.5 font-medium min-w-0">
        <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <Eye className="w-3.5 h-3.5" />
        </span>
        <span className="text-on-surface truncate">
          You're seeing CISA as <strong>{target.name}</strong> — {target.sub}.
          <span className="hidden md:inline text-on-surface-variant ml-1.5">
            {sc.people ? `${sc.people}. ` : ''}{sc.pages ? `${sc.pages}. ` : ''}Anything you do here is saved as them.
          </span>
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onSwitch}
          className="px-3 py-1 bg-surface border border-outline-variant/60 hover:bg-surface-container-high text-on-surface rounded-full flex items-center gap-1.5 font-medium transition-colors"
        >
          <Users className="w-3 h-3 text-on-surface-variant" />
          <span>Someone else</span>
        </button>

        <button
          onClick={onExit}
          className="px-3 py-1 bg-amber-500 text-white font-medium hover:bg-amber-600 rounded-full flex items-center gap-1.5 transition-colors "
        >
          <RotateCcw className="w-3 h-3" />
          <span>Back to my view</span>
        </button>
      </div>
    </div>
  );
}
