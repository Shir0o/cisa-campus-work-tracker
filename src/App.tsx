import React, { createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { cn } from './lib/utils';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import MobileNav from './components/layout/MobileNav';
import Dashboard from './views/Dashboard';
import Attendance from './views/Attendance';
import OutreachBoard from './views/OutreachBoard';
import Directory from './views/Directory';
import SignUp from './views/SignUp';
import { AuthProvider, useAuth } from './components/AuthProvider';

interface LayoutContextType {
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (value: boolean) => void;
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
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
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
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
    <LayoutContext.Provider value={{ isSidebarCollapsed, setIsSidebarCollapsed }}>
      <div className="flex min-h-screen bg-background pb-16 lg:pb-0">
        <Sidebar 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
        />
        <div className={cn(
          "flex-1 flex flex-col min-h-screen transition-all duration-300 min-w-0",
          isSidebarCollapsed ? "lg:ml-20" : "lg:ml-72"
        )}>
          <TopBar onMenuClick={() => setIsSidebarOpen(true)} />
          <main className="flex-1 overflow-x-hidden w-full overflow-y-auto">
            {children}
          </main>
        </div>
        <MobileNav />
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

          {/* Redirect unknown routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}
