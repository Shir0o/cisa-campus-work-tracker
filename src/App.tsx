import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Dashboard from './views/Dashboard';
import Attendance from './views/Attendance';
import OutreachBoard from './views/OutreachBoard';
import Directory from './views/Directory';
import SignUp from './views/SignUp';

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
      <Routes>
        <Route path="/signup" element={<SignUp />} />
        
        <Route path="/" element={
          <DashboardLayout>
            <Dashboard />
          </DashboardLayout>
        } />
        
        <Route path="/attendance" element={
          <DashboardLayout>
            <Attendance />
          </DashboardLayout>
        } />
        
        <Route path="/board" element={
          <DashboardLayout>
            <OutreachBoard />
          </DashboardLayout>
        } />
        
        <Route path="/directory" element={
          <DashboardLayout>
            <Directory />
          </DashboardLayout>
        } />

        {/* Redirect unknown routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
