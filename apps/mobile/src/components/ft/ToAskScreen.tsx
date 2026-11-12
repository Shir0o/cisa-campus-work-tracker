// Mobile v2 — To ask (#1649): a Full-timer's private notepad of what to put to
// each Trainee next time they see them. The phone twin of the web page at /ask
// (src/views/Ask.tsx): a thin renderer over the shared @cisa/core `buildToAsk`,
// so the list and the count are the web's. Drafted lines stay tied to the signal
// that produced them (ADR 0046) and tick themselves off when it clears. Nobody
// else, Trainee or Full-timer, ever sees it.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import {
  GENERAL_GROUP,
  contactStakeholdersOf,
  newToAskUpdate,
  toAskThreadTarget,
  toAskUpdateDestinations,
  type AskNoteLine,
  type ToAskGroup,
  type ToAskLine,
  type ToAskTeamFilter,
} from '@cisa/core';
import { SafeAreaView } from '../ui/SafeArea';
import { Sheet, Snackbar } from '../ui';
import { KeyboardAvoidingView } from '../ui/KeyboardAvoidingView';
import { BufferedTextInput } from '../ui/BufferedTextInput';
import { SkeletonList } from '../skeleton/SkeletonList';
import { PersonMark } from '../queue/atoms';
import { Room, V2Empty, V2Hint, V2Screen, V2Seg } from '../v2/Widget';
import { useAuth } from '../../lib/AuthProvider';
import { useLanguage } from '../../lib/LanguageProvider';
import { useToAskData } from '../../lib/useToAskData';
import {
  clearedText,
  draftText,
  signalChip,
  updateAgo,
  updateWhere,
} from '../../lib/toAskView';
import { addInteraction } from '../../lib/data/interactions';
import { addThreadMessage } from '../../lib/data/threads';
import {
  deleteToAskOverride,
  dismissToAskLine,
  postToAskLineUpdate,
  saveToAskNotepad,
  setToAskAskedAt,
  setToAskRewording,
} from '../../lib/data/toAsk';
import { useV2Theme, v2SheetChrome, type V2ToneKey } from '../../theme/v2';
import { ToAskUpdateSheet, type ToAskUpdateTarget } from './ToAskUpdateSheet';

