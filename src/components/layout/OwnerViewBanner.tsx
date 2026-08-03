import React, { useState } from 'react';
import { Eye, RotateCcw, ChevronDown, Check, Users } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { AppRole, roleLabel } from '../../lib/permissions';
import { cn } from '../../lib/utils';
import ImpersonateBar from './ImpersonateBar';

const ROLES: { key: AppRole; label: string; note: string }[] = [
  { key: 'admin', label: 'Full-timer', note: 'Full workspace (Admin)' },
  { key: 'manager', label: 'Trainee', note: 'Trainee workspace' },
  { key: 'operator', label: 'Student', note: "Student's view" },
  { key: 'viewer', label: 'Community', note: "Community member's view" },
];

export default function OwnerViewBanner({ onOpenModal }: { onOpenModal?: () => void }) {
  const { isOwner, ownerViewRole, setOwnerViewRole, impersonateTarget, setImpersonateTarget } =
    useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Strictly visible ONLY to app owner / admin
  if (!isOwner) return null;

  if (impersonateTarget) {
    return (
      <ImpersonateBar
        target={impersonateTarget}
        onSwitch={() => onOpenModal?.()}
        onExit={() => setImpersonateTarget(null)}
      />
    );
  }

  const currentRoleLabel = ownerViewRole ? roleLabel(ownerViewRole) : 'App Owner';

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30 text-on-surface px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] flex flex-wrap items-center justify-between gap-3 text-xs z-50 transition-all">
      <div className="flex items-center gap-2 font-medium">
        <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <Eye className="w-3.5 h-3.5" />
        </span>
        <span className="text-on-surface">
          {ownerViewRole ? (
            <>
              You are seeing CISA as <strong>{currentRoleLabel}</strong>.
              <span className="hidden sm:inline text-on-surface-variant ml-1">
                (See their view preview mode)
              </span>
            </>
          ) : (
            <>App Owner Mode — preview what other roles or people see.</>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2 relative">
        {onOpenModal && (
          <button
            onClick={onOpenModal}
            className="px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-full font-medium flex items-center gap-1.5 transition-colors"
          >
            <Users className="w-3 h-3" />
            <span>See as person…</span>
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            className="px-3 py-1 bg-surface border border-outline-variant/60 hover:bg-surface-container-high text-on-surface rounded-full flex items-center gap-1.5 font-medium transition-colors"
          >
            <span>{ownerViewRole ? `View: ${currentRoleLabel}` : 'See their view…'}</span>
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 text-on-surface-variant transition-transform',
                dropdownOpen && 'rotate-180',
              )}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-56 rounded-2xl bg-surface-container border border-outline-variant/50 shadow-xl py-1.5 z-50 text-left">
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30">
                Switch role view
              </div>
              {ROLES.map((r) => {
                const active = ownerViewRole === r.key;
                return (
                  <button
                    key={r.key}
                    onClick={() => {
                      setOwnerViewRole(r.key);
                      setDropdownOpen(false);
                    }}
                    className={cn(
                      'w-full px-3 py-2 text-left flex items-center justify-between hover:bg-surface-container-high transition-colors text-xs',
                      active && 'bg-primary/10 text-primary font-medium',
                    )}
                  >
                    <div>
                      <div className="font-medium leading-tight">{r.label}</div>
                      <div className="text-[11px] text-on-surface-variant mt-0.5">{r.note}</div>
                    </div>
                    {active && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {ownerViewRole && (
          <button
            onClick={() => setOwnerViewRole(null)}
            className="px-3 py-1 bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-500/30 rounded-full font-medium flex items-center gap-1.5 transition-colors"
            title="Reset to App Owner view"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset to Owner</span>
          </button>
        )}
      </div>
    </div>
  );
}

