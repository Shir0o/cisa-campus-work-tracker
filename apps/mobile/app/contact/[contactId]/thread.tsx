import { Redirect, useLocalSearchParams } from 'expo-router';
import { canAccessRoute } from '@cisa/core';
import { useAuth } from '../../../src/lib/AuthProvider';
import { ContactThreadScreen } from '../../../src/components/contact/ContactThreadScreen';
import ContactDetail from './index';

// A Thread pushed over the person screen (ADR 0033, T2). `?parent=` is a
// Conversation message. An old `?interaction=` deep link's Interaction Thread
// is cut: it lands on the person's Story instead (cut-or-keep §24).
export default function ContactThread() {
  const { contactId, parent, interaction } = useLocalSearchParams<{
    contactId: string;
    parent?: string;
    interaction?: string;
  }>();
  const { role } = useAuth();
  // The person route's own refusal, unchanged.
  if (!canAccessRoute(role, '/contact')) return <ContactDetail />;
  if (interaction && !parent) return <Redirect href={`/contact/${contactId}`} />;
  return <ContactThreadScreen contactId={contactId} parentId={parent ?? null} />;
}
