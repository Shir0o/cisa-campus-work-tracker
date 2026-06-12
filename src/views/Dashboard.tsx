import React, { useEffect, useState } from "react";
import {
  Sparkles,
  Phone,
  Mail,
  Calendar,
  ChevronRight,
  MessageSquare,
  ExternalLink,
  Users,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Clock,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  collectionGroup,
  where,
  getDoc,
  setDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { cn } from "../lib/utils";
import { useAuth } from "../components/AuthProvider";
import { useLayout } from "../App";
import {
  Contact,
  Activity,
  Interaction,
  Comment,
  SystemActivity,
} from "../types";
import { ActivityItem } from "../components/ActivityItem";
import { Skeleton } from "../components/ui/Skeleton";
import ContactDetailsModal from "../components/modals/ContactDetailsModal";
import LogInteractionModal from "../components/modals/LogInteractionModal";

export default function Dashboard() {
  const { user } = useAuth();
  const { isSidebarCollapsed } = useLayout();
  const navigate = useNavigate();
  const firstName = user?.displayName?.split(" ")[0] || "Campaigner";

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentFollowUpsCount, setRecentFollowUpsCount] = useState(0);

  const [legacyInteractions, setLegacyInteractions] = useState<(Activity & { rawTime?: number })[]>([]);
  const [legacyComments, setLegacyComments] = useState<(Activity & { rawTime?: number })[]>([]);

  const [tasks, setTasks] = useState<any[]>([]);

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isLogInteractionOpen, setIsLogInteractionOpen] = useState(false);

  useEffect(() => {
    // 1. Fetch Contacts
    const qContacts = query(collection(db, "contacts"));
    const unsubscribeContacts = onSnapshot(
      qContacts,
      (snapshot) => {
        const contactData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Contact[];
        setContacts(contactData);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "contacts");
      },
    );

    // 2. Fetch Legacy Interactions (For backward parse)
    const qInteractions = query(
      collectionGroup(db, "interactions"),
      orderBy("createdAt", "desc"),
      limit(15),
    );
    const unsubscribeInteractions = onSnapshot(
      qInteractions,
      (snapshot) => {
        const activities = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data() as Interaction;
          const contactId = docSnapshot.ref.path.split("/")[1];

          return {
            id: docSnapshot.id,
            user: data.userName || data.createdByName || 'Unknown',
            userPhoto: data.userPhoto,
            action: "logged an interaction for",
            target: "a contact",
            contactId: contactId,
            time:
              new Date(data.dateTime).toLocaleDateString() ===
              new Date().toLocaleDateString()
                ? "Today"
                : new Date(data.dateTime).toLocaleDateString(),
            type: data.type === 'meeting' ? 'event' : data.type === 'chat' ? 'comment' : (data.type || "call"),
            description: data.content,
            rawTime: new Date(data.dateTime).getTime(),
          } as Activity & { rawTime: number };
        });
        setLegacyInteractions(activities);
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.LIST,
          "interactions (collectionGroup)",
        );
      },
    );

    // 3. Fetch Legacy Comments (For backward parse)
    const qComments = query(
      collectionGroup(db, "comments"),
      orderBy("createdAt", "desc"),
      limit(15),
    );
    const unsubscribeComments = onSnapshot(
      qComments,
      (snapshot) => {
        const activities = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data() as Comment;
          const contactId = docSnapshot.ref.path.split("/")[1];

          return {
            id: docSnapshot.id,
            user: data.userName,
            userPhoto: data.userPhoto,
            action: "left a comment on",
            target: "a contact",
            contactId: contactId,
            time:
              new Date(data.createdAt).toLocaleDateString() ===
              new Date().toLocaleDateString()
                ? "Today"
                : new Date(data.createdAt).toLocaleDateString(),
            type: "comment",
            description: data.text,
            rawTime: new Date(data.createdAt).getTime(),
          } as Activity & { rawTime: number };
        });
        setLegacyComments(activities);
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.LIST,
          "comments (collectionGroup)",
        );
      },
    );

    // 4. Recent Follow-ups Count
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    let interactionsCount = 0;
    let commentsCount = 0;

    const qRecentFollowUps = query(
      collectionGroup(db, "interactions"),
      where("createdAt", ">=", sevenDaysAgo.toISOString()),
    );
    const unsubscribeFollowUps = onSnapshot(
      qRecentFollowUps,
      (snapshot) => {
        interactionsCount = snapshot.size;
        setRecentFollowUpsCount(interactionsCount + commentsCount);
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.LIST,
          "interactions count (collectionGroup)",
        );
      },
    );

    const qRecentComments = query(
      collectionGroup(db, "comments"),
      where("createdAt", ">=", sevenDaysAgo.toISOString()),
    );
    const unsubscribeRecentComments = onSnapshot(
      qRecentComments,
      (snapshot) => {
        commentsCount = snapshot.size;
        setRecentFollowUpsCount(interactionsCount + commentsCount);
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.LIST,
          "comments count (collectionGroup)",
        );
      },
    );

    // 6. Fetch Tasks
    const qTasks = query(
      collection(db, "tasks"),
      where("status", "==", "pending"),
      orderBy("dueDate", "asc"),
      limit(10),
    );
    const unsubscribeTasks = onSnapshot(
      qTasks,
      (snapshot) => {
        const taskData = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        }));
        setTasks(taskData);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "tasks");
      },
    );

    return () => {
      unsubscribeContacts();
      unsubscribeInteractions();
      unsubscribeComments();
      unsubscribeFollowUps();
      unsubscribeRecentComments();
      unsubscribeTasks();
    };
  }, []);

  // Since unifiedActivities depends on states, let's use useMemo instead of another state
  const activities = React.useMemo(() => {
    const merged = [
      ...legacyInteractions,
      ...legacyComments,
    ]
      .sort((a: any, b: any) => b.rawTime - a.rawTime)
      .filter((v, i, a) => {
        // filter out exact same IDs
        if (a.findIndex((t) => t.id === v.id) !== i) return false;
        
        // Deduplicate overlapping legacy and system records by checking contactId, action, and description
        const firstMatchIndex = a.findIndex((t) => 
          t.contactId === v.contactId && 
          t.action === v.action &&
          t.description === v.description &&
          Math.abs(t.rawTime - v.rawTime) < 1000 * 60 // Within 1 minute, helps prevent double inserts
        );
        return firstMatchIndex === i;
      })
      .slice(0, 15);

    // Resolve contact names if we have the IDs
    return merged.map((activity) => {
      if (activity.contactId) {
        const contact = contacts.find((c) => c.id === activity.contactId);
        if (contact) {
          return {
            ...activity,
            target: contact.name,
          };
        }
      }
      return activity;
    });
  }, [
    legacyInteractions,
    legacyComments,
    contacts,
  ]);

  const metrics = [
    {
      label: "Total Contacts",
      value: contacts.length.toString(),
      trend: "0%",
      icon: Users,
      color: "primary",
    },
    {
      label: "Recent Follow-ups",
      value: recentFollowUpsCount.toString(),
      trend: "Past 7 Days",
      icon: CheckCircle2,
      color: "secondary",
    },
  ];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 space-y-8 animate-pulse">
        {/* Header Skeleton */}
        <div>
          <Skeleton className="h-10 w-2/3 max-w-sm mb-2" />
          <Skeleton className="h-6 w-1/2 max-w-md opacity-70" />
        </div>

        {/* Metrics Row Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-surface-container/50 rounded-3xl p-6 h-48 border border-outline-variant/30 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <Skeleton className="w-12 h-12 rounded-full" />
              <Skeleton className="w-20 h-6 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-16" />
            </div>
          </div>
          <div className="bg-surface-container/50 rounded-3xl p-6 h-48 border border-outline-variant/30 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <Skeleton className="w-12 h-12 rounded-full" />
              <Skeleton className="w-28 h-6 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-20" />
            </div>
          </div>
        </div>

        {/* Main Content Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Activity Skeleton */}
          <div className="lg:col-span-2 bg-surface-container/50 rounded-3xl p-6 border border-outline-variant/30">
            <div className="flex justify-between items-center mb-8">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-5 w-20" />
            </div>
            <div className="space-y-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                  <div className="space-y-2 flex-grow">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2 opacity-70" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Priority Tasks Skeleton */}
          <div className="bg-surface-container/50 rounded-3xl p-6 border border-outline-variant/30">
            <Skeleton className="h-7 w-40 mb-8" />
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex gap-4 items-center p-4 bg-surface-container-lowest/50 rounded-xl border border-outline-variant/50"
                >
                  <Skeleton className="w-6 h-6 rounded flex-shrink-0" />
                  <div className="space-y-2 flex-grow">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-1/2 opacity-70" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-6 md:p-8 space-y-8"
    >
      <div>
        <h2 className="text-3xl font-normal text-on-surface mb-2">
          {getGreeting()}, {firstName}
        </h2>
      </div>

      {/* Metrics Row */}
      <div
        className={cn(
          "grid gap-4 sm:gap-6 items-start",
          "grid-cols-1 sm:grid-cols-2",
        )}
      >
        {metrics.map((metric, idx) => (
          <div
            key={idx}
            className="bg-surface-container rounded-3xl p-5 sm:p-6 flex flex-col justify-between min-h-[170px] sm:h-48 border border-outline-variant/30 overflow-hidden group"
          >
            <div className="flex items-start justify-between">
              <div
                className={cn(
                  "w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-transform group-hover:scale-105",
                  metric.color === "primary"
                    ? "bg-primary-container text-on-primary-container"
                    : metric.color === "secondary"
                      ? "bg-secondary-container text-on-secondary-container"
                      : "bg-tertiary-container text-on-tertiary-container",
                )}
              >
                <metric.icon className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              {metric.trend && (
                <span
                  className={cn(
                    "px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-semibold flex items-center gap-1",
                    metric.color === "primary"
                      ? "bg-primary-fixed-dim text-primary"
                      : "bg-secondary-fixed-dim text-secondary",
                  )}
                >
                  {metric.trend === "12%" && <TrendingUp className="w-3 h-3" />}
                  {metric.trend === "Past 7 Days" && (
                    <Clock className="w-3 h-3" />
                  )}
                  {metric.trend}
                </span>
              )}
            </div>
            <div className="mt-auto pt-4 sm:pt-0">
              <p className="text-label-sm sm:text-label-lg text-on-surface-variant mb-1">
                {metric.label}
              </p>
              <h3 className="text-3xl sm:text-4xl xl:text-5xl font-regular text-on-surface truncate">
                {metric.value}
              </h3>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className={cn("grid gap-6 md:gap-8", "grid-cols-1 lg:grid-cols-3")}>
        {/* Recent Activity Feed */}
        <div
          className={cn(
            "bg-surface-container rounded-3xl border border-outline-variant/30 flex flex-col",
            "lg:col-span-2",
          )}
        >
          <div className="p-5 sm:p-6 pb-0 flex justify-between items-center mb-4">
            <h3 className="text-xl font-medium text-on-surface">Contact Log</h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/history")}
                className="text-primary font-semibold text-sm hover:underline flex items-center gap-1"
              >
                Recent <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="px-5 sm:px-6 pb-6 space-y-4 flex-1 overflow-y-auto">
            {activities.length > 0 ? (
              activities.map((activity) => (
                <ActivityItem
                  key={activity.id}
                  activity={activity}
                  contacts={contacts}
                  onOpenContact={(contact) => {
                    setSelectedContact(contact);
                    setIsDetailsModalOpen(true);
                  }}
                />
              ))
            ) : (
              <div className="text-center py-12">
                <p className="text-on-surface-variant">
                  No recent activity to show.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Priority Tasks & Info */}
        <div className="space-y-6">
          <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/30 h-full flex flex-col">
            <h3 className="text-xl font-medium text-on-surface mb-6 flex items-center justify-between">
              Follow-up Queue
            </h3>
            <div className="space-y-3 flex-1 overflow-y-auto">
              {tasks.length > 0 ? (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => {
                      if (task.contactId) {
                        const contact = contacts.find(
                          (c) => c.id === task.contactId,
                        );
                        if (contact) {
                          setSelectedContact(contact);
                          setIsDetailsModalOpen(true);
                        }
                      }
                    }}
                    className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant hover:border-primary/30 transition-colors flex items-center gap-4 cursor-pointer group"
                  >
                    <div className="w-6 h-6 rounded border-2 border-outline group-hover:border-primary transition-colors flex-shrink-0"></div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-on-surface truncate">
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {task.contactName && (
                          <span className="text-xs text-primary font-medium">
                            {task.contactName}
                          </span>
                        )}
                        <span className="text-[10px] text-on-surface-variant flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {task.dueDate}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-on-surface-variant text-sm">
                    No pending tasks.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ContactDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        contact={selectedContact}
      />
      <LogInteractionModal
        isOpen={isLogInteractionOpen}
        onClose={() => setIsLogInteractionOpen(false)}
      />
    </motion.div>
  );
}
