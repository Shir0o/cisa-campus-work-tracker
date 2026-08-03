import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import ImpersonatePicker from './ImpersonatePicker';
import { ImpersonateTarget } from '../../types';

interface ImpersonateModalProps {
  isOpen: boolean;
  currentKey: string | null | undefined;
  onPick: (target: ImpersonateTarget) => void;
  onClose: () => void;
  contacts?: any[];
}

export default function ImpersonateModal({
  isOpen,
  currentKey,
  onPick,
  onClose,
  contacts = [],
}: ImpersonateModalProps) {
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
            <h2 className="text-xl font-serif font-medium text-on-surface">See it as they do</h2>
            <p className="text-xs text-on-surface-variant max-w-md leading-relaxed">
              Step into someone's view for a moment — the same screens, the same words they'd read. This is yours alone.
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

        {/* Body */}
        <div className="p-6 max-h-[65vh] overflow-y-auto">
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
