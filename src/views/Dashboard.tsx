import React, { useEffect, useState } from 'react';
import { 
  Users, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  Clock, 
  RefreshCw,
  Phone,
  Mail,
  Calendar,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, onSnapshot, query, orderBy, limit, collectionGroup, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { cn } from '../lib/utils';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';
import { Contact, Activity, Interaction } from '../types';
import { Skeleton } from '../components/ui/Skeleton';

export default function Dashboard() {
  const { user } = useAuth();
  const { isSidebarCollapsed } = useLayout();
  const firstName = user?.displayName?.split(' ')[0] || 'Campaigner';

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [recentInteractions, setRecentInteractions] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentFollowUpsCount, setRecentFollowUpsCount] = useState(0);

  useEffect(() => {
    // 1. Fetch Contacts for Total Count and Completeness
    const qContacts = query(collection(db, 'contacts'));
    const unsubscribeContacts = onSnapshot(qContacts, (snapshot) => {
      const contactData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Contact[];
      setContacts(contactData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'contacts');
    });

    // 2. Fetch Recent Activities (Interactions across all contacts)
    // Note: collectionGroup requires an index. If this fails, we might need to handle it.
    const qInteractions = query(
      collectionGroup(db, 'interactions'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribeInteractions = onSnapshot(qInteractions, (snapshot) => {
      const activities = snapshot.docs.map(doc => {
        const data = doc.data() as Interaction;
        // Derive target from path if possible, or just use content
        // path is contacts/{id}/interactions/{id}
        const pathParts = doc.ref.path.split('/');
        const contactId = pathParts[1];
        
        return {
          id: doc.id,
          user: data.userName,
          action: 'logged an interaction for',
          target: contactId, // We should ideally fetch the contact name if we had it cached or joined
          time: new Date(data.dateTime).toLocaleDateString() === new Date().toLocaleDateString() ? 'Today' : new Date(data.dateTime).toLocaleDateString(),
          type: 'call', // Default to call for now, or derive from content
          description: data.content
        } as Activity;
      });
      setRecentInteractions(activities);
    }, (error) => {
      // If collectionGroup fails due to missing index, we gracefully log it and show empty
      console.warn('Interactions collectionGroup failed. Index might be required:', error);
    });

    // 3. Count Recent Follow-ups (Last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const qRecentFollowUps = query(
      collectionGroup(db, 'interactions'),
      where('createdAt', '>=', sevenDaysAgo.toISOString())
    );

    const unsubscribeFollowUps = onSnapshot(qRecentFollowUps, (snapshot) => {
      setRecentFollowUpsCount(snapshot.size);
    }, (error) => {
      console.warn('Recent follow-ups count failed:', error);
    });

    return () => {
      unsubscribeContacts();
      unsubscribeInteractions();
      unsubscribeFollowUps();
    };
  }, []);

  const completeness = contacts.length > 0
    ? Math.round((contacts.filter(c => c.email && c.phone).length / contacts.length) * 100)
    : 0;

  const metrics = [
    { label: 'Total Contacts', value: contacts.length.toString(), trend: '0%', icon: Users, color: 'primary' },
    { label: 'Recent Follow-ups', value: recentFollowUpsCount.toString(), trend: 'Past 7 Days', icon: CheckCircle2, color: 'secondary' },
    { label: 'Data Completeness', value: `${completeness}%`, icon: RefreshCw, color: 'tertiary', progress: completeness },
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
        <Skeleton className="h-10 w-64 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Skeleton className="h-48 rounded-3xl" />
          <Skeleton className="h-48 rounded-3xl" />
          <Skeleton className="h-48 rounded-3xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Skeleton className="lg:col-span-2 h-96 rounded-3xl" />
          <Skeleton className="h-96 rounded-3xl" />
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
        <p className="text-body-lg text-on-surface-variant">Here is an overview of your active Campus Hub community.</p>
      </div>

      {/* Metrics Row */}
      <div className={cn(
        "grid gap-4 sm:gap-6 items-start",
        "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
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
              {metric.progress !== undefined && (
                <div className="w-full bg-on-surface/5 rounded-full h-1.5 mt-3 sm:mt-4">
                  <div className="bg-tertiary h-1.5 rounded-full transition-all duration-1000" style={{ width: `${metric.progress}%` }}></div>
                </div>
              )}
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
          "bg-surface-container rounded-3xl p-5 sm:p-6 border border-outline-variant/30",
          "lg:col-span-2"
        )}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-medium text-on-surface">Recent Activity</h3>
            <button className="text-primary font-semibold text-sm hover:underline flex items-center gap-1">
              View All <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-6">
            {recentInteractions.length > 0 ? (
              recentInteractions.map((activity) => (
                <div key={activity.id} className="flex gap-4 items-start group">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110",
                    activity.type === 'call' ? "bg-primary-fixed text-on-primary-fixed" :
                    activity.type === 'email' ? "bg-secondary-fixed text-on-secondary-fixed" :
                    activity.type === 'event' ? "bg-tertiary-fixed text-on-tertiary-fixed" :
                    "bg-error-container text-on-error-container"
                  )}>
                    {activity.type === 'call' && <Phone className="w-5 h-5" />}
                    {activity.type === 'email' && <Mail className="w-5 h-5" />}
                    {activity.type === 'event' && <Calendar className="w-5 h-5" />}
                    {activity.type === 'alert' && <AlertTriangle className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-on-surface">
                      <span className="font-bold">{activity.user}</span> {activity.action} <span className="font-bold">{activity.target}</span>.
                    </p>
                    <p className="text-sm text-on-surface-variant mt-1">
                      {activity.time} {activity.description && `• ${activity.description}`}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <p className="text-on-surface-variant">No recent activity found.</p>
              </div>
            )}
          </div>
        </div>

        {/* Priority Tasks & Info (Mocked or Heuristic) */}
        <div className="space-y-6">
          <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/30 h-full flex flex-col">
            <h3 className="text-xl font-medium text-on-surface mb-6">Priority Tasks</h3>
            <div className="space-y-3 flex-1">
              {contacts.filter(c => c.status === 'Follow Up Required' || c.status === 'Needs Contact').slice(0, 5).map((contact) => (
                <div key={contact.id} className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant hover:border-primary/30 transition-colors flex items-center gap-4 cursor-pointer group">
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
    </motion.div>
  );
}
