import React, { createContext, useContext } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { cn } from "./lib/utils";
import Sidebar from "./components/layout/Sidebar";
import TopBar from "./components/layout/TopBar";
import MobileNav from "./components/layout/MobileNav";
import NewContactModal from "./components/modals/NewContactModal";
import Landing from "./views/landings/Landing";
import Attendance from "./views/Attendance";
import OutreachBoard from "./views/OutreachBoard";
import Directory from "./views/Directory";
import History from "./views/History";
import PrayerList from "./views/PrayerList";
import AnsweredList from "./views/AnsweredList";
import Settings from "./views/Settings";
import SignUp from "./views/SignUp";
import { AuthProvider, useAuth } from "./components/AuthProvider";
import { ThemeProvider } from "./components/ThemeProvider";
import { Plus } from "lucide-react";
import { Skeleton } from "./components/ui/Skeleton";
import { Contact } from "./types";
import ContactDetailsModal from "./components/modals/ContactDetailsModal";
import LogInteractionModal from "./components/modals/LogInteractionModal";
import Toaster from "./components/Toaster";
import { ErrorBoundary } from "./components/ErrorBoundary";
import FeedbackFAB from "./components/FeedbackFAB";
import FeedbackList from "./views/FeedbackList";
import SubmitFeedback from "./views/SubmitFeedback";
import { canAccessRoute, defaultRouteForRole, AppRole } from "./lib/permissions";

const CoordinationNotes = React.lazy(() => import("./views/CoordinationNotes"));
const CoordinationTrash = React.lazy(() => import("./views/CoordinationTrash"));
const Messages = React.lazy(() => import("./views/Messages"));
const EmbedCoordinationDoc = React.lazy(() => import("./views/EmbedCoordinationDoc"));

interface LayoutContextType {
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (value: boolean) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (value: boolean) => void;
  openNewContact: (initialStage?: string) => void;
  openLogInteraction: () => void;
  setSelectedContact: (contact: Contact | null) => void;
  searchOpen: boolean;
  setSearchOpen: (value: boolean) => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error("useLayout must be used within a LayoutProvider");
  }
  return context;
}