const nowIso = () => new Date().toISOString();
const newNoteId = () => `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
/** Wrappers rethrow after reporting; a fire-and-forget write has no one to tell. */
const quiet = (p: Promise<unknown>) => void p.catch(() => {});

/** Which tone a line's chip wears: Not reached follows up, Thread asks and
 *  questions ask, a text with no reply is due, the Full-timer's own are notes —
 *  and a cleared line reads as done, in the note's green. */
function toneOf(line: ToAskLine): V2ToneKey {
  if (line.state === 'cleared') return 'note';
  if (line.kind === 'notReached') return 'follow';
  if (line.kind === 'ask' || line.kind === 'question' || line.kind === 'mention') return 'ask';
  if (line.kind === 'noReply') return 'due';
  return 'note';
}

interface Picked {
  line: ToAskLine;
  group: ToAskGroup;
}

export function ToAskScreen() {
  return (
    <Room room="ft">
      <ToAsk />
    </Room>
  );
}

function ToAsk() {
  const { c, font, radius, fs } = useV2Theme();
  const { uid, user, isImpersonating } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const data = useToAskData(uid);
  const { view, notepad, notepadRef, filter, messages, contactById } = data;

  const [editing, setEditing] = React.useState<string | null>(null);
  const editingRef = React.useRef<string | null>(null);
  const [editText, setEditText] = React.useState('');
  const [trayOpen, setTrayOpen] = React.useState(false);
  const [snack, setSnack] = React.useState<{ id: number; message: string; key: string } | null>(null);
  // The two sheets keep their last target through the close animation, so a
  // line swapped mid-dismiss never cuts it short.
  const [menu, setMenu] = React.useState<Picked | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [composer, setComposer] = React.useState<Picked | null>(null);
  const [composerOpen, setComposerOpen] = React.useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const groupLabel = (group: { kind: string; name: string }) =>
    group.kind === 'general'
      ? t('mobile.toAsk.general')
      : group.kind === 'none'
        ? t('mobile.toAsk.no_trainee_tied')
        : group.name;
  const teamLabel = (team: string) =>
    team === 'campus' ? t('mobile.toAsk.filter_campus') : team === 'yp' ? t('mobile.toAsk.filter_yp') : team;

  const shown = (line: ToAskLine) =>
    line.reworded || line.kind === 'handwritten' ? line.text : line.signal ? draftText(line.signal, t) : line.text;

  const chipOf = (line: ToAskLine) =>
    line.kind === 'handwritten'
      ? t('mobile.toAsk.your_note')
      : line.state === 'cleared' && line.clearedBy
        ? clearedText(line.clearedBy, t)
        : line.signal
          ? signalChip(line.signal, t)
          : '';

  // ── actions, as the web page does them ────────────────────────────────────
  const noteLines = () => notepad.lines ?? [];
  const editNote = (line: ToAskLine, patch: Partial<AskNoteLine>) => {
    if (!uid) return;
    const id = line.key.replace(/^note:/, '');
    quiet(saveToAskNotepad(uid, { lines: noteLines().map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  };

  const markAsked = (line: ToAskLine) => {
    if (!uid) return;
    if (line.kind === 'handwritten') editNote(line, { askedAt: nowIso() });
    else quiet(setToAskAskedAt(uid, line.key, nowIso()));
  };

  const undoAsked = (line: ToAskLine) => {
    if (!uid) return;
    if (line.kind === 'handwritten') editNote(line, { askedAt: null });
    else if (typeof notepad.overrides?.[line.key]?.text === 'string') quiet(setToAskAskedAt(uid, line.key, null));
    else quiet(deleteToAskOverride(uid, line.key));
  };

  const startReword = (line: ToAskLine, rowKey: string) => {
    editingRef.current = rowKey;
    setEditing(rowKey);
    setEditText(shown(line));
  };

  const commitReword = (line: ToAskLine, rowKey: string) => {
    // A submit and the blur it causes both land here; only the first counts.
    if (editingRef.current !== rowKey) return;
    editingRef.current = null;
    setEditing(null);
    const text = editText.trim();
    if (!uid || !text) return;
    if (line.kind === 'handwritten') editNote(line, { text });
    else quiet(setToAskRewording(uid, line.key, text));
  };

  const addLine = (group: ToAskGroup, text: string) => {
    const trimmed = text.trim();
    if (!uid || !trimmed) return;
    const line: AskNoteLine = {
      id: newNoteId(),
      text: trimmed,
      group: group.kind === 'general' ? GENERAL_GROUP : group.id,
      contactId: null,
      createdAt: nowIso(),
    };
    quiet(saveToAskNotepad(uid, { lines: [...noteLines(), line] }));
  };

  const bringBack = (key: string) => {
    if (uid) quiet(dismissToAskLine(uid, notepadRef.current, key, null));
  };

  const dismiss = (line: ToAskLine) => {
    if (!uid) return;
    quiet(dismissToAskLine(uid, notepad, line.key, nowIso()));
    const who = line.contactId ? contactById.get(line.contactId)?.name : undefined;
    const name = who || line.signal?.contactName || shown(line);
    setSnack({
      id: Date.now(),
      key: line.key,
      message: (line.kind === 'handwritten'
        ? t('mobile.toAsk.dismissed_snack_note')
        : t('mobile.toAsk.dismissed_snack')
      ).replace('{name}', name),
    });
  };

  const loggerName = user?.displayName || user?.email?.split('@')[0] || 'Someone';

  /** Keep the update on the line, then write it where else it was sent: the
   *  contact's page (logged for the group's Trainee) or the Thread. */
  const postUpdate = ({ line, group }: Picked, text: string, dest: 'line' | 'contact' | 'thread', alsoAsked: boolean) => {
    const body = text.trim();
    if (!uid || !body) return;
    setComposerOpen(false);
    const update = newToAskUpdate(body, dest);
    quiet(postToAskLineUpdate(uid, notepad, line.key, update, { askedAt: alsoAsked ? update.at : null }));
    const contact = line.contactId ? contactById.get(line.contactId) : undefined;
    if (!user || !contact) return;
    if (dest === 'contact') {
      const reacher =
        group.kind === 'trainee' && !isImpersonating && group.id !== user.uid
          ? { uid: group.id, name: group.name }
          : null;
      quiet(
        addInteraction(
          contact.id,
          contact.name,
          { content: body, dateTime: nowIso(), type: 'interaction' },
          { uid: user.uid, name: loggerName, photoURL: user.photoURL },
          reacher,
        ),
      );
    } else if (dest === 'thread') {
      const target = toAskThreadTarget(line.key, messages);
      if (!target) return;
      quiet(
        addThreadMessage(
          target.contactId,
          {
            interactionId: target.interactionId,
            parentId: target.parentId,
            scope: target.scope,
            from: user.uid,
            fromName: loggerName,
            kind: 'comment',
            body,
          },
          { contactName: contact.name, stakeholders: contactStakeholdersOf(contact) },
        ),
      );
    }
  };

  const openMenu = (picked: Picked) => {
    setMenu(picked);
    setMenuOpen(true);
  };
  const openComposer = (picked: Picked) => {
    setComposer(picked);
    setComposerOpen(true);
  };
  const openContact = (contactId?: string | null) => {
    if (contactId) router.push(`/contact/${contactId}`);
  };

  const updateTarget = (picked: Picked | null): ToAskUpdateTarget | null => {
    if (!picked) return null;
    const { line, group } = picked;
    const who = line.contactId ? contactById.get(line.contactId) : undefined;
    return {
      text: shown(line),
      tone: toneOf(line),
      chip: chipOf(line),
      contactName: who?.name ?? line.signal?.contactName ?? null,
      traineeName: group.kind === 'trainee' ? group.name : null,
      dests: toAskUpdateDestinations(line).filter(
        (d) => (d !== 'contact' || !!who) && (d !== 'thread' || !!toAskThreadTarget(line.key, messages)),
      ),
    };
  };

  // ── pieces ────────────────────────────────────────────────────────────────
  const toneChip = (line: ToAskLine) => {
    const label = chipOf(line);
    if (!label) return null;
    const tone = c.card.tones[toneOf(line)];
    return (
      <View
        style={{
          alignSelf: 'flex-start',
          maxWidth: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
          marginTop: 8,
          paddingVertical: 4,
          paddingHorizontal: 10,
          borderRadius: radius.chip,
          backgroundColor: tone.band,
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone.dot }} />
        <Text style={{ flexShrink: 1, fontFamily: font.semi, fontSize: fs(12), color: tone.text }}>{label}</Text>
      </View>
    );
  };

  const renderLine = (group: ToAskGroup, line: ToAskLine, first: boolean) => {
    const rowKey = `${group.id}:${line.key}`;
    const struck = line.state !== 'open';
    const open = line.state === 'open';
    const row = (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingLeft: 8,
          paddingRight: 4,
          paddingVertical: 8,
          backgroundColor: c.card.bg,
          borderTopWidth: first ? 0 : 1,
          borderTopColor: c.card.line,
        }}
      >
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: struck }}
          accessibilityLabel={struck ? t('mobile.toAsk.asked_undo') : t('mobile.toAsk.mark_asked')}
          onPress={() => (struck ? undoAsked(line) : markAsked(line))}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 7,
              borderWidth: 1.5,
              alignItems: 'center',
              justifyContent: 'center',
              borderColor: line.state === 'cleared' ? c.card.green : struck ? c.card.primary : c.card.ink3,
              backgroundColor: line.state === 'cleared' ? c.card.green : struck ? c.card.primary : 'transparent',
            }}
          >
            {struck && (
              <Ionicons name="checkmark" size={15} color={line.state === 'cleared' ? c.card.onGreen : c.card.onPrimary} />
            )}
          </View>
        </Pressable>

        <View style={{ flex: 1, minWidth: 0, paddingTop: 10, paddingBottom: 4, paddingHorizontal: 4 }}>
          {editing === rowKey ? (
            <BufferedTextInput
              autoFocus
              value={editText}
              onChangeText={setEditText}
              onSubmitEditing={() => commitReword(line, rowKey)}
              onBlur={() => commitReword(line, rowKey)}
              returnKeyType="done"
              accessibilityLabel={t('mobile.toAsk.line_label')}
              style={{
                minHeight: 44,
                marginTop: -10,
                fontFamily: font.medium,
                fontSize: fs(15),
                color: c.card.ink,
                borderBottomWidth: 1.5,
                borderBottomColor: c.card.primary,
              }}
            />
          ) : (
            <Text
              style={{
                fontFamily: font.medium,
                fontSize: fs(15),
                lineHeight: fs(22),
                color: struck ? c.card.ink3 : c.card.ink,
                textDecorationLine: struck ? 'line-through' : 'none',
              }}
            >
              {shown(line)}
            </Text>
          )}
          {line.updates.map((u) => (
            <View
              key={u.id}
              style={{ marginTop: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.note, backgroundColor: c.card.bg2 }}
            >
              <Text style={{ fontFamily: font.medium, fontSize: fs(11), lineHeight: fs(15), color: c.card.ink3 }}>
                {t('mobile.toAsk.your_update')
                  .replace('{ago}', updateAgo(u.at, Date.now(), t))
                  .replace('{where}', updateWhere(u.dest, t))}
              </Text>
              <Text style={{ fontFamily: font.medium, fontSize: fs(14), lineHeight: fs(20), color: c.card.ink, marginTop: 2 }}>
                {u.text}
              </Text>
            </View>
          ))}
          {toneChip(line)}
        </View>

        {open ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('mobile.toAsk.more_actions')}
            onPress={() => openMenu({ line, group })}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={c.card.ink2} />
          </Pressable>
        ) : (
          <View style={{ width: 4 }} />
        )}
      </View>
    );

    if (!open) return <React.Fragment key={rowKey}>{row}</React.Fragment>;
    return (
      <ReanimatedSwipeable
        key={rowKey}
        friction={1.5}
        rightThreshold={40}
        // A tap wobbles a few px; only a real drag should start the swipe.
        dragOffsetFromRight={-24}
        overshootRight={false}
        renderRightActions={(_progress, _translation, methods) => (
          <View style={{ width: 160, flexDirection: 'row' }}>
            <SwipeAction
              label={t('mobile.toAsk.swipe_update')}
              bg={c.card.primary}
              fg={c.card.onPrimary}
              onPress={() => {
                methods.close();
                openComposer({ line, group });
              }}
            />
            <SwipeAction
              label={t('mobile.toAsk.swipe_dismiss')}
              bg={c.card.inverse}
              fg={c.card.onInverse}
              onPress={() => {
                methods.close();
                dismiss(line);
              }}
            />
          </View>
        )}
      >
        {row}
      </ReanimatedSwipeable>
    );
  };

  const renderGroup = (group: ToAskGroup) => (
    <View
      key={group.id}
      accessibilityLabel={groupLabel(group)}
      style={{
        marginTop: 12,
        overflow: 'hidden',
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: c.card.border,
        backgroundColor: c.card.bg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
        {group.kind === 'trainee' ? (
          <PersonMark name={group.name} id={group.id} size={36} fontSize={12} />
        ) : (
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.card.bg2,
            }}
          >
            <Text style={{ fontFamily: font.semi, fontSize: fs(12), color: c.card.ink2 }}>
              {group.kind === 'general' ? '··' : '?'}
            </Text>
          </View>
        )}
        <Text
          numberOfLines={1}
          style={{ flexShrink: 1, fontFamily: font.semi, fontSize: fs(17), lineHeight: fs(22), color: c.card.ink }}
        >
          {groupLabel(group)}
        </Text>
        {!!group.team && (
          <View
            style={{
              paddingVertical: 2,
              paddingHorizontal: 8,
              borderRadius: radius.chip,
              borderWidth: 1,
              borderColor: c.card.border,
            }}
          >
            <Text style={{ fontFamily: font.medium, fontSize: fs(11), color: c.card.ink2 }}>{teamLabel(group.team)}</Text>
          </View>
        )}
        <Text style={{ marginLeft: 'auto', fontFamily: font.medium, fontSize: fs(12), color: c.card.ink3 }}>
          {t('mobile.toAsk.open_count').replace('{n}', String(group.open))}
        </Text>
      </View>
      {group.kind === 'none' && (
        <Text style={{ fontFamily: font.medium, fontSize: fs(12), lineHeight: fs(17), color: c.card.ink3, paddingHorizontal: 16, paddingBottom: 10 }}>
          {t('mobile.toAsk.no_trainee_hint')}
        </Text>
      )}
      {group.lines.map((line, i) => renderLine(group, line, i === 0))}
      <AddLine
        label={
          group.id === GENERAL_GROUP
            ? t('mobile.toAsk.add_line_general')
            : t('mobile.toAsk.add_line').replace('{name}', groupLabel(group))
        }
        onAdd={(text) => addLine(group, text)}
      />
    </View>
  );

  const dismissedTray = view.dismissed.length > 0 && (
    <View style={{ marginTop: 16 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: trayOpen }}
        onPress={() => setTrayOpen((o) => !o)}
        style={({ pressed }) => ({
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          borderRadius: radius.row,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: c.card.border,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text style={{ fontFamily: font.semi, fontSize: fs(14), color: c.room.ink2 }}>
          {t('mobile.toAsk.dismissed_count').replace('{n}', String(view.dismissed.length))}
        </Text>
        <Ionicons name={trayOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.room.ink2} />
      </Pressable>
      {trayOpen && (
        <View
          style={{
            marginTop: 8,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: c.card.border,
            backgroundColor: c.card.bg,
            padding: 16,
          }}
        >
          <Text style={{ fontFamily: font.medium, fontSize: fs(12), lineHeight: fs(17), color: c.card.ink3, marginBottom: 6 }}>
            {t('mobile.toAsk.dismissed_note')}
          </Text>
          {view.dismissed.map((d, i) => (
            <View
              key={d.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 10,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: c.card.line,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: font.medium, fontSize: fs(14), lineHeight: fs(20), color: c.card.ink2 }}>
                  {shown(d.line)}
                </Text>
                <Text style={{ fontFamily: font.medium, fontSize: fs(12), lineHeight: fs(17), color: c.card.ink3, marginTop: 2 }}>
                  {[groupLabel({ kind: d.groupKind, name: d.groupName }), chipOf(d.line)].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => bringBack(d.key)}
                style={({ pressed }) => ({
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: 16,
                  borderRadius: radius.button,
                  backgroundColor: c.card.bg2,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.card.ink }}>{t('mobile.toAsk.bring_back')}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const openTone = c.card.tones.ask;
  const menuLine = menu?.line ?? null;
  const menuContact = menuLine?.contactId ? contactById.get(menuLine.contactId) : undefined;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {/* The display title and its count live in the body, so the screen's
            own compact title stays empty and only carries ← Back. */}
        <V2Screen title="" onBack={back}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 4, marginBottom: 12 }}>
            <Text
              accessibilityRole="header"
              style={{ fontFamily: font.semi, fontSize: fs(27), lineHeight: fs(32), letterSpacing: -0.54, color: c.room.ink }}
            >
              {t('mobile.toAsk.title')}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: radius.chip,
                backgroundColor: openTone.band,
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: openTone.dot }} />
              <Text style={{ fontFamily: font.semi, fontSize: fs(12), color: openTone.text }}>
                {t('mobile.toAsk.open_count').replace('{n}', String(view.openCount))}
              </Text>
            </View>
          </View>
          <V2Hint>{t('mobile.toAsk.hint')}</V2Hint>
          <V2Seg<ToAskTeamFilter>
            value={filter}
            onChange={(next) => uid && quiet(saveToAskNotepad(uid, { teamFilter: next }))}
            items={[
              { id: 'all', label: t('mobile.toAsk.filter_all') },
              { id: 'campus', label: t('mobile.toAsk.filter_campus') },
              { id: 'yp', label: t('mobile.toAsk.filter_yp') },
            ]}
          />
          {view.clearedCount > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => uid && quiet(saveToAskNotepad(uid, { clearedBefore: nowIso() }))}
              style={({ pressed }) => ({
                alignSelf: 'flex-end',
                minHeight: 44,
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.room.ink2 }}>
                {t('mobile.toAsk.clear_done').replace('{n}', String(view.clearedCount))}
              </Text>
            </Pressable>
          )}

          {!!data.error && (
            <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: c.card.tones.follow.text, marginBottom: 8 }}>
              {data.error}
            </Text>
          )}

          {data.loading ? (
            <SkeletonList rows={4} />
          ) : (
            <>
              {view.groups.length === 0 ? (
                <V2Empty>{`${t('mobile.toAsk.empty_title')}\n${t('mobile.toAsk.empty_sub')}`}</V2Empty>
              ) : (
                view.groups.map(renderGroup)
              )}
              {dismissedTray}
            </>
          )}
        </V2Screen>
      </KeyboardAvoidingView>

      {/* The line's "⋯" menu. */}
      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} maxHeightRatio={0.55} {...v2SheetChrome(c)}>
        <Room room="ft">
          {!!menu && !!menuLine && (
            <View accessibilityLabel={t('mobile.toAsk.more_actions')} style={{ paddingHorizontal: 8, paddingBottom: 20 }}>
              <Text
                numberOfLines={2}
                style={{ fontFamily: font.semi, fontSize: fs(13), color: c.card.ink3, paddingHorizontal: 16, paddingBottom: 8 }}
              >
                {shown(menuLine)}
              </Text>
              <SheetAction
                label={t('mobile.toAsk.post_update')}
                onPress={() => {
                  setMenuOpen(false);
                  openComposer(menu);
                }}
              />
              <SheetAction
                label={t('mobile.toAsk.reword')}
                onPress={() => {
                  setMenuOpen(false);
                  startReword(menuLine, `${menu.group.id}:${menuLine.key}`);
                }}
              />
              {!!menuLine.contactId && (
                <SheetAction
                  label={t('mobile.toAsk.open_contact').replace(
                    '{name}',
                    menuContact?.name ?? menuLine.signal?.contactName ?? t('mobile.toAsk.this_person'),
                  )}
                  onPress={() => {
                    setMenuOpen(false);
                    openContact(menuLine.contactId);
                  }}
                />
              )}
              <SheetAction
                label={t('mobile.toAsk.dismiss')}
                sub={t('mobile.toAsk.dismiss_sub')}
                onPress={() => {
                  setMenuOpen(false);
                  dismiss(menuLine);
                }}
              />
            </View>
          )}
        </Room>
      </Sheet>

      <ToAskUpdateSheet
        key={composer ? `${composer.group.id}:${composer.line.key}` : 'no-line'}
        visible={composerOpen}
        target={updateTarget(composer)}
        onClose={() => setComposerOpen(false)}
        onPost={(text, dest, alsoAsked) => composer && postUpdate(composer, text, dest, alsoAsked)}
      />

      {!!snack && (
        <Snackbar
          key={snack.id}
          message={snack.message}
          actionLabel={t('mobile.toAsk.undo')}
          onAction={() => {
            bringBack(snack.key);
            setSnack(null);
          }}
          onDismiss={() => setSnack(null)}
          duration={6000}
        />
      )}
    </SafeAreaView>
  );
}

/** One of the two 80pt buttons a swipe reveals. */
function SwipeAction({ label, bg, fg, onPress }: { label: string; bg: string; fg: string; onPress: () => void }) {
  const { font, fs } = useV2Theme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: 80, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}
    >
      <Text style={{ fontFamily: font.semi, fontSize: fs(13), color: fg }}>{label}</Text>
    </Pressable>
  );
}

/** A row in a line's action sheet. */
function SheetAction({ label, sub, onPress }: { label: string; sub?: string; onPress: () => void }) {
  const { c, font, fs } = useV2Theme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 14,
        backgroundColor: pressed ? c.card.bg2 : 'transparent',
      })}
    >
      <Text style={{ fontFamily: font.semi, fontSize: fs(15), color: c.card.ink }}>{label}</Text>
      {!!sub && (
        <Text style={{ fontFamily: font.medium, fontSize: fs(12.5), color: c.card.ink3, marginTop: 1 }}>{sub}</Text>
      )}
    </Pressable>
  );
}

/** The dashed "Add a line for {name}…" row at the foot of a group. */
function AddLine({ label, onAdd }: { label: string; onAdd: (text: string) => void }) {
  const { c, font, radius, fs } = useV2Theme();
  const [text, setText] = React.useState('');
  const submit = () => {
    if (!text.trim()) return;
    onAdd(text);
    setText('');
  };
  return (
    <View
      style={{
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        margin: 12,
        paddingHorizontal: 14,
        borderRadius: radius.row,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: c.card.border,
      }}
    >
      <Ionicons name="add" size={18} color={c.card.ink2} />
      <BufferedTextInput
        accessibilityLabel={label}
        placeholder={label}
        placeholderTextColor={c.card.ink3}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        returnKeyType="done"
        style={{ flex: 1, minHeight: 44, fontFamily: font.medium, fontSize: fs(14), color: c.card.ink }}
      />
    </View>
  );
}
