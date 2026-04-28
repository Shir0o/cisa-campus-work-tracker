import React, { createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { cn } from './lib/utils';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import MobileNav from './components/layout/MobileNav';
import NewContactModal from './components/modals/NewContactModal';
import Dashboard from './views/Dashboard';
import Attendance from './views/Attendance';
import OutreachBoard from './views/OutreachBoard';
import Directory from './views/Directory';
import Settings from './views/Settings';
import SignUp from './views/SignUp';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { 
  Plus
} from 'lucide-react';
import { Skeleton } from './components/ui/Skeleton';

interface LayoutContextType {
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (value: boolean) => void;
  openNewContact: () => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isApproved, loading, signIn, logOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen bg-background overflow-hidden">
        {/* Sidebar Skeleton */}
        <div className="hidden lg:flex flex-col w-72 bg-surface-container border-r border-outline-variant p-6 gap-8">
          <Skeleton className="h-10 w-32 rounded-xl" />
          <Skeleton className="h-12 w-full rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        
        <div className="flex-1 flex flex-col min-h-screen">
          {/* TopBar Skeleton */}
          <div className="h-16 border-b border-outline-variant px-6 flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
          
          {/* Main Content Skeleton */}
          <div className="p-8 space-y-8 flex-1">
            <div className="space-y-2">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-4 w-96" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Skeleton className="h-32 rounded-3xl" />
              <Skeleton className="h-32 rounded-3xl" />
              <Skeleton className="h-32 rounded-3xl" />
            </div>
            
            <Skeleton className="h-96 w-full rounded-3xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-surface-container rounded-3xl p-8 text-center border border-outline-variant shadow-lg">
          <h2 className="text-3xl font-regular mb-4">Welcome to Campus Hub</h2>
          <p className="text-on-surface-variant mb-8">Please sign in with your Google account to continue.</p>
          <button 
            onClick={signIn}
            className="w-full py-4 bg-primary text-on-primary rounded-full font-bold flex items-center justify-center gap-3 hover:opacity-90 active:scale-95 transition-all"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 bg-white rounded-full p-0.5" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (!isApproved) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <div className="max-w-md w-full bg-surface-container rounded-3xl p-8 border border-outline-variant shadow-lg">
          <div className="w-16 h-16 bg-error-container text-error rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-6a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
          <p className="text-on-surface-variant mb-8">Your account is pending approval. Please contact the administrator to gain access to the dashboard.</p>
          <button 
            onClick={logOut}
            className="w-full py-3 border border-outline text-on-surface rounded-full font-medium hover:bg-surface-variant transition-all"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isNewContactModalOpen, setIsNewContactModalOpen] = React.useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved === 'true';
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed(prev => {
      const newState = !prev;
      localStorage.setItem('sidebar_collapsed', String(newState));
      return newState;
    });
  };

  return (
    <LayoutContext.Provider value={{ 
      isSidebarCollapsed, 
      setIsSidebarCollapsed, 
      openNewContact: () => setIsNewContactModalOpen(true) 
    }}>
      <div className="flex min-h-screen bg-background pb-16 lg:pb-0">
        <Sidebar 
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          onNewContact={() => setIsNewContactModalOpen(true)}
        />
        <div className={cn(
          "flex-1 flex flex-col min-h-screen transition-all duration-300 min-w-0",
          isSidebarCollapsed ? "lg:ml-20" : "lg:ml-72"
        )}>
          <TopBar onMenuClick={toggleSidebarCollapse} />
          <main className="flex-1 overflow-x-hidden w-full overflow-y-auto">
            {children}
          </main>
        </div>
        
        <MobileNav />
        
        <NewContactModal 
          isOpen={isNewContactModalOpen} 
          onClose={() => setIsNewContactModalOpen(false)} 
        />
      </div>
    </LayoutContext.Provider>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/signup" element={<SignUp />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              <DashboardLayout>
                <Dashboard />
              </DashboardLayout>
            </ProtectedRoute>
          } />
          
          <Route path="/attendance" element={
            <ProtectedRoute>
              <DashboardLayout>
                <Attendance />
              </DashboardLayout>
            </ProtectedRoute>
          } />
          
          <Route path="/board" element={
            <ProtectedRoute>
              <DashboardLayout>
                <OutreachBoard />
              </DashboardLayout>
            </ProtectedRoute>
          } />
          
          <Route path="/directory" element={
            <ProtectedRoute>
              <DashboardLayout>
                <Directory />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          <Route path="/settings" element={
            <ProtectedRoute>
              <DashboardLayout>
                <Settings />
              </DashboardLayout>
            </ProtectedRoute>
          } />

          {/* Redirect unknown routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}
