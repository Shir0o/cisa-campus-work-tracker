import React from 'react';
import { useAuth } from '../AuthProvider';
import ImpersonateBar from './ImpersonateBar';

export default function OwnerViewBanner({ onOpenModal }: { onOpenModal?: () => void }) {
  const { isOwner, impersonateTarget, setImpersonateTarget } = useAuth();

  if (!isOwner || !impersonateTarget) return null;

  return (
    <ImpersonateBar
      target={impersonateTarget}
      onSwitch={() => onOpenModal?.()}
      onExit={() => setImpersonateTarget(null)}
    />
  );
}


