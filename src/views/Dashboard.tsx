import React, { useEffect, useState } from 'react';
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
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, orderBy, limit, collectionGroup, where, getDoc, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { cn } from '../lib/utils';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';
import { Contact, Activity, Interaction, Comment, SystemActivity } from '../types';
import { Skeleton } from '../components/ui/Skeleton';
import { aiService } from '../services/aiService';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';

interface ActivityItemProps {
  key?: React.Key;
  activity: Activity;
  contacts: Contact[];
  onOpenContact: (contact: Contact) => void;
}

function ActivityItem({ activity, contacts, onOpenContact }: ActivityItemProps) {
  const [humanMessage, setHumanMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isInteraction = ['call', 'email', 'event'].includes(activity.type);

  useEffect(() => {
    const fetchHumanFriendly = async () => {
      const fingerprint = `${activity.id}-${activity.type}-${activity.description?.length || 0}`;
      
      try {
        const cacheRef = doc(db, 'ai_summaries', `msg-${fingerprint}`);
        const cacheSnap = await getDoc(cacheRef);
        
        if (cacheSnap.exists()) {
          setHumanMessage(cacheSnap.data().summary);
          return;
        }

        setLoading(true);
        const msg = await aiService.humanizeActivity(activity);
        
        await setDoc(cacheRef, {
          summary: msg,
          activityIds: [activity.id],
          createdAt: serverTimestamp()
        });

        setHumanMessage(msg);
      } catch (err) {
        console.error("Single Activity Humanization Error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHumanFriendly();
  }, [activity.id]);

  return (
    <div className="flex gap-4 items-start group relative">
      <div className={cn(
        "w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:rounded-xl group-hover:rotate-3",
        activity.type === 'call' ? "bg-primary-container text-primary" :
        activity.type === 'email' ? "bg-secondary-container text-secondary" :
        activity.type === 'event' ? "bg-tertiary-container text-tertiary" :
        activity.type === 'comment' ? "bg-surface-container-high text-on-surface-variant" :
        activity.type === 'edit' ? "bg-surface-container-high text-on-surface-variant" :
        activity.type === 'create' ? "bg-primary-container text-primary" :
        "bg-error-container text-on-error-container"
      )}>
        {activity.type === 'call' && <Phone className="w-5 h-5" />}
        {activity.type === 'email' && <Mail className="w-5 h-5" />}
        {activity.type === 'event' && <Calendar className="w-5 h-5" />}
        {activity.type === 'comment' && <MessageSquare className="w-5 h-5" />}
        {activity.type === 'edit' && <RefreshCw className="w-4 h-4" />}
        {activity.type === 'create' && <Users className="w-5 h-5" />}
        {activity.type === 'alert' && <AlertTriangle className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline gap-2">
          <div className="text-on-surface text-[15px] leading-snug relative group/msg">
            {loading ? (
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-32" />
                <Sparkles className="w-3 h-3 text-primary animate-pulse" />
              </div>
            ) : (
              <div className="relative">
                <p className="font-medium">
                  {humanMessage || (
                    <>
                      <span className="font-semibold text-primary">{activity.user}</span> 
                      {' '}{activity.action}{' '}
                      <span className="font-semibold">{activity.target}</span>
                    </>
                  )}
                </p>
                
                {/* Interaction Hover Details */}
                {isInteraction && activity.description && (
                  <div className="absolute z-20 left-0 top-full mt-2 w-72 p-4 bg-surface-container-high rounded-2xl shadow-2xl border border-outline-variant opacity-0 pointer-events-none group-hover/msg:opacity-100 group-hover/msg:pointer-events-auto transition-all duration-200 transform translate-y-1 group-hover/msg:translate-y-0 backdrop-blur-md">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Original Record</span>
                    </div>
                    <div className="text-xs text-on-surface font-medium leading-relaxed italic bg-surface-container/50 p-3 rounded-xl border border-outline-variant/30">
                      "{activity.description}"
                    </div>
                    <div className="absolute -top-1 left-4 w-2 h-2 bg-surface-container-high border-l border-t border-outline-variant rotate-45" />
                  </div>
                )}
              </div>
            )}
          </div>
          <span className="text-[10px] text-on-surface-variant/60 whitespace-nowrap font-medium">
            {activity.time}
          </span>
        </div>
        
        <div className="flex items-center gap-3 mt-1">
          {activity.contactId && (
            <button
              onClick={() => {
                const contact = contacts.find(c => c.id === activity.contactId);
                if (contact) {
                  onOpenContact(contact);
                }
              }}
              className="text-[10px] font-bold text-primary flex items-center gap-1 hover:gap-1.5 transition-all opacity-0 group-hover:opacity-100"
            >
              Contact Profile <ExternalLink className="w-3 h-3" />
            </button>
          )}
          {isInteraction && (
            <div className="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
              Hover for notes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { isSidebarCollapsed } = useLayout();
  const navigate = useNavigate();
  const firstName = user?.displayName?.split(' ')[0] || 'Campaigner';

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentFollowUpsCount, setRecentFollowUpsCount] = useState(0);

  const [systemActivities, setSystemActivities] = useState<Activity[]>([]);
  const [legacyInteractions, setLegacyInteractions] = useState<Activity[]>([]);
  const [legacyComments, setLegacyComments] = useState<Activity[]>([]);
  const [legacyCreations, setLegacyCreations] = useState<Activity[]>([]);
  const [legacyEdits, setLegacyEdits] = useState<Activity[]>([]);

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  useEffect(() => {
    // 1. Fetch Contacts
    const qContacts = query(collection(db, 'contacts'));
    const unsubscribeContacts = onSnapshot(qContacts, (snapshot) => {
      const contactData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Contact[];
      setContacts(contactData);
      
    const creationEvents = contactData
        .filter(c => c.createdAt)
        .map(c => {
          // Check if we have a system activity for this contact creation
          // We can't easily check 'systemActivities' here because it's a separate state that updates independently
          // So we'll keep the ID consistent so we can filter duplicates in the useMemo
          return {
            id: `create-contact-${c.id}`, // Constant ID format for creations
            user: c.createdByName || 'Tony Wang', // Prefer actual creator, fallback to Tony Wang
            action: 'added a new contact',
            target: c.name,
            contactId: c.id,
            time: new Date(c.createdAt || '').toLocaleDateString() === new Date().toLocaleDateString() ? 'Today' : new Date(c.createdAt || '').toLocaleDateString(),
            type: 'create',
            rawTime: new Date(c.createdAt || '').getTime()
          } as Activity & { rawTime: number };
        });
      
      setLegacyCreations(creationEvents);

      const editEvents: Activity[] = [];
      
      setLegacyEdits(editEvents);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'contacts');
    });

    // 2. Fetch New Activities (The ones we just started logging)
    const qActivities = query(collection(db, 'activities'), orderBy('createdAt', 'desc'), limit(15));
    const unsubscribeActivities = onSnapshot(qActivities, (snapshot) => {
      const activities = snapshot.docs.map(doc => {
        const data = doc.data() as SystemActivity;
        let activityId = doc.id;
        
        // Use a consistent ID for creations and updates to deduplicate with legacy fallback
        if (data.targetType === 'contact') {
          if (data.type === 'create') {
            activityId = `create-contact-${data.targetId}`;
          } else if (data.type === 'edit') {
            activityId = `edit-contact-${data.targetId}`;
          }
        }

        return {
          id: activityId,
          user: data.userName,
          action: data.action,
          target: data.targetName,
          contactId: data.targetType === 'contact' ? data.targetId : undefined,
          time: new Date(data.createdAt).toLocaleDateString() === new Date().toLocaleDateString() ? 'Today' : new Date(data.createdAt).toLocaleDateString(),
          type: data.type,
          description: data.description,
          rawTime: new Date(data.createdAt).getTime()
        } as Activity & { rawTime: number };
      });
      setSystemActivities(activities);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'activities');
    });

    // 3. Fetch Legacy Interactions (For backward parse)
    const qInteractions = query(collectionGroup(db, 'interactions'), orderBy('createdAt', 'desc'), limit(15));
    const unsubscribeInteractions = onSnapshot(qInteractions, (snapshot) => {
      const activities = snapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data() as Interaction;
        const contactId = docSnapshot.ref.path.split('/')[1];
        
        return {
          id: docSnapshot.id,
          user: data.userName,
          action: 'logged an interaction for',
          target: 'a contact', 
          contactId: contactId,
          time: new Date(data.dateTime).toLocaleDateString() === new Date().toLocaleDateString() ? 'Today' : new Date(data.dateTime).toLocaleDateString(),
          type: 'call',
          description: data.content,
          rawTime: new Date(data.dateTime).getTime()
        } as Activity & { rawTime: number };
      });
      setLegacyInteractions(activities);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'interactions (collectionGroup)');
    });

    // 4. Fetch Legacy Comments (For backward parse)
    const qComments = query(collectionGroup(db, 'comments'), orderBy('createdAt', 'desc'), limit(15));
    const unsubscribeComments = onSnapshot(qComments, (snapshot) => {
      const activities = snapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data() as Comment;
        const contactId = docSnapshot.ref.path.split('/')[1];
        
        return {
          id: docSnapshot.id,
          user: data.userName,
          action: 'left a comment on',
          target: 'a contact',
          contactId: contactId,
          time: new Date(data.createdAt).toLocaleDateString() === new Date().toLocaleDateString() ? 'Today' : new Date(data.createdAt).toLocaleDateString(),
          type: 'comment',
          description: data.text,
          rawTime: new Date(data.createdAt).getTime()
        } as Activity & { rawTime: number };
      });
      setLegacyComments(activities);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'comments (collectionGroup)');
    });

    // 5. Recent Follow-ups Count
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const qRecentFollowUps = query(collectionGroup(db, 'interactions'), where('createdAt', '>=', sevenDaysAgo.toISOString()));
    const unsubscribeFollowUps = onSnapshot(qRecentFollowUps, (snapshot) => {
      setRecentFollowUpsCount(snapshot.size);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'interactions count (collectionGroup)');
    });

    return () => {
      unsubscribeContacts();
      unsubscribeActivities();
      unsubscribeInteractions();
      unsubscribeComments();
      unsubscribeFollowUps();
    };
  }, []);

  // Since unifiedActivities depends on states, let's use useMemo instead of another state
  const activities = React.useMemo(() => {
    const merged = [...systemActivities, ...legacyInteractions, ...legacyComments, ...legacyCreations, ...legacyEdits]
      .sort((a: any, b: any) => b.rawTime - a.rawTime)
      .filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i)
      .slice(0, 15);

    // Resolve contact names if we have the IDs
    return merged.map(activity => {
      if (activity.contactId) {
        const contact = contacts.find(c => c.id === activity.contactId);
        if (contact) {
          return {
            ...activity,
            target: contact.name
          };
        }
      }
      return activity;
    });
  }, [systemActivities, legacyInteractions, legacyComments, legacyCreations, legacyEdits, contacts]);

  const metrics = [
    { label: 'Total Contacts', value: contacts.length.toString(), trend: '0%', icon: Users, color: 'primary' },
    { label: 'Recent Follow-ups', value: recentFollowUpsCount.toString(), trend: 'Past 7 Days', icon: CheckCircle2, color: 'secondary' },
  ];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
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
                <div key={i} className="flex gap-4 items-center p-4 bg-surface-container-lowest/50 rounded-xl border border-outline-variant/50">
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
        <h2 className="text-3xl font-normal text-on-surface mb-2">{getGreeting()}, {firstName}</h2>
      </div>

      {/* Metrics Row */}
      <div className={cn(
        "grid gap-4 sm:gap-6 items-start",
        "grid-cols-1 sm:grid-cols-2"
      )}>
        {metrics.map((metric, idx) => (
          <div key={idx} className="bg-surface-container rounded-3xl p-5 sm:p-6 flex flex-col justify-between min-h-[170px] sm:h-48 border border-outline-variant/30 overflow-hidden group">
            <div className="flex items-start justify-between">
              <div className={cn(
                "w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-transform group-hover:scale-105",
                metric.color === 'primary' ? "bg-primary-container text-on-primary-container" :
                metric.color === 'secondary' ? "bg-secondary-container text-on-secondary-container" :
                "bg-tertiary-container text-on-tertiary-container"
              )}>
                <metric.icon className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              {metric.trend && (
                <span className={cn(
                  "px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-semibold flex items-center gap-1",
                  metric.color === 'primary' ? "bg-primary-fixed-dim text-primary" : "bg-secondary-fixed-dim text-secondary"
                )}>
                  {metric.trend === '12%' && <TrendingUp className="w-3 h-3" />}
                  {metric.trend === 'Past 7 Days' && <Clock className="w-3 h-3" />}
                  {metric.trend}
                </span>
              )}
            </div>
            <div className="mt-auto pt-4 sm:pt-0">
              <p className="text-label-sm sm:text-label-lg text-on-surface-variant mb-1">{metric.label}</p>
              <h3 className="text-3xl sm:text-4xl xl:text-5xl font-regular text-on-surface truncate">{metric.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className={cn(
        "grid gap-6 md:gap-8",
        "grid-cols-1 lg:grid-cols-3"
      )}>
        {/* Recent Activity Feed */}
        <div className={cn(
          "bg-surface-container rounded-3xl border border-outline-variant/30 flex flex-col",
          "lg:col-span-2"
        )}>
          <div className="p-5 sm:p-6 pb-0 flex justify-between items-center mb-4">
            <h3 className="text-xl font-medium text-on-surface">Community Pulse</h3>
            <button 
              onClick={() => navigate('/directory')}
              className="text-primary font-semibold text-sm hover:underline flex items-center gap-1"
            >
              Recent <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 sm:px-6 pb-6 space-y-6 flex-1 overflow-hidden">
            <div className="space-y-6">
              {activities.length > 0 ? (
                activities.map((activity) => (
                  <ActivityItem 
                    key={activity.id} 
                    activity={activity} 
                    contacts={contacts}
                    onOpenContact={(c) => {
                      setSelectedContact(c);
                      setIsDetailsModalOpen(true);
                    }}
                  />
                ))
              ) : (
                <div className="text-center py-12">
                  <p className="text-on-surface-variant">No recent activity to show.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Priority Tasks & Info (Mocked or Heuristic) */}
        <div className="space-y-6">
          <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/30 h-full flex flex-col">
            <h3 className="text-xl font-medium text-on-surface mb-6">Priority Tasks</h3>
            <div className="space-y-3 flex-1">
              {contacts.filter(c => c.status === 'Follow Up Required' || c.status === 'Needs Contact').slice(0, 5).map((contact) => (
                <div 
                  key={contact.id} 
                  onClick={() => {
                    setSelectedContact(contact);
                    setIsDetailsModalOpen(true);
                  }}
                  className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant hover:border-primary/30 transition-colors flex items-center gap-4 cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded border-2 border-outline group-hover:border-primary transition-colors flex-shrink-0"></div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">Follow up with {contact.name}</p>
                    <p className={cn(
                      "text-xs mt-0.5",
                      "text-error font-medium"
                    )}>{contact.status}</p>
                  </div>
                </div>
              ))}
              {contacts.filter(c => c.status === 'Follow Up Required' || c.status === 'Needs Contact').length === 0 && (
                <div className="text-center py-8">
                  <p className="text-on-surface-variant text-sm">No pending tasks.</p>
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
    </motion.div>
  );
}