function EmailPasswordForm() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signInWithEmail(email, password);
    } catch (err: any) {
      const code = err?.code ?? "";
      setError(
        code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")
          ? "Incorrect email or password."
          : "Sign-in failed. Please try again.",
      );
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-3 text-left">
      <input
        type="email"
        autoComplete="username"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-4 py-3 rounded-2xl bg-surface border border-outline-variant focus:border-primary outline-none text-on-surface"
        required
      />
      <input
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full px-4 py-3 rounded-2xl bg-surface border border-outline-variant focus:border-primary outline-none text-on-surface"
        required
      />
      {error && <p className="text-sm text-error px-1">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full py-3 bg-primary text-on-primary rounded-full font-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in with email"}
      </button>
    </form>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isApproved, loading, signIn, logOut } = useAuth();
  const isSidebarCollapsed =
    typeof window !== "undefined" &&
    localStorage.getItem("sidebar_collapsed") === "true";

  if (loading) {
    if (!user) {
      return <div className="min-h-screen bg-background" />;
    }
    return (
      <div className="flex min-h-screen bg-background overflow-hidden">
        {/* Sidebar Skeleton */}
        <div
          className={cn(
            "hidden md:flex flex-col bg-surface-container border-r border-outline-variant p-6 gap-8 transition-all duration-300",
            isSidebarCollapsed ? "w-20" : "w-20 lg:w-72",
          )}
        >
          <Skeleton
            className={cn(
              "h-10 rounded-xl",
              isSidebarCollapsed ? "w-10" : "w-32",
            )}
          />
          <Skeleton className="h-12 w-full rounded-2xl" />
          <div className="space-y-4">
            {!isSidebarCollapsed && <Skeleton className="h-4 w-24" />}
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
          <h2 className="text-3xl font-regular mb-4">Welcome to CISA Campus Work Tracker</h2>
          <p className="text-on-surface-variant mb-8">
            Please sign in with your Google account to continue.
          </p>
          <button
            onClick={signIn}
            className="w-full py-4 bg-primary text-on-primary rounded-full font-bold flex items-center justify-center gap-3 hover:opacity-90 active:scale-95 transition-all"
          >
            <img
              src="https://www.google.com/favicon.ico"
              alt="Google"
              className="w-5 h-5 bg-white rounded-full p-0.5"
            />
            Sign in with Google
          </button>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-outline-variant" />
            <span className="text-xs text-on-surface-variant uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-outline-variant" />
          </div>

          <EmailPasswordForm />
        </div>
      </div>
    );
  }

  if (!isApproved) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <div className="max-w-md w-full bg-surface-container rounded-3xl p-8 border border-outline-variant shadow-lg">
          <div className="w-16 h-16 bg-error-container text-error rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-6a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
          <p className="text-on-surface-variant mb-8">
            Your account is pending approval. Please contact the administrator
            to gain access to the dashboard.
          </p>
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

function RoleGuard({ minRole, children }: { minRole: AppRole; children: React.ReactNode }) {
  const { role } = useAuth();
  const { pathname } = useLocation();
  if (!canAccessRoute(role, pathname)) {
    return <Navigate to={defaultRouteForRole(role)} replace />;
  }
  return <>{children}</>;
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isNewContactModalOpen, setIsNewContactModalOpen] =
    React.useState(false);
  const [newContactStage, setNewContactStage] = React.useState<
    string | undefined
  >(undefined);
  const [isLogInteractionOpen, setIsLogInteractionOpen] = React.useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [selectedContact, setSelectedContact] = React.useState<Contact | null>(
    null,
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(() => {
    const saved = localStorage.getItem("sidebar_collapsed");
    return saved === "true";
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const newState = !prev;
      localStorage.setItem("sidebar_collapsed", String(newState));
      return newState;
    });
  };

  return (
    <LayoutContext.Provider
      value={{
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        openNewContact: (initialStage?: string) => {
          setNewContactStage(initialStage);
          setIsNewContactModalOpen(true);
        },
        openLogInteraction: () => setIsLogInteractionOpen(true),
        setSelectedContact: (contact: Contact | null) =>
          setSelectedContact(contact),
        searchOpen,
        setSearchOpen,
      }}
    >
      <div className="flex min-h-screen bg-background pb-16 md:pb-0 relative">
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          onLogInteraction={() => setIsLogInteractionOpen(true)}
        />
        <div
          className={cn(
            "flex-1 flex flex-col min-h-screen transition-all duration-300 min-w-0",
          )}
        >
          <TopBar />
          <main className="flex-1 overflow-x-hidden w-full overflow-y-auto pb-36 md:pb-8">
            {children}
          </main>
        </div>

        <MobileNav />

        <NewContactModal
          isOpen={isNewContactModalOpen}
          onClose={() => {
            setIsNewContactModalOpen(false);
            setNewContactStage(undefined);
          }}
          initialStage={newContactStage}
        />

        <LogInteractionModal
          isOpen={isLogInteractionOpen}
          onClose={() => setIsLogInteractionOpen(false)}
        />

        <ContactDetailsModal
          isOpen={selectedContact !== null}
          onClose={() => setSelectedContact(null)}
          contact={selectedContact}
        />

        <FeedbackFAB />
        <Toaster />
      </div>
    </LayoutContext.Provider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" storageKey="campus-hub-theme">
        <Router>
          <AuthProvider>
            <Routes>
              <Route path="/signup" element={<SignUp />} />

              <Route
                path="/embed/coordination/:docId"
                element={
                  <React.Suspense fallback={null}>
                    <EmbedCoordinationDoc />
                  </React.Suspense>
                }
              />

              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <RoleGuard minRole="viewer">
                      <DashboardLayout>
                        <Landing />
                      </DashboardLayout>
                    </RoleGuard>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/attendance"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Attendance />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/board"
                element={
                  <ProtectedRoute>
                    <RoleGuard minRole="manager">
                      <DashboardLayout>
                        <OutreachBoard />
                      </DashboardLayout>
                    </RoleGuard>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/directory"
                element={
                  <ProtectedRoute>
                    <RoleGuard minRole="operator">
                      <DashboardLayout>
                        <Directory />
                      </DashboardLayout>
                    </RoleGuard>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/history"
                element={
                  <ProtectedRoute>
                    <RoleGuard minRole="manager">
                      <DashboardLayout>
                        <History />
                      </DashboardLayout>
                    </RoleGuard>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/prayer"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <PrayerList />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/answered"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <AnsweredList />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <Settings />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/messages"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <React.Suspense
                        fallback={
                          <div className="p-8 space-y-6">
                            <Skeleton className="h-10 w-64" />
                            <Skeleton className="h-96 w-full rounded-3xl" />
                          </div>
                        }
                      >
                        <Messages />
                      </React.Suspense>
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/feedback"
                element={
                  <ProtectedRoute>
                    <DashboardLayout>
                      <SubmitFeedback />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin/feedback"
                element={
                  <ProtectedRoute>
                    <RoleGuard minRole="admin">
                      <DashboardLayout>
                        <FeedbackList />
                      </DashboardLayout>
                    </RoleGuard>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/coordination"
                element={
                  <ProtectedRoute>
                    <RoleGuard minRole="operator">
                      <DashboardLayout>
                        <React.Suspense
                          fallback={
                            <div className="p-8 space-y-6">
                              <Skeleton className="h-10 w-64" />
                              <Skeleton className="h-96 w-full rounded-3xl" />
                            </div>
                          }
                        >
                          <CoordinationNotes />
                        </React.Suspense>
                      </DashboardLayout>
                    </RoleGuard>
                  </ProtectedRoute>
                }
              />

              <Route
                path="/coordination/trash"
                element={
                  <ProtectedRoute>
                    <RoleGuard minRole="admin">
                      <DashboardLayout>
                        <React.Suspense
                          fallback={
                            <div className="p-8 space-y-6">
                              <Skeleton className="h-10 w-64" />
                              <Skeleton className="h-96 w-full rounded-3xl" />
                            </div>
                          }
                        >
                          <CoordinationTrash />
                        </React.Suspense>
                      </DashboardLayout>
                    </RoleGuard>
                  </ProtectedRoute>
                }
              />

              {/* Redirect unknown routes */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </Router>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
