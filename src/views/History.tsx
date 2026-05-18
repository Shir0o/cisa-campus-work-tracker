import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  limit,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Activity, Contact, SystemActivity } from "../types";
import { ActivityItem } from "../components/ActivityItem";
import { useAuth } from "../components/AuthProvider";
import { History as HistoryIcon } from "lucide-react";
import ContactDetailsModal from "../components/modals/ContactDetailsModal";

export default function History() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  useEffect(() => {
    // Fetch Contacts
    const qContacts = query(collection(db, "contacts"));
    const unsubscribeContacts = onSnapshot(
      qContacts,
      (snapshot) => {
        const contactData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Contact[];
        setContacts(contactData);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "contacts");
      },
    );

    // Fetch Activities
    const qActivities = query(
      collection(db, "activities"),
      orderBy("createdAt", "desc"),
      limit(100), // Increase limit for history view
    );
    const unsubscribeActivities = onSnapshot(
      qActivities,
      (snapshot) => {
        const fetchedActivities = snapshot.docs.map((doc) => {
          const data = doc.data() as SystemActivity;

          return {
            id: doc.id,
            user: data.userName,
            action: data.action,
            target: data.targetName,
            contactId:
              data.targetType === "contact" ? data.targetId : undefined,
            time:
              new Date(data.createdAt).toLocaleDateString() ===
              new Date().toLocaleDateString()
                ? "Today"
                : new Date(data.createdAt).toLocaleDateString(),
            type: data.type,
            description: data.description,
            rawTime: new Date(data.createdAt).getTime(),
            createdAt: data.createdAt, // Store raw createdAt to format more detailed time if needed
          } as Activity & { rawTime: number; createdAt: string };
        });

        setActivities(fetchedActivities);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "activities");
      },
    );

    return () => {
      unsubscribeContacts();
      unsubscribeActivities();
    };
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 lg:space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 lg:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-on-background flex items-center gap-3">
            <HistoryIcon className="w-8 h-8 text-primary" />
            Activity History
          </h1>
          <p className="text-on-surface-variant mt-2 max-w-2xl text-sm sm:text-base">
            Recent activity across the organization.
          </p>
        </div>
      </header>

      <div className="bg-surface-container rounded-3xl p-5 sm:p-6 pb-6 border border-outline-variant/30">
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-on-surface-variant">Loading activity...</p>
            </div>
          ) : activities.length > 0 ? (
            activities.map((activity) => (
              <ActivityItem
                key={activity.id}
                activity={activity}
                contacts={contacts}
                onOpenContact={(contact) => {
                  setSelectedContact(contact);
                }}
              />
            ))
          ) : (
            <div className="text-center py-12">
              <p className="text-on-surface-variant">No activity to show.</p>
            </div>
          )}
        </div>
      </div>

      <ContactDetailsModal
        isOpen={selectedContact !== null}
        onClose={() => setSelectedContact(null)}
        contact={selectedContact}
      />
    </div>
  );
}
