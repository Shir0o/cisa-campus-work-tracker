import React from 'react';
import { RotateCcw } from 'lucide-react';
import ImpersonatePicker from './ImpersonatePicker';
import { ImpersonateTarget } from '../../types';
import { useAuth } from '../AuthProvider';
import { AppRole } from '../../lib/permissions';
import { cn } from '../../lib/utils';
import { PopupFrame } from '../ui/PopupFrame';
import { useLanguage } from '../LanguageProvider';

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
  const { t } = useLanguage();
  const { ownerViewRole, setOwnerViewRole, impersonateTarget, setImpersonateTarget } = useAuth();

  if (!isOpen) return null;

  return (
    <PopupFrame
      open
      onClose={onClose}
      size="md"
      eyebrow={t('impersonateModal.eyebrow')}
      title={t('impersonateModal.title')}
      subtitle={t('impersonateModal.subtitle')}
      cancelLabel={t('actions.cancel')}
      onCancel={onClose}
      primary={{
        label: t('actions.done'),
        onClick: onClose,
        savingLabel: t('actions.saving'),
      }}
    >
      {/* Role View Simulation Quick Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-low px-7 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-semibold text-on-surface-variant">{t('impersonateModal.role_preview')}</span>
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
                  'rounded-full border px-2.5 py-1 font-medium transition-all',
                  active
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-container-high',
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
            className="flex items-center gap-1 rounded-full bg-stage-amber-soft px-2.5 py-1 font-medium text-stage-amber transition-colors hover:bg-stage-amber/20"
          >
            <RotateCcw className="h-3 w-3" />
            <span>{t('impersonate.back_to_my_view')}</span>
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-7 py-5">
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
    </PopupFrame>
  );
}

