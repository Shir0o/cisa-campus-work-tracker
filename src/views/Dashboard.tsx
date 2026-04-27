import React from 'react';
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
import { motion } from 'motion/react';
import { ACTIVITIES, TASKS } from '../constants';
import { cn } from '../lib/utils';
import { useAuth } from '../components/AuthProvider';

export default function Dashboard() {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(' ')[0] || 'Campaigner';

  const metrics = [
    { label: 'Total Contacts', value: '2,405', trend: '12%', icon: Users, color: 'primary' },
    { label: 'Recent Follow-ups', value: '342', trend: 'Past 7 Days', icon: CheckCircle2, color: 'secondary' },
    { label: 'Integrated Systems', value: '85%', icon: RefreshCw, color: 'tertiary', progress: 85 },
  ];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-6 md:p-8 space-y-8"
    >
      <div>
        <h2 className="text-3xl font-normal text-on-surface mb-2">{getGreeting()}, {firstName}</h2>
        <p className="text-body-lg text-on-surface-variant">Here is an overview of your active CampusHub community.</p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {metrics.map((metric, idx) => (
          <div key={idx} className="bg-surface-container rounded-3xl p-6 flex flex-col justify-between h-48 border border-outline-variant/30">
            <div className="flex items-start justify-between">
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center",
                metric.color === 'primary' ? "bg-primary-container text-on-primary-container" :
                metric.color === 'secondary' ? "bg-secondary-container text-on-secondary-container" :
                "bg-tertiary-container text-on-tertiary-container"
              )}>
                <metric.icon className="w-6 h-6" />
              </div>
              {metric.trend && (
                <span className={cn(
                  "px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1",
                  metric.color === 'primary' ? "bg-primary-fixed-dim text-primary" : "bg-secondary-fixed-dim text-secondary"
                )}>
                  {metric.trend === '12%' && <TrendingUp className="w-3 h-3" />}
                  {metric.trend === 'Past 7 Days' && <Clock className="w-3 h-3" />}
                  {metric.trend}
                </span>
              )}
            </div>
            <div>
              <p className="text-label-lg text-on-surface-variant mb-1">{metric.label}</p>
              <h3 className="text-5xl font-regular text-on-surface">{metric.value}</h3>
              {metric.progress && (
                <div className="w-full bg-surface-variant rounded-full h-1.5 mt-4">
                  <div className="bg-tertiary h-1.5 rounded-full" style={{ width: `${metric.progress}%` }}></div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity Feed */}
        <div className="lg:col-span-2 bg-surface-container rounded-3xl p-6 border border-outline-variant/30">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-medium text-on-surface">Recent Activity</h3>
            <button className="text-primary font-semibold text-sm hover:underline flex items-center gap-1">
              View All <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-6">
            {ACTIVITIES.map((activity) => (
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
            ))}
          </div>
        </div>

        {/* Priority Tasks & Info */}
        <div className="space-y-6">
          <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/30 h-full flex flex-col">
            <h3 className="text-xl font-medium text-on-surface mb-6">Priority Tasks</h3>
            <div className="space-y-3 flex-1">
              {TASKS.map((task) => (
                <div key={task.id} className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant hover:border-primary/30 transition-colors flex items-center gap-4 cursor-pointer group">
                  <div className="w-6 h-6 rounded border-2 border-outline group-hover:border-primary transition-colors flex-shrink-0"></div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">{task.title}</p>
                    <p className={cn(
                      "text-xs mt-0.5",
                      task.dueDate.includes('Today') ? "text-error font-medium" : "text-on-surface-variant"
                    )}>{task.dueDate}</p>
                  </div>
                </div>
              ))}
            </div>
            
          </div>
        </div>
      </div>
    </motion.div>
  );
}
