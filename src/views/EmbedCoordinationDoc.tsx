// Bare embed of the live document editor (Phase 0.5 WebView spike — see
// MIGRATION.md "Coordination Notes / The Board"). Hosted inside the mobile
// app's react-native-webview, not the normal dashboard chrome. Unlike every
// other route this is NOT wrapped in <ProtectedRoute>: the mobile host
// authenticates it by injecting a Firebase custom token as
// window.__CISA_CUSTOM_TOKEN__ before any page script runs
// (injectedJavaScriptBeforeContentLoaded), and this component exchanges it
// for a real session via signInWithCustomToken. Mobile only ever routes
// admins here (everyone else gets a native read view instead), so the
// isAdmin-only gate below matches the `board_docs` write rules exactly.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { signInWithCustomToken } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, collection, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref as dbRef, remove as dbRemove } from 'firebase/database';
import { auth, db, rtdb, handleFirestoreError, OperationType, logActivity } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import { DocEditor, NoteForm, guessSeries, mdExcerpt, type TeamMember, type NoteFormInitial } from './CoordinationNotes';
import { BoardDoc, Audience, NoteType, BOARD_SERIES, todayISO } from '../lib/board';
import { Contact } from '../types';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';

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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [noteForm, setNoteForm] = useState<NoteFormInitial | null>(null);

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

  // Contacts (for the editor's /contacts/:id link-click + AI-insights contact
  // linking) — admin-only, mirroring CoordinationNotes.tsx's own canEdit gate.
  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(
      collection(db, 'contacts'),
      (snap) => setContacts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as Contact)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'contacts'),
    );
  }, [isAdmin]);

  const meName = user?.displayName || user?.email || 'Someone';
  const uid = user?.uid || '';

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

  // Deletes the page and best-effort cleans up its live-collab RTDB node —
  // mirrors CoordinationNotes.tsx's deleteBoardDoc.
  const onDelete = async (d: BoardDoc) => {
    if (!window.confirm(`Delete "${d.title}"? This removes the page for everyone.`)) return;
    try {
      await deleteDoc(doc(db, 'board_docs', d.id));
      if (rtdb) {
        try {
          await dbRemove(dbRef(rtdb, `board_docs_rtdb/${d.id}`));
        } catch {
          /* live state cleanup is best-effort */
        }
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'board_docs');
    }
  };

  // "Save to archive" — prefills the note form; the actual board_notes write
  // happens when the user confirms via addNote below. Mirrors
  // CoordinationNotes.tsx's promoteDoc, minus the live-editing-preview branch
  // (this embed always shows exactly one, already-active doc).
  const onPromote = (d: BoardDoc) => {
    setNoteForm({ type: 'record', series: guessSeries(d.title), title: d.title, body: mdExcerpt(d.md) });
  };

  const addNote = async (fields: { type: NoteType; series: string; title: string; body: string; tags: string[] }) => {
    try {
      const ref = doc(collection(db, 'board_notes'));
      await setDoc(ref, {
        type: fields.type,
        series: fields.series,
        title: fields.title.trim() || 'Untitled note',
        body: fields.body.trim(),
        date: todayISO(),
        contributorIds: [uid],
        tags: fields.tags,
        sessionId: activeDoc?.id || '',
        createdAt: serverTimestamp(),
        createdBy: uid,
        createdByName: meName,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        updatedByName: meName,
      });
      logActivity({
        action: fields.type === 'learning' ? 'recorded a learning' : 'saved a record',
        targetId: ref.id,
        targetName: fields.title || 'Note',
        targetType: 'comment',
        type: 'create',
        description: fields.series,
      } as never);
      setNoteForm(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'board_notes');
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
        onPromote={onPromote}
        onDelete={onDelete}
        team={team}
        onToast={() => {}}
        contacts={contacts}
        onSelectContact={setSelectedContact}
        onOpenContactModal={setIsDetailsModalOpen}
      />
      <ContactDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedContact(null);
        }}
        contact={selectedContact}
      />
      {noteForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div onClick={() => setNoteForm(null)} className="fixed inset-0 bg-scrim/55 backdrop-blur-sm" />
          <div className="relative w-full max-w-md z-[101]">
            <NoteForm initial={noteForm} seriesOptions={BOARD_SERIES} onCancel={() => setNoteForm(null)} onSave={addNote} />
          </div>
        </div>
      )}
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
