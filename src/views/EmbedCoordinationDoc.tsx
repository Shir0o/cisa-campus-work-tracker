// Bare embed of the live document editor (Phase 0.5 WebView spike — see
// MIGRATION.md "Coordination Notes / The Board"). Hosted inside the mobile
// app's react-native-webview, not the normal dashboard chrome. Unlike every
// other route this is NOT wrapped in <ProtectedRoute>: the mobile host
// authenticates it by injecting a Firebase custom token as
// window.__CISA_CUSTOM_TOKEN__ before any page script runs
// (injectedJavaScriptBeforeContentLoaded), and this component exchanges it
// for a real session via signInWithCustomToken.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { signInWithCustomToken } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import { DocEditor, type TeamMember } from './CoordinationNotes';
import { BoardDoc, Audience } from '../lib/board';

declare global {
  interface Window {
    __CISA_CUSTOM_TOKEN__?: string;
  }
}

export default function EmbedCoordinationDoc() {
  const { docId } = useParams<{ docId: string }>();
  const { user, isAdmin, loading } = useAuth();
  const [signInError, setSignInError] = useState<string | null>(null);
  const [attemptedSignIn, setAttemptedSignIn] = useState(false);
  const [activeDoc, setActiveDoc] = useState<BoardDoc | null | undefined>(undefined);
  const [team, setTeam] = useState<TeamMember[]>([]);

  useEffect(() => {
    if (attemptedSignIn || loading || user) return;
    const token = window.__CISA_CUSTOM_TOKEN__;
    if (!token) return;
    setAttemptedSignIn(true);
    signInWithCustomToken(auth, token).catch((e) => setSignInError(e.message || String(e)));
  }, [attemptedSignIn, loading, user]);

  useEffect(() => {
    if (!docId || !user) return;
    return onSnapshot(
      doc(db, 'board_docs', docId),
      (snap) => setActiveDoc(snap.exists() ? ({ id: snap.id, ...(snap.data() as object) } as BoardDoc) : null),
      (err) => handleFirestoreError(err, OperationType.GET, 'board_docs'),
    );
  }, [docId, user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setTeam(
          snap.docs
            .map((d) => {
              const data = d.data() as { displayName?: string; email?: string; photoURL?: string; role?: string; approved?: boolean };
              return {
                member: { uid: d.id, name: data.displayName || data.email || 'Teammate', photoURL: data.photoURL, role: data.role } as TeamMember,
                approved: data.approved,
              };
            })
            .filter((u) => u.approved !== false)
            .map((u) => u.member)
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users'),
    );
  }, [user]);

  const meName = user?.displayName || user?.email || 'Someone';

  const saveMarkdown = async (id: string, md: string) => {
    try {
      await updateDoc(doc(db, 'board_docs', id), { md, updatedAt: serverTimestamp(), updatedBy: user?.uid, updatedByName: meName });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_docs');
    }
  };
  const saveTitle = async (id: string, title: string) => {
    try {
      await updateDoc(doc(db, 'board_docs', id), {
        title: title.trim() || 'Untitled page',
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid,
        updatedByName: meName,
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_docs');
    }
  };
  const saveAudience = async (id: string, audience: Audience) => {
    try {
      await updateDoc(doc(db, 'board_docs', id), { audience, updatedAt: serverTimestamp(), updatedBy: user?.uid, updatedByName: meName });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'board_docs');
    }
  };

  if (signInError) {
    return <EmbedStatus>Sign-in failed: {signInError}</EmbedStatus>;
  }
  if (!docId) {
    return <EmbedStatus>Missing doc id.</EmbedStatus>;
  }
  if (loading || !user) {
    return <EmbedStatus>Signing in…</EmbedStatus>;
  }
  if (!isAdmin) {
    return <EmbedStatus>Admin access required.</EmbedStatus>;
  }
  if (activeDoc === undefined) {
    return <EmbedStatus>Loading document…</EmbedStatus>;
  }
  if (activeDoc === null) {
    return <EmbedStatus>Document not found.</EmbedStatus>;
  }

  return (
    <div style={{ height: '100vh', overflow: 'hidden' }}>
      <DocEditor
        key={activeDoc.id}
        doc={activeDoc}
        meUid={user.uid}
        meName={meName}
        pagesCollapsed
        onTogglePages={() => {}}
        onLiveMarkdownChange={() => {}}
        onSaveMarkdown={saveMarkdown}
        onSaveTitle={saveTitle}
        onSaveAudience={saveAudience}
        onPromote={() => {}}
        onDelete={() => {}}
        team={team}
        onToast={() => {}}
        contacts={[]}
        onSelectContact={() => {}}
        onOpenContactModal={() => {}}
      />
    </div>
  );
}

function EmbedStatus({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#444' }}>
      {children}
    </div>
  );
}
