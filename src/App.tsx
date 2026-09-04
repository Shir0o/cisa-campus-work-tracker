import React, { createContext, useContext } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useParams,
  Link,
} from "react-router-dom";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { cn } from "./lib/utils";
import { db } from "./lib/firebase";
import OwnerViewBanner from "./components/layout/OwnerViewBanner";
import ImpersonateModal from "./components/layout/ImpersonateModal";
import TopNav from "./components/layout/TopNav";
import MobileNav from "./components/layout/MobileNav";
import NavRail from "./components/layout/NavRail";
import NavChromeStrip from "./components/layout/NavChromeStrip";
import { useNavShell } from "./components/NavShellProvider";
import { useMediaQuery } from "./lib/useMediaQuery";
import { NavShellProvider } from "./components/NavShellProvider";
import NewContactModal from "./components/modals/NewContactModal";
import Landing from "./views/landings/Landing";
import { AuthProvider, useAuth } from "./components/AuthProvider";
import { ThemeProvider } from "./components/ThemeProvider";
import { LanguageProvider } from "./components/LanguageProvider";
import { Plus } from "lucide-react";
import { Skeleton } from "./components/ui/Skeleton";
import { Contact } from "./types";
import ContactDetailsModal from "./components/modals/ContactDetailsModal";
import LogInteractionModal from "./components/modals/LogInteractionModal";
import SmartImportModal from "./components/modals/SmartImportModal";
import Toaster from "./components/Toaster";
import { ErrorBoundary } from "./components/ErrorBoundary";
import FeedbackFAB from "./components/FeedbackFAB";
import { ReleaseSheet } from "./components/release/ReleaseSheet";
import WhatsNewModal from "./components/WhatsNewModal";
import whatsNewManifest from "./generated/whats-new.json";
import { shouldShowWhatsNew, WHATS_NEW_STORAGE_KEY } from "./lib/whatsNew";
import type { WhatsNewManifest } from "./scripts/compile-whats-new";
import { NotificationPermissionBanner } from "./components/notifications/NotificationPermissionBanner";
import { canAccessRoute, defaultRouteForRole, AppRole } from "./lib/permissions";
import { lazyWithRetry } from "./lib/lazyWithRetry";
import { usePreserveScroll } from "./lib/usePreserveScroll";
import { UsageStats } from "./lib/usageStats";
import { applyRoster } from "./lib/walking";
import { applyTeams } from "./lib/teams";
import { applyPartners, subscribePartners } from "./lib/partners";
/* v8 ignore start -- trivial dynamic-import factories; vi.mock intercepts module resolution */
const Attendance = lazyWithRetry(() => import("./views/Attendance"));
const Outreach = lazyWithRetry(() => import("./views/Outreach"));
const OutreachBoard = lazyWithRetry(() => import("./views/OutreachBoard"));
const Directory = lazyWithRetry(() => import("./views/Directory"));
const History = lazyWithRetry(() => import("./views/History"));
const PrayerList = lazyWithRetry(() => import("./views/PrayerList"));
const AnsweredList = lazyWithRetry(() => import("./views/AnsweredList"));
const Settings = lazyWithRetry(() => import("./views/Settings"));
const SignUp = lazyWithRetry(() => import("./views/SignUp"));
const PrivacyPolicy = lazyWithRetry(() => import("./views/PrivacyPolicy"));
const Support = lazyWithRetry(() => import("./views/Support"));
const FeedbackList = lazyWithRetry(() => import("./views/FeedbackList"));
const SubmitFeedback = lazyWithRetry(() => import("./views/SubmitFeedback"));
/* v8 ignore stop */
const CoordinationNotes = lazyWithRetry(() => import("./views/CoordinationNotes"));
const CoordinationTrash = lazyWithRetry(() => import("./views/CoordinationTrash"));
const Messages = lazyWithRetry(() => import("./views/Messages"));
const Questions = lazyWithRetry(() => import("./views/Questions"));
const Visits = lazyWithRetry(() => import("./views/Visits"));
const EmbedCoordinationDoc = lazyWithRetry(() => import("./views/EmbedCoordinationDoc"));
const PublicStudyReader = lazyWithRetry(() => import("./views/PublicStudyReader"));
const BibleStudyEditor = lazyWithRetry(() => import("./views/BibleStudyEditor"));


