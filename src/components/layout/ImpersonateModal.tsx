import React, { useEffect } from 'react';
import { X, RotateCcw, Eye } from 'lucide-react';
import ImpersonatePicker from './ImpersonatePicker';
import { ImpersonateTarget } from '../../types';
import { useAuth } from '../AuthProvider';
import { AppRole, roleLabel } from '../../lib/permissions';
import { cn } from '../../lib/utils';

interface ImpersonateModalProps {
  isOpen: boolean;
  currentKey: string | null | undefined;
  onPick: (target: ImpersonateTarget) => void;
  onClose: () => void;
  contacts?: any[];
}

const ROLES: { key: AppRole; label: string; note: string }[] = [
  { key: 'admin', label: 'Full-timer', note: 'Full workspace' },
  { key: 'manager', label: 'Trainee', note: 'Trainee view' },
  { key: 'operator', label: 'Student', note: 'Student view' },
  { key: 'viewer', label: 'Community', note: 'Community view' },
];

export default function ImpersonateModal({
  isOpen,
  currentKey,
  onPick,
  onClose,
  contacts = [],
}: ImpersonateModalProps) {
  const { ownerViewRole, setOwnerViewRole, impersonateTarget, setImpersonateTarget } = useAuth();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-start justify-center p-4 sm:p-6 overflow-y-auto pt-[calc(1rem+env(safe-area-inset-top,0px))]"
      onClick={onClose}
    >
      <div
        className="bg-surface-container rounded-3xl border border-outline-variant shadow-2xl max-w-xl w-full my-auto overflow-hidden text-left transition-all transform animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-outline-variant/50 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-serif font-medium text-on-surface flex items-center gap-2">
              <Eye className="w-5 h-5 text-amber-500" />
              See as their view
            </h2>
            <p className="text-xs text-on-surface-variant max-w-md leading-relaxed">
              Step into someone's view or simulate a role — see the exact workspace, tools, and words they read.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-on-surface-variant hover:bg-surface-container-high rounded-full transition-colors shrink-0"
            title="Close modal"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role View Simulation Quick Bar */}
        <div className="px-6 py-3 bg-surface-container-high/40 border-b border-outline-variant/30 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-on-surface-variant mr-1">Role Preview:</span>
            {ROLES.map((r) => {
              const active = ownerViewRole === r.key && !impersonateTarget;
              return (
                <button
                  key={r.key}
                  onClick={() => {
                    if (impersonateTarget) setImpersonateTarget(null);
                    setOwnerViewRole(active ? null : r.key);
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-full border transition-all font-medium',
                    active
                      ? 'bg-primary text-on-primary border-primary '
                      : 'bg-surface border-outline-variant/60 text-on-surface hover:bg-surface-container-high',
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          {(impersonateTarget || ownerViewRole) && (
            <button
              onClick={() => {
                setImpersonateTarget(null);
                setOwnerViewRole(null);
              }}
              className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-500/30 font-medium flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Back to my view</span>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          <ImpersonatePicker
            currentKey={currentKey}
            onPick={(target) => {
              onPick(target);
              onClose();
            }}
            contacts={contacts}
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}

