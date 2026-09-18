// The native mobile read-back view of the submitter's own Notes — the mobile
// mirror of web's MyNotes page (`/feedback`, ADR 0019). Submitting stays in the
// FeedbackSheet; this screen is where a Note comes back to you: what came of it,
// and its Follow-up thread.
import React, { useState, useCallback } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { kindMeta, outcomeCopy, outcomeLabel } from '@cisa/core';
import type { Feedback, FeedbackReply } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { useMyNotesData } from '../../lib/useMyNotesData';
import { subscribeNoteReplies, postReply, editReply } from '../../lib/data/feedback';
import { useV2Theme } from '../../theme/v2';
import { MemberScreen, MemberBack, MemberHead } from '../member/MemberScreen';

export function MyNotesScreen() {
  const { t } = useLanguage();
  const { notes, loading, error } = useMyNotesData();
  const { c, font, fs, radius } = useV2Theme();
  const router = useRouter();

  return (
    <MemberScreen loading={loading} error={error}>
      <MemberBack />
      <MemberHead greeting={t('feedback.your_notes', 'Your notes')} showDate={false} />
      <Text style={{ fontFamily: font.medium, fontSize: fs(13), color: c.room.ink2, marginTop: -12 }}>
        {t('feedback.your_notes_intro', 'What came of the notes you left, and the follow-ups.')}
      </Text>

      {!error && notes.length === 0 && !loading && (
        <View
          style={{
            backgroundColor: c.widget.bg,
            borderRadius: radius.tile,
            padding: 28,
            alignItems: 'center',
            gap: 8,
            ...c.widget.shadow,
          }}
        >
          <Text style={{ fontFamily: font.extra, fontSize: fs(16), color: c.widget.ink }}>
            {t('feedback.no_notes_yet', "You haven't left a note yet")}
          </Text>
          <Text style={{ fontFamily: font.medium, fontSize: fs(13), color: c.widget.ink3, textAlign: 'center' }}>
            {t('feedback.no_notes_yet_hint', 'Tap the note button whenever something is on your mind.')}
          </Text>
        </View>
      )}

      <View style={{ gap: 12 }}>
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} />
        ))}
      </View>
    </MemberScreen>
  );
}

function NoteCard({ note }: { note: Feedback }) {
  const { t } = useLanguage();
  const { c, font, radius, fs } = useV2Theme();
  const [expanded, setExpanded] = useState(false);

  const meta = kindMeta(note.kind ?? 'thought');

  const formattedDate = (() => {
    try {
      return format(new Date(note.createdAt), 'MMM d, yyyy');
    } catch {
      return note.createdAt;
    }
  })();

  return (
    <View
      style={{
        backgroundColor: c.widget.bg,
        borderRadius: radius.tile,
        padding: 16,
        gap: 10,
        ...c.widget.shadow,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View
          style={{
            backgroundColor: c.card.note,
            borderRadius: radius.button,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontFamily: font.bold, fontSize: fs(11), color: c.card.noteLabel }}>{meta.label}</Text>
        </View>
        <Text style={{ fontFamily: font.medium, fontSize: fs(11.5), color: c.widget.ink3 }}>{formattedDate}</Text>
      </View>

      <Text style={{ fontFamily: font.medium, fontSize: fs(14), lineHeight: fs(20), color: c.widget.ink }}>
        {note.message}
      </Text>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: c.widget.line,
          paddingTop: 10,
          gap: 3,
        }}
      >
        {note.outcome ? (
          <>
            <Text style={{ fontFamily: font.bold, fontSize: fs(12), color: outcomeColor(note.outcome, c) }}>
              {outcomeLabel(note.outcome)}
            </Text>
            <Text style={{ fontFamily: font.medium, fontSize: fs(12), lineHeight: fs(17), color: c.widget.ink3 }}>
              {note.outcomeMessage || outcomeCopy(note.outcome)}
            </Text>
          </>
        ) : (
          <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.widget.ink3 }}>
            {t('feedback.no_news_yet', 'No news yet')}
          </Text>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('feedback.follow_ups', 'Follow-ups')}
        onPress={() => setExpanded((v) => !v)}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <Text style={{ fontFamily: font.bold, fontSize: fs(12.5), color: c.card.link }}>
          {t('feedback.follow_ups', 'Follow-ups')}
        </Text>
        <Text style={{ fontFamily: font.bold, fontSize: fs(12), color: c.widget.ink3 }}>{expanded ? '−' : '+'}</Text>
      </Pressable>

      {expanded && <FollowUpThread noteId={note.id} />}
    </View>
  );
}

function outcomeColor(outcome: Feedback['outcome'], c: any) {
  switch (outcome) {
    case 'shipped':
      return '#2F9E5F';
    case 'not-planned':
      return c.widget.ink3;
    case 'already-there':
      return '#5C17E5';
    default:
      return c.widget.ink3;
  }
}