interface LayoutContextType {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (value: boolean) => void;
  openNewContact: (initialStage?: string) => void;
  openLogInteraction: (contactId?: string) => void;
  openSmartImport: () => void;
  selectedContact: Contact | null;
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
        className="w-full py-3 bg-primary text-on-primary rounded-full font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in with email"}
      </button>
      <div className="pt-2 text-center flex items-center justify-center gap-3 text-xs text-on-surface-variant">
        <a
          href="https://shir0o.github.io/cisa-campus-work-tracker/privacy.html"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-accent transition-colors underline"
        >
          Privacy Policy
        </a>
        <span>&bull;</span>
        <a
          href="https://shir0o.github.io/cisa-campus-work-tracker/support.html"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-accent transition-colors underline"
        >
          Support
        </a>
      </div>
    </form>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isApproved, loading, signIn, logOut } = useAuth();
  const [signInError, setSignInError] = React.useState<string | null>(null);

  const handleSignIn = async () => {
    setSignInError(null);
    try {
      await signIn();
    } catch (e: any) {
      setSignInError(e?.message || 'Google sign-in failed. Please try again.');
    }
  };

  if (loading) {
    if (!user) {
      return <div className="min-h-screen bg-background" />;
    }
    return (
      <div className="flex min-h-screen bg-background overflow-hidden">
        {/* TopNav Skeleton */}
        <div className="flex-1 flex flex-col min-h-screen">
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
        <div className="max-w-md w-full bg-surface-container rounded-3xl p-8 text-center border border-outline-variant">
          <h2 className="text-3xl font-regular mb-4">Welcome to CISA Campus Work Tracker</h2>
          <p className="text-on-surface-variant mb-8">
            Please sign in with your Google account to continue.
          </p>
          <button
            onClick={handleSignIn}
            className="w-full py-4 bg-primary text-on-primary rounded-full font-semibold flex items-center justify-center gap-3 hover:opacity-90 active:scale-95 transition-all"
          >
            <img
              src="https://www.google.com/favicon.ico"
              alt="Google"
              className="w-5 h-5 bg-white rounded-full p-0.5"
            />
            Sign in with Google
          </button>

          {signInError && (
            <p className="mt-3 text-sm text-error px-1" role="alert">
              {signInError}
            </p>
          )}

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-outline-variant" />
            <span className="text-xs text-on-surface-variant">or</span>
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
        <div className="max-w-md w-full bg-surface-container rounded-3xl p-8 border border-outline-variant">
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
          <h2 className="text-2xl font-semibold mb-2">Access Restricted</h2>
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
  const location = useLocation();
  const navigate = useNavigate();
  const { contactId } = useParams();
  const isMessagesPage = location.pathname.startsWith("/messages");
  const initialTab = new URLSearchParams(location.search).get("tab") === "thread" ? ("thread" as const) : undefined;
  const { setImpersonateTarget, impersonateTarget, effectiveIdentityKey, user, role } = useAuth();
  const [isNewContactModalOpen, setIsNewContactModalOpen] =
    React.useState(false);
  const [newContactStage, setNewContactStage] = React.useState<
    string | undefined
  >(undefined);
  const [isLogInteractionOpen, setIsLogInteractionOpen] = React.useState(false);
  const [logInteractionContactId, setLogInteractionContactId] = React.useState<
    string | undefined
  >(undefined);
  const [isSmartImportOpen, setIsSmartImportOpen] = React.useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [isImpersonateModalOpen, setIsImpersonateModalOpen] = React.useState(false);
  const [selectedContact, setSelectedContact] = React.useState<Contact | null>(
    null,
  );
  const [isWhatsNewOpen, setIsWhatsNewOpen] = React.useState(false);
  const previousIdentityKey = React.useRef(effectiveIdentityKey);

  React.useEffect(() => {
    const lastSeen = localStorage.getItem(WHATS_NEW_STORAGE_KEY);
    if (shouldShowWhatsNew(whatsNewManifest as WhatsNewManifest, lastSeen, 'web')) {
      setIsWhatsNewOpen(true);
    }
  }, []);

  // Contact detail is now a real URL route (`/people/:contactId`), so the
  // browser back button and top-nav links always leave the detail page. The
  // route is the source of truth; this state is only the loaded contact object.
  React.useEffect(() => {
    if (!contactId) {
      setSelectedContact(null);
      return;
    }
    const ref = doc(db, "contacts", contactId);
    const unsubscribe = onSnapshot(ref, (snap) => {
      const exists =
        typeof snap.exists === "function" ? snap.exists() : Boolean(snap.data?.());
      if (exists) {
        setSelectedContact({
          id: contactId,
          ...(snap.data?.() || {}),
        } as Contact);
      } else {
        setSelectedContact(null);
      }
    });
    return unsubscribe;
  }, [contactId, effectiveIdentityKey]);

  const openSelectedContact = (contact: Contact | null) => {
    if (!contact) {
      const from = (location.state as { from?: string } | null)?.from;
      if (from && from !== location.pathname) {
        navigate(from);
      } else if (location.pathname.startsWith("/people/")) {
        navigate(-1);
      } else {
        setSelectedContact(null);
      }
      return;
    }
    // Defensive: never build `/people/${undefined}` even if a caller passes a
    // string id instead of a Contact (e.g. an orphan activity reference).
    if (!contact.id) {
      setSelectedContact(null);
      return;
    }
    setSelectedContact(contact);
    navigate(`/people/${contact.id}`, {
      state: { from: location.pathname },
    });
  };

  // Opening a person swaps the view for the full-page detail; remember where
  // the list was scrolled so "back" lands where you tapped (same pattern as the
  // design's `openContactFor` / `backFromContact`).
  usePreserveScroll(!!(selectedContact && contactId));

  // Navigating to another page leaves the open person detail behind (#257): the
  // detail replaces `children` in <main>, and DashboardLayout is reused across
  // routes, so an uncleared selection would keep the person on screen even after
  // the sidebar/topbar navigates elsewhere. The same goes for an identity
  // change ("See it as they do"): the detail reads the previous viewer's scope.
  // With the URL route in place, this now only needs to clear on non-contact
  // routes; the `/people/:contactId` effect owns the contact route's lifecycle.
  // An identity change while looking at a person closes that page so the next
  // viewer lands back on their own home instead of inheriting the old scope.
  React.useEffect(() => {
    if (previousIdentityKey.current !== effectiveIdentityKey) {
      previousIdentityKey.current = effectiveIdentityKey;
      if (contactId) {
        setSelectedContact(null);
        const from = (location.state as { from?: string } | null)?.from;
        navigate(from && from !== location.pathname ? from : defaultRouteForRole(role));
      }
      return;
    }
    if (!contactId) setSelectedContact(null);
  }, [location.pathname, location.state, effectiveIdentityKey, contactId, role, navigate]);

  // Session 7 (#370): record which screen was opened. This is local-only,
  // anonymous usage shape data for the owner's "what is the app costing"
  React.useEffect(() => {
    if (user?.uid) {
      UsageStats.record(user.uid, {
        type: 'screen',
        path: location.pathname,
        role: role || undefined,
      });
    }
  }, [location.pathname, user?.uid, role]);

  // Pick a desktop shell from the user's preference, falling through to the
  // top-bar shell below lg regardless of preference (#664).
  const { effective } = useNavShell();
  // `lg`, per docs/specs/navigation-shell-preference.md: below the large
  // breakpoint every preference falls through to the top-bar shell, which
  // already carries its own hamburger drawer under `lg` and MobileNav's bottom
  // bar under `md`. This was 768px; see docs/design/DRIFT.md #5.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const useRail = isDesktop && effective !== 'topbar';
  return (
    <LayoutContext.Provider
      value={{
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        openNewContact: (initialStage?: string) => {
          setNewContactStage(initialStage);
          setIsNewContactModalOpen(true);
        },
        openLogInteraction: (contactId?: string) => {
          setLogInteractionContactId(contactId);
          setIsLogInteractionOpen(true);
        },
        openSmartImport: () => setIsSmartImportOpen(true),
        selectedContact,
        setSelectedContact: openSelectedContact,
        searchOpen,
        setSearchOpen,
      }}
    >
      <div className="flex min-h-screen bg-background pb-16 md:pb-0 relative">
        {useRail ? (
          // ── Rail shell: rail on the left, chrome strip + content + banners on the right.
          //    The track pads all four sides so the rail floats with a gutter
          //    of page colour around it — the gutter is what makes the slab
          //    read as an object rather than a wall (ADR 0003).
          <div className="flex-1 flex h-screen min-w-0 p-4 gap-4">
            <NavRail onOpenImpersonateModal={() => setIsImpersonateModalOpen(true)} />
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              <NavChromeStrip onOpenImpersonateModal={() => setIsImpersonateModalOpen(true)} />
              {/* In rail mode the impersonation/owner-view banner sits at the
                  top of the content column rather than full-bleed above the
                  bar (there is no bar). */}
              <OwnerViewBanner onOpenModal={() => setIsImpersonateModalOpen(true)} />
              <main
                className={cn(
                  "flex-1 w-full min-h-0",
                  isMessagesPage
                    ? "flex flex-col overflow-hidden"
                    : selectedContact && contactId
                      ? "overflow-hidden"
                      : "overflow-x-hidden overflow-y-auto pb-36 md:pb-8",
                )}
              >
                {selectedContact && contactId ? (
                  <ContactDetailsModal
                    isOpen
                    onClose={() => openSelectedContact(null)}
                    contact={selectedContact}
                    initialTab={initialTab}
                  />
                ) : (
                  <React.Suspense
                    fallback={
                      <div className="p-8 space-y-6">
                        <Skeleton className="h-10 w-64" />
                        <Skeleton className="h-96 w-full rounded-3xl" />
                      </div>
                    }
                  >
                    <React.Fragment key={effectiveIdentityKey}>{children}</React.Fragment>
                  </React.Suspense>
                )}
              </main>
            </div>
          </div>
        ) : (
          // ── Top-bar shell (or any viewport below lg): existing layout, unchanged.
          <div
            className={cn(
              "flex-1 flex flex-col h-screen transition-all duration-300 min-w-0",
            )}
          >
            <OwnerViewBanner onOpenModal={() => setIsImpersonateModalOpen(true)} />
            <TopNav onOpenImpersonateModal={() => setIsImpersonateModalOpen(true)} />
            <main
              className={cn(
                "flex-1 w-full min-h-0",
                isMessagesPage
                  ? "flex flex-col overflow-hidden"
                  : selectedContact && contactId
                    ? "overflow-hidden"
                    : "overflow-x-hidden overflow-y-auto pb-36 md:pb-8",
              )}
            >
              {selectedContact && contactId ? (
                <ContactDetailsModal
                  isOpen
                  onClose={() => openSelectedContact(null)}
                  contact={selectedContact}
                  initialTab={initialTab}
                />
              ) : (
                <React.Suspense
                  fallback={
                    <div className="p-8 space-y-6">
                      <Skeleton className="h-10 w-64" />
                      <Skeleton className="h-96 w-full rounded-3xl" />
                    </div>
                  }
                >
                  <React.Fragment key={effectiveIdentityKey}>{children}</React.Fragment>
                </React.Suspense>
              )}
            </main>
          </div>
        )}

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
          onClose={() => {
            setIsLogInteractionOpen(false);
            setLogInteractionContactId(undefined);
          }}
          initialContactId={logInteractionContactId}
        />

        <SmartImportModal
          isOpen={isSmartImportOpen}
          onClose={() => setIsSmartImportOpen(false)}
        />

        <ImpersonateModal
          isOpen={isImpersonateModalOpen}
          currentKey={impersonateTarget?.key}
          onPick={(target) => setImpersonateTarget(target)}
          onClose={() => setIsImpersonateModalOpen(false)}
        />

        <FeedbackFAB />
        <ReleaseSheet />
        <WhatsNewModal
          isOpen={isWhatsNewOpen}
          onClose={() => setIsWhatsNewOpen(false)}
          manifest={whatsNewManifest as WhatsNewManifest}
          platform="web"
        />
        <NotificationPermissionBanner />
        <Toaster />
      </div>
    </LayoutContext.Provider>
  );
}

function RosterSync() {
  // Feed the full-timer/trainee roster from the users collection so the pure
  // lib functions (inbox, attention) know who is a full-timer (issue #549),
  // and which team each person is on for the news feed's filter (issue #727).
  React.useEffect(
    () =>
      onSnapshot(collection(db, "users"), (snap) => {
        const docs = snap.docs.map((d) => ({
          uid: d.id,
          ...(d.data() as { role?: string; team?: string | null; displayName?: string | null }),
        }));
        applyRoster(docs.map(({ uid, role }) => ({ uid, role })));
        applyTeams(docs.map(({ uid, team, displayName }) => ({ uid, team, displayName })));
      }),
    [],
  );
  // Feed the gospel-partners arrangement so contact-creation paths can stamp
  // the adder's partner as a co-creator without an extra read.
  React.useEffect(() => subscribePartners(applyPartners), []);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" storageKey="campus-hub-theme">
        <NavShellProvider>
        <Router>
          <AuthProvider>
            <LanguageProvider>
              <RosterSync />
              <Routes>
                <Route
                  path="/signup"
                  element={
                    <React.Suspense fallback={null}>
                      <SignUp />
                    </React.Suspense>
                  }
                />

                <Route
                  path="/embed/coordination/:docId"
                  element={
                    <React.Suspense fallback={null}>
                      <EmbedCoordinationDoc />
                    </React.Suspense>
                  }
                />

                <Route
                  path="/privacy"
                  element={
                    <React.Suspense fallback={null}>
                      <PrivacyPolicy />
                    </React.Suspense>
                  }
                />
                <Route
                  path="/support"
                  element={
                    <React.Suspense fallback={null}>
                      <Support />
                    </React.Suspense>
                  }
                />

                <Route
                  path="/s/:studyId"
                  element={
                    <React.Suspense fallback={null}>
                      <PublicStudyReader />
                    </React.Suspense>
                  }
                />
                <Route
                  path="/s/:studyId/:date"
                  element={
                    <React.Suspense fallback={null}>
                      <PublicStudyReader />
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
                      <RoleGuard minRole="viewer">
                        <DashboardLayout>
                          <Attendance />
                        </DashboardLayout>
                      </RoleGuard>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/bible-study"
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
                            <BibleStudyEditor />
                          </React.Suspense>
                        </DashboardLayout>
                      </RoleGuard>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/outreach"
                  element={
                    <ProtectedRoute>
                      <RoleGuard minRole="admin">
                        <DashboardLayout>
                          <Outreach />
                        </DashboardLayout>
                      </RoleGuard>
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
                  path="/people/:contactId"
                  element={
                    <ProtectedRoute>
                      <RoleGuard minRole="viewer">
                        <DashboardLayout>
                          {null}
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
                  path="/visits"
                  element={
                    <ProtectedRoute>
                      <RoleGuard minRole="admin">
                        <DashboardLayout>
                          <Visits />
                        </DashboardLayout>
                      </RoleGuard>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/prayer"
                  element={
                    <ProtectedRoute>
                      <RoleGuard minRole="viewer">
                        <DashboardLayout>
                          <PrayerList />
                        </DashboardLayout>
                      </RoleGuard>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/answered"
                  element={
                    <ProtectedRoute>
                      <RoleGuard minRole="viewer">
                        <DashboardLayout>
                          <AnsweredList />
                        </DashboardLayout>
                      </RoleGuard>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <RoleGuard minRole="viewer">
                        <DashboardLayout>
                          <Settings />
                        </DashboardLayout>
                      </RoleGuard>
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
                  path="/messages/:roomId"
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
                  path="/questions"
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
                          <Questions />
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
            </LanguageProvider>
          </AuthProvider>
        </Router>
        </NavShellProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
