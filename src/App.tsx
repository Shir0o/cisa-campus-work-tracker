import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Dashboard from './views/Dashboard';
import Attendance from './views/Attendance';
import OutreachBoard from './views/OutreachBoard';
import Directory from './views/Directory';
import SignUp from './views/SignUp';
import { AuthProvider, useAuth } from './components/AuthProvider';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isApproved, loading, signIn } = useAuth();

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
          <h2 className="text-3xl font-regular mb-4">Welcome to OutreachPro</h2>
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
        <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
        <p className="text-on-surface-variant">Your account is pending approval. Please contact the administrator.</p>
      </div>
    );
  }

  return <>{children}</>;
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col md:ml-72 min-h-screen">
        <TopBar />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
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