function FollowUpThread({ noteId }: { noteId: string }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const { t } = useLanguage();
  const { c, font, radius, fs } = useV2Theme();

  const [replies, setReplies] = useState<FeedbackReply[]>([]);
  const [threadError, setThreadError] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  React.useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeNoteReplies(noteId, (items) => {
      if (cancelled) return;
      setReplies(items);
      setThreadError(false);
    }, () => {
      if (cancelled) return;
      setThreadError(true);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [noteId]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await postReply(noteId, body, uid);
      setDraft('');
    } catch (err) {
      console.error('Failed to post a follow-up:', err);
    } finally {
      setSending(false);
    }
  }, [draft, sending, noteId, uid]);

  const saveEdit = useCallback(async () => {
    const body = editDraft.trim();
    if (!body || !editingId) return;
    try {
      await editReply(noteId, editingId, body, uid);
      setEditingId(null);
      setEditDraft('');
    } catch (err) {
      console.error('Failed to edit a follow-up:', err);
    }
  }, [editDraft, editingId, noteId, uid]);

  return (
    <View style={{ gap: 10, paddingTop: 4 }}>
      {threadError && (
        <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.widget.ink3 }}>
          {t('feedback.follow_ups_load_failed', "Couldn't load the follow-ups.")}
        </Text>
      )}

      {!threadError && replies.length === 0 && (
        <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: c.widget.ink3 }}>
          {t('feedback.no_follow_ups', 'No follow-ups yet.')}
        </Text>
      )}

      {replies.map((reply) => {
        const mine = reply.authorRole === 'submitter';
        const shown = reply.launderedBody || reply.body;
        const editable = !!user && reply.authorId === user.uid && !reply.relayed;
        return (
          <View
            key={reply.id}
            style={{
              backgroundColor: mine ? c.widget.tile : c.room.chip,
              borderRadius: radius.tile,
              padding: 12,
              gap: 6,
            }}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(11.5), color: c.widget.ink3 }}>
              {mine ? t('feedback.you', 'You') : reply.authorName || t('feedback.the_team', 'The team')}
            </Text>
            {editingId === reply.id ? (
              <View style={{ gap: 8 }}>
                <TextInput
                  multiline
                  value={editDraft}
                  onChangeText={setEditDraft}
                  placeholder={t('feedback.edit_placeholder', 'Edit your follow-up…')}
                  placeholderTextColor={c.widget.ink3}
                  style={{
                    borderWidth: 1,
                    borderColor: c.widget.line,
                    borderRadius: radius.tile,
                    padding: 10,
                    fontSize: fs(13),
                    fontFamily: font.medium,
                    color: c.widget.ink,
                    backgroundColor: c.widget.bg,
                    minHeight: 60,
                    textAlignVertical: 'top',
                  }}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                  <Pressable onPress={() => { setEditingId(null); setEditDraft(''); }} hitSlop={8}>
                    <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.widget.ink3 }}>
                      {t('common.cancel', 'Cancel')}
                    </Text>
                  </Pressable>
                  <Pressable onPress={saveEdit} hitSlop={8}>
                    <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.card.link }}>
                      {t('common.save', 'Save')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{ gap: 6 }}>
                <Text style={{ fontFamily: font.medium, fontSize: fs(13), lineHeight: fs(18), color: c.widget.ink }}>
                  {shown}
                </Text>
                {editable && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('feedback.edit', 'Edit')}
                    onPress={() => { setEditingId(reply.id); setEditDraft(reply.body); }}
                    hitSlop={8}
                  >
                    <Text style={{ fontFamily: font.bold, fontSize: fs(12), color: c.card.link }}>
                      {t('feedback.edit', 'Edit')}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        );
      })}

      <View style={{ gap: 8 }}>
        <TextInput
          multiline
          value={draft}
          onChangeText={setDraft}
          placeholder={t('feedback.follow_up_placeholder', 'Write a follow-up…')}
          placeholderTextColor={c.widget.ink3}
          style={{
            borderWidth: 1,
            borderColor: c.widget.line,
            borderRadius: radius.tile,
            padding: 12,
            fontSize: fs(13),
            fontFamily: font.medium,
            color: c.widget.ink,
            backgroundColor: c.widget.bg,
            minHeight: 70,
            textAlignVertical: 'top',
          }}
        />
        <Text style={{ fontFamily: font.medium, fontSize: fs(11), color: c.widget.ink3 }}>
          {t('feedback.reply_is_public', 'Replies are posted to a public issue tracker.')}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Pressable onPress={send} disabled={sending || !draft.trim()} hitSlop={8}>
            <Text
              style={{
                fontFamily: font.bold,
                fontSize: fs(13),
                color: sending || !draft.trim() ? c.widget.ink3 : c.card.link,
              }}
            >
              {sending ? t('feedback.sending', 'Sending…') : t('feedback.send', 'Send')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}