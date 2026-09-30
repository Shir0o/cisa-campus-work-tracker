import { useLocalSearchParams } from 'expo-router';
import { canAccessRoute } from '@cisa/core';
import { useAuth } from '../../../src/lib/AuthProvider';
import { ContactThreadScreen } from '../../../src/components/contact/ContactThreadScreen';
import ContactDetail from './index';

// A Thread pushed over the person screen (ADR 0033, T2). `?parent=` is a
// Conversation message (`&stream=team` a Full-timers one); `?interaction=` an
// Interaction's Thread from its Story entry.
export default function ContactThread() {
  const { contactId, parent, stream, interaction } = useLocalSearchParams<{
    contactId: string;
    parent?: string;
    stream?: string;
    interaction?: string;
  }>();
  const { role } = useAuth();
  // The person route's own refusal, unchanged.
  if (!canAccessRoute(role, '/contact')) return <ContactDetail />;
  return (
    <ContactThreadScreen
      contactId={contactId}
      parentId={parent ?? null}
      team={stream === 'team'}
      interactionId={interaction ?? null}
    />
  );
}
