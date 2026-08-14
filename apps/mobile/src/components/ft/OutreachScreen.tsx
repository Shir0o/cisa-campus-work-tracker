// Mobile v2 — the full-timer's outreach page. The design's desktop `Outreach`
// (views/outreach.jsx) ported into the v2 language (Manrope, paper/navy ft
// room, Sheet-based logging). One deliberate change: full-timers only — the
// route guard (app/outreach.tsx) and the firestore rules keep everyone else
// out, where the design let trainees and community members in.
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from '../ui/SafeArea';
import { Sheet } from '../ui';
import {
  canLogOutreach,
  firstName,
  outreachDayNum,
  outreachDaysSince,
  outreachHandedLine,
  outreachInitials,
  outreachMonthShort,
  outreachReached,
  outreachWhen,
  type AppUser,
  type OutreachDraft,
  type OutreachName,
  type OutreachPendingItem,
  type OutreachRecord,
  type Touch,
} from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { roomForRole, useV2Theme, v2SheetChrome } from '../../theme/v2';
import { Room, V2Empty, V2Input, V2Screen, V2TextArea } from '../v2/Widget';
import { SkeletonList } from '../skeleton/SkeletonList';
import { useOutreachData } from '../../lib/useOutreachData';
import { addOutreach, removeOutreach, takeOutreachName, updateOutreach } from '../../lib/data/outreach';
import { addThreadMessage } from '../../lib/data/threads';

const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const WHEN_PRESETS = [
  { key: 'today', label: 'Today', date: iso(new Date()) },
  { key: 'yesterday', label: 'Yesterday', date: iso(new Date(Date.now() - DAY_MS)) },
  { key: 'week', label: 'This week', date: iso(new Date(Date.now() - 5 * DAY_MS)) },
];

export function OutreachScreen() {
  const { role } = useAuth();
  // The outreach screen is reached by two shells — the full-timer's navy room
  // and, for community, the member app's green one — so it wears the room of
  // whoever opened it, the same way the shared People/Journey screens do.
  return (
    <Room room={roomForRole(role)}>
      <Outreach />
    </Room>
  );
}

function Face({ label, lg }: { label: string; lg?: boolean }) {
  const { c, font, fs } = useV2Theme();
  return (
    <View
      style={{
        width: lg ? 40 : 26,
        height: lg ? 40 : 26,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: lg ? c.card.bg2 : c.room.chip,
        borderWidth: 1,
        borderColor: lg ? c.room.mark : c.room.dateboxLine,
      }}
    >
      <Text style={{ fontFamily: font.bold, fontSize: lg ? fs(13) : fs(10), color: lg ? c.room.mark : c.room.ink3 }}>
        {label}
      </Text>
    </View>
  );
}

function Kicker({ label, sub }: { label: string; sub?: string }) {
  const { c, font, fs } = useV2Theme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 26, marginBottom: 10 }}>
      <Text style={{ fontFamily: font.bold, fontSize: fs(15), color: c.room.ink }}>{label}</Text>
      {sub && (
        <Text style={{ fontFamily: font.semi, fontSize: fs(11.5), color: c.room.ink3, flexShrink: 1 }}>{sub}</Text>
      )}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  const { c, font, radius, fs } = useV2Theme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 36,
        justifyContent: 'center',
        paddingHorizontal: 13,
        borderRadius: radius.chip,
        backgroundColor: on ? c.room.mark : c.room.chip,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Text style={{ fontFamily: font.bold, fontSize: fs(12), color: on ? c.room.onMark : c.room.ink2 }}>{label}</Text>
    </Pressable>
  );
}

// ── the queue: names still waiting on a first call ─────────────────────────
function PendingRow({
  item,
  me,
  isAdmin,
  onTake,
  onNudge,
  onOpen,
  userById,
}: {
  item: OutreachPendingItem;
  me: string;
  /** Take / Remind write tasks + threads, which the rules keep operator+ —
   * community (viewer) sees the queue and can open people, nothing more. */
  isAdmin: boolean;
  onTake: (o: OutreachRecord, n: OutreachName) => void;
  onNudge: (o: OutreachRecord, n: OutreachName) => void;
  onOpen: (contactId: string) => void;
  userById: (id?: string | null) => AppUser | undefined;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const { record: o, name: n, days } = item;
  const who = userById(n.spokeWith);
  const mine = n.takenBy ? n.takenBy === me : n.spokeWith === me;
  const cold = days >= 7;
  const actions = (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {isAdmin && n.spokeWith !== me && !n.takenBy && (
        <Pressable
          onPress={() => onNudge(o, n)}
          style={({ pressed }) => ({
            minHeight: 40,
            justifyContent: 'center',
            paddingHorizontal: 15,
            borderRadius: radius.chip,
            borderWidth: 1,
            borderColor: c.card.border,
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Text style={{ fontFamily: font.bold, fontSize: fs(12), color: c.card.ink2 }}>
            Remind {firstName(who?.displayName || n.spokeWith || 'them')}
          </Text>
        </Pressable>
      )}
      {isAdmin && !n.takenBy && (
        <Pressable
          onPress={() => onTake(o, n)}
          style={({ pressed }) => ({
            minHeight: 40,
            justifyContent: 'center',
            paddingHorizontal: 15,
            borderRadius: radius.chip,
            backgroundColor: c.room.mark,
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Text style={{ fontFamily: font.bold, fontSize: fs(12), color: c.room.onMark }}>I'll take this</Text>
        </Pressable>
      )}
      {n.contactId && (
        <Pressable
          onPress={() => onOpen(n.contactId!)}
          style={({ pressed }) => ({
            minHeight: 40,
            justifyContent: 'center',
            paddingHorizontal: 15,
            borderRadius: radius.chip,
            backgroundColor: c.room.mark,
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Text style={{ fontFamily: font.bold, fontSize: fs(12), color: c.room.onMark }}>{mine ? 'Ring them' : 'Open'}</Text>
        </Pressable>
      )}
    </View>
  );
  return (
    <View
      style={{
        borderRadius: radius.tile,
        backgroundColor: c.card.bg,
        borderWidth: 1,
        borderColor: cold ? c.card.tones.ask.text : c.card.border,
        padding: 14,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
        <Face label={outreachInitials(n.name)} lg />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
            <Text style={{ fontFamily: font.bold, fontSize: fs(15), color: c.card.ink }}>{n.name}</Text>
            <Text style={{ fontFamily: font.semi, fontSize: fs(11), color: cold ? c.card.tones.ask.text : c.card.ink3 }}>
              {days <= 0 ? 'met today' : days === 1 ? 'met yesterday' : `${days} days waiting`}
            </Text>
          </View>
          <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), lineHeight: fs(18), color: c.card.ink2, marginTop: 3 }}>
            {n.contact || 'no number written down'} · met at {o.where}
            {n.note ? ` · ${n.note}` : ''}
          </Text>
          <Text style={{ fontFamily: font.semi, fontSize: fs(11.5), color: c.card.ink3, marginTop: 3 }}>
            {who?.displayName || n.spokeWith ? `${who?.displayName || n.spokeWith} spoke with ${firstName(n.name)}` : ''}
            {n.takenBy ? ` · ${n.takenBy === me ? "you're" : `${firstName(userById(n.takenBy)?.displayName || n.takenBy)} is`} following up` : ''}
          </Text>
        </View>
      </View>
      {actions}
    </View>
  );
}

// ── one month out ──────────────────────────────────────────────────────────
function OutreachCard({
  item,
  open,
  onToggle,
  onOpen,
  onEdit,
  onRemove,
  isAdmin,
  touches,
  userById,
}: {
  item: OutreachRecord;
  open: boolean;
  onToggle: () => void;
  onOpen: (contactId: string) => void;
  onEdit: () => void;
  onRemove: () => void;
  /** Edit / Remove are admin-only (the rules keep outreach update/delete
   * admin); community (viewer) reads the record and opens the people. */
  isAdmin: boolean;
  touches: Touch[];
  userById: (id?: string | null) => AppUser | undefined;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const [confirm, setConfirm] = useState(false);
  const names = item.names || [];
  const reached = names.filter((n) => outreachReached(item, n, touches)).length;
  const went = item.went || [];
  return (
    <View style={{ borderRadius: radius.tile, backgroundColor: c.card.bg, borderWidth: 1, borderColor: open ? c.room.mark : c.card.border, overflow: 'hidden' }}>
      <Pressable onPress={onToggle} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, padding: 15, opacity: pressed ? 0.8 : 1 })}>
        <View style={{ alignItems: 'center', width: 46 }}>
          <Text style={{ fontFamily: font.extra, fontSize: fs(24), lineHeight: fs(26), color: c.card.ink }}>{outreachDayNum(item.date)}</Text>
          <Text style={{ fontFamily: font.bold, fontSize: fs(10), letterSpacing: 0.6, textTransform: 'uppercase', color: c.card.ink3 }}>
            {outreachMonthShort(item.date)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font.extra, fontSize: fs(17), color: c.card.ink }}>{item.where}</Text>
          <Text style={{ fontFamily: font.semi, fontSize: fs(11.5), color: c.card.ink3, marginTop: 3 }}>
            {outreachWhen(item.date)} · {went.length + (item.others || 0)} of us went
            {outreachHandedLine(item.handed) ? ` · ${outreachHandedLine(item.handed)}` : ''}
          </Text>
          {!open && item.how ? (
            <Text numberOfLines={2} style={{ fontFamily: font.semi, fontSize: fs(12.5), color: c.card.ink2, marginTop: 6 }}>
              {item.how.split('\n')[0]}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flexDirection: 'row' }}>
            {went.slice(0, 3).map((id, i) => (
              <View key={`${id}-${i}`} style={{ marginLeft: i === 0 ? 0 : -7 }}>
                <Face label={outreachInitials(userById(id)?.displayName || id)} />
              </View>
            ))}
            {item.others > 0 && (
              <View style={{ marginLeft: -7 }}>
                <Face label={`+${item.others}`} />
              </View>
            )}
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 9,
              height: 22,
              borderRadius: 999,
              backgroundColor: names.length ? c.card.bg2 : c.room.chip,
            }}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(10.5), color: names.length ? c.room.mark : c.room.ink3 }}>
              {names.length ? `${names.length} ${names.length === 1 ? 'name' : 'names'}` : 'no names'}
            </Text>
            {reached > 0 && (
              <Text style={{ fontFamily: font.semi, fontSize: fs(10.5), color: c.room.mark }}>{reached} reached</Text>
            )}
          </View>
        </View>
      </Pressable>

      {open && (
        <View style={{ paddingHorizontal: 15, paddingBottom: 16, borderTopWidth: 1, borderTopColor: c.card.line }}>
          <View style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: font.bold, fontSize: fs(10.5), letterSpacing: 0.7, textTransform: 'uppercase', color: c.card.ink3 }}>How it went</Text>
            {item.how ? (
              item.how.split('\n').filter(Boolean).map((p, i) => (
                <Text key={i} style={{ fontFamily: font.semi, fontSize: fs(13.5), lineHeight: fs(20), color: c.card.ink, marginTop: 6 }}>
                  {p}
                </Text>
              ))
            ) : (
              <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), fontStyle: 'italic', color: c.card.ink3, marginTop: 6 }}>
                Nothing written down yet.
              </Text>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 18, marginTop: 14, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 140 }}>
              <Text style={{ fontFamily: font.bold, fontSize: fs(10.5), letterSpacing: 0.7, textTransform: 'uppercase', color: c.card.ink3 }}>Who went</Text>
              {went.map((id, i) => (
                <Text key={`${id}-${i}`} style={{ fontFamily: font.semi, fontSize: fs(13), color: c.card.ink2, marginTop: 4 }}>
                  {userById(id)?.displayName || id}
                </Text>
              ))}
              {item.others > 0 && (
                <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), fontStyle: 'italic', color: c.card.ink3, marginTop: 4 }}>
                  and {item.others} others from church
                </Text>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 140 }}>
              <Text style={{ fontFamily: font.bold, fontSize: fs(10.5), letterSpacing: 0.7, textTransform: 'uppercase', color: c.card.ink3 }}>What we handed out</Text>
              {[
                ['bibles', 'Bibles'],
                ['tracts', 'tracts'],
                ['booklets', 'booklets'],
              ].map(([k, label]) => (
                <Text key={k} style={{ fontFamily: font.semi, fontSize: fs(13), color: c.card.ink2, marginTop: 4 }}>
                  <Text style={{ fontFamily: font.extra, fontSize: fs(17), color: c.card.ink }}>
                    {item.handed?.[k as 'bibles' | 'tracts' | 'booklets'] || 0}
                  </Text>{' '}
                  {label}
                </Text>
              ))}
            </View>
          </View>

          <View style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: font.bold, fontSize: fs(10.5), letterSpacing: 0.7, textTransform: 'uppercase', color: c.card.ink3 }}>Who left us their number</Text>
            {names.length === 0 ? (
              <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), fontStyle: 'italic', color: c.card.ink3, marginTop: 6 }}>
                Nobody, this time. It still counted.
              </Text>
            ) : (
              <View style={{ marginTop: 6, gap: 6 }}>
                {names.map((n, i) => {
                  const done = outreachReached(item, n, touches);
                  return (
                    <Pressable
                      key={n.id || `${n.name}-${i}`}
                      onPress={() => n.contactId && onOpen(n.contactId)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 8,
                        paddingHorizontal: 11,
                        borderRadius: radius.note,
                        backgroundColor: c.card.field,
                        borderWidth: 1,
                        borderColor: c.card.border,
                        opacity: pressed ? 0.7 : done ? 0.75 : 1,
                      })}
                    >
                      <Face label={outreachInitials(n.name)} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: font.bold, fontSize: fs(13), color: c.card.ink }}>{n.name}</Text>
                        <Text numberOfLines={1} style={{ fontFamily: font.semi, fontSize: fs(11), color: c.card.ink3 }}>
                          {n.contact}
                          {n.note ? ` · ${n.note}` : ''}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: font.bold, fontSize: fs(10.5), color: done ? c.room.mark : c.card.ink3 }}>
                        {done ? 'reached' : 'still waiting'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {isAdmin && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 }}>
              <Pressable onPress={onEdit} hitSlop={8}>
                <Text style={{ fontFamily: font.bold, fontSize: fs(11.5), color: c.card.ink2 }}>Edit this one</Text>
              </Pressable>
              {confirm ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontFamily: font.semi, fontSize: fs(11), color: c.card.ink3 }}>Remove it from the record?</Text>
                  <Pressable onPress={onRemove} hitSlop={8}>
                    <Text style={{ fontFamily: font.bold, fontSize: fs(11.5), color: c.card.tones.ask.text }}>Remove</Text>
                  </Pressable>
                  <Pressable onPress={() => setConfirm(false)} hitSlop={8}>
                    <Text style={{ fontFamily: font.bold, fontSize: fs(11.5), color: c.card.ink2 }}>Keep</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setConfirm(true)} hitSlop={8}>
                  <Text style={{ fontFamily: font.bold, fontSize: fs(11.5), color: c.card.ink3 }}>Remove</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── log / edit sheet ───────────────────────────────────────────────────────
function OutreachLogSheet({
  item,
  me,
  userName,
  canCreateTasks,
  goers,
  visible,
  onClose,
  onSaved,
}: {
  item: OutreachRecord | null;
  me: string;
  userName: string;
  /** The rules keep task creation operator+ — a community (viewer) logger's
   * names still become contacts, just without the auto-to-do. */
  canCreateTasks: boolean;
  goers: AppUser[];
  visible: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { c, font, radius, fs } = useV2Theme();
  const editing = !!item;
  const [date, setDate] = useState(item ? item.date : WHEN_PRESETS[0].date);
  const [where, setWhere] = useState(item ? item.where : '');
  const [went, setWent] = useState<string[]>(item ? item.went.slice() : [me]);
  const [others, setOthers] = useState(item ? String(item.others || 0) : '');
  const [handed, setHanded] = useState<{ bibles: string; tracts: string; booklets: string }>(
    item
      ? { bibles: String(item.handed?.bibles ?? 0), tracts: String(item.handed?.tracts ?? 0), booklets: String(item.handed?.booklets ?? 0) }
      : { bibles: '', tracts: '', booklets: '' },
  );
  const [how, setHow] = useState(item ? item.how : '');
  const [rows, setRows] = useState(
    editing
      ? []
      : [{ key: 1, name: '', contact: '', spokeWith: me, note: '' } as { key: number; name: string; contact: string; spokeWith: string; note: string }],
  );
  const [saving, setSaving] = useState(false);
  const nextKey = React.useRef(2);

  const filled = rows.filter((r) => r.name.trim());
  const setRow = (key: number, patch: Partial<{ name: string; contact: string; spokeWith: string; note: string }>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const num = (v: string) => Math.max(0, parseInt(v, 10) || 0);

  const submit = async () => {
    if (!where.trim() || saving) return;
    setSaving(true);
    try {
      const draft: OutreachDraft = {
        date,
        where: where.trim(),
        went,
        others: num(others),
        handed: { bibles: num(handed.bibles), tracts: num(handed.tracts), booklets: num(handed.booklets) },
        how: how.trim(),
        photoCount: item?.photoCount ?? 0,
        names: filled.map((r) => ({ name: r.name.trim(), contact: r.contact.trim(), spokeWith: r.spokeWith, note: r.note.trim() })),
      };
      if (editing && item) {
        // Editing never touches the names — they're the record's whole point.
        await updateOutreach(item.id, {
          date,
          where: where.trim(),
          went,
          others: num(others),
          handed: { bibles: num(handed.bibles), tracts: num(handed.tracts), booklets: num(handed.booklets) },
          how: how.trim(),
          photoCount: item.photoCount ?? 0,
        });
        onSaved('Record updated.');
      } else {
        await addOutreach(draft, { uid: me, name: userName, canCreateTasks });
        onSaved('Logged — the names are real people now.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.9} {...v2SheetChrome(c)}>
      <Room room="ft">
        <View style={{ paddingHorizontal: 18, paddingTop: 4, paddingBottom: 24 }}>
          <Text style={{ fontFamily: font.extra, fontSize: fs(20), letterSpacing: -0.5, color: c.card.ink }}>
            {editing ? 'Edit an outreach' : 'Log an outreach'}
          </Text>
          <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), lineHeight: fs(18), color: c.card.ink3, marginTop: 4 }}>
            {editing ? 'Fix the record — nothing here notifies anyone.' : 'Write it down tonight, while the names still have faces.'}
          </Text>

          <View style={{ marginTop: 18, gap: 14 }}>
            <View>
              <Text style={{ fontFamily: font.bold, fontSize: fs(10.5), letterSpacing: 0.7, textTransform: 'uppercase', color: c.card.ink3 }}>When</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {WHEN_PRESETS.map((p) => (
                  <Chip key={p.key} label={p.label} on={date === p.date} onPress={() => setDate(p.date)} />
                ))}
              </View>
            </View>

            <View>
              <Text style={{ fontFamily: font.bold, fontSize: fs(10.5), letterSpacing: 0.7, textTransform: 'uppercase', color: c.card.ink3 }}>Where</Text>
              <View style={{ marginTop: 8 }}>
                <V2Input value={where} onChangeText={setWhere} placeholder="e.g. Cedar Park — the north lawn" />
              </View>
            </View>

            <View>
              <Text style={{ fontFamily: font.bold, fontSize: fs(10.5), letterSpacing: 0.7, textTransform: 'uppercase', color: c.card.ink3 }}>Who went</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
                {goers.map((u, i) => (
                  <Chip
                    key={`${u.uid}-${i}`}
                    label={firstName(u.displayName || u.uid)}
                    on={went.includes(u.uid)}
                    onPress={() => setWent((w) => (w.includes(u.uid) ? w.filter((x) => x !== u.uid) : w.concat(u.uid)))}
                  />
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), color: c.card.ink3 }}>plus</Text>
                <View style={{ width: 64 }}>
                  <V2Input value={others} onChangeText={setOthers} placeholder="0" keyboardType="number-pad" />
                </View>
                <Text style={{ fontFamily: font.semi, fontSize: fs(12.5), color: c.card.ink3 }}>others from church</Text>
              </View>
            </View>

            <View>
              <Text style={{ fontFamily: font.bold, fontSize: fs(10.5), letterSpacing: 0.7, textTransform: 'uppercase', color: c.card.ink3 }}>What we handed out</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {(
                  [
                    ['bibles', 'Bibles'],
                    ['tracts', 'Tracts'],
                    ['booklets', 'Booklets'],
                  ] as const
                ).map(([k, label]) => (
                  <View key={k} style={{ flex: 1, gap: 4 }}>
                    <V2Input value={handed[k]} onChangeText={(v) => setHanded((h) => ({ ...h, [k]: v }))} placeholder="0" keyboardType="number-pad" />
                    <Text style={{ fontFamily: font.semi, fontSize: fs(11), color: c.card.ink3 }}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View>
              <Text style={{ fontFamily: font.bold, fontSize: fs(10.5), letterSpacing: 0.7, textTransform: 'uppercase', color: c.card.ink3 }}>How it went</Text>
              <View style={{ marginTop: 8 }}>
                <V2TextArea
                  value={how}
                  onChangeText={setHow}
                  minHeight={90}
                  placeholder="Where you set up, who preached, what people asked — what you'd want to remember next month."
                />
              </View>
            </View>

            {!editing && (
              <View>
                <Text style={{ fontFamily: font.bold, fontSize: fs(10.5), letterSpacing: 0.7, textTransform: 'uppercase', color: c.card.ink3 }}>
                  Who left us their number
                </Text>
                <View style={{ marginTop: 8, gap: 10 }}>
                  {rows.map((r) => (
                    <View key={r.key} style={{ borderRadius: radius.note, borderWidth: 1, borderColor: c.card.border, backgroundColor: c.card.field, padding: 11, gap: 8 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <V2Input value={r.name} onChangeText={(v) => setRow(r.key, { name: v })} placeholder="Their name" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <V2Input value={r.contact} onChangeText={(v) => setRow(r.key, { contact: v })} placeholder="Number or email" />
                        </View>
                      </View>
                      <V2Input value={r.note} onChangeText={(v) => setRow(r.key, { note: v })} placeholder="What they said, what they took" />
                      <View>
                        <Text style={{ fontFamily: font.semi, fontSize: fs(10.5), color: c.card.ink3, marginBottom: 6 }}>spoke with them</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                          {goers.map((u, i) => (
                            <Chip
                              key={`${u.uid}-${i}`}
                              label={firstName(u.displayName || u.uid)}
                              on={r.spokeWith === u.uid}
                              onPress={() => setRow(r.key, { spokeWith: u.uid })}
                            />
                          ))}
                        </ScrollView>
                      </View>
                      {rows.length > 1 && (
                        <Pressable onPress={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
                          <Text style={{ fontFamily: font.bold, fontSize: fs(11.5), color: c.card.ink3 }}>Remove this row</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                </View>
                <Pressable
                  onPress={() => setRows((rs) => rs.concat({ key: nextKey.current++, name: '', contact: '', spokeWith: me, note: '' }))}
                  hitSlop={8}
                  style={{ marginTop: 10, alignSelf: 'flex-start' }}
                >
                  <Text style={{ fontFamily: font.bold, fontSize: fs(12.5), color: c.room.mark }}>+ Another name</Text>
                </Pressable>
                {filled.length > 0 && (
                  <Text style={{ fontFamily: font.semi, fontSize: fs(11.5), color: c.card.ink3, marginTop: 8 }}>
                    {filled.length} {filled.length === 1 ? 'person joins' : 'people join'} the app tonight — and {filled.length === 1 ? 'lands' : 'land'} on the list of people to reach tomorrow.
                  </Text>
                )}
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 48,
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: radius.chip,
                borderWidth: 1,
                borderColor: c.card.border,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: c.card.ink2 }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!where.trim() || saving}
              style={({ pressed }) => ({
                flex: 2,
                minHeight: 48,
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: radius.chip,
                backgroundColor: c.room.mark,
                opacity: pressed || !where.trim() || saving ? 0.6 : 1,
              })}
            >
              <Text style={{ fontFamily: font.bold, fontSize: fs(13.5), color: c.room.onMark }}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Log the outreach'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Room>
    </Sheet>
  );
}

// ── the page ───────────────────────────────────────────────────────────────
function Outreach() {
  const { c, font, fs } = useV2Theme();
  const { uid, user, role } = useAuth();
  const router = useRouter();
  const me = uid || '';
  const userName = user?.displayName || 'Someone';
  // Outreach is full-timer + community: both see and log (canLog); only the
  // full-timer takes, nudges, edits or removes (admin-only writes in the rules).
  const isAdmin = role === 'admin';
  const canLog = canLogOutreach(role);
  const { loading, error, users, touches, pending, thisMonth, earlier, stats, userById } = useOutreachData();
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ mode: 'log' } | { mode: 'edit'; item: OutreachRecord } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, bump] = React.useReducer((n: number) => n + 1, 0);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const openContact = (id: string) => router.push(`/contact/${id}`);

  const take = async (o: OutreachRecord, n: OutreachName) => {
    await takeOutreachName(o.id, n, o.where, { uid: me, name: userName });
    bump();
    showToast(`${firstName(n.name)} is yours — it's on your list for tomorrow.`);
  };

  const nudge = async (o: OutreachRecord, n: OutreachName) => {
    if (n.contactId && n.spokeWith) {
      await addThreadMessage(
        n.contactId,
        {
          from: me,
          fromName: userName,
          kind: 'nudge',
          body: `${firstName(n.name)} gave you their number at ${o.where} ${outreachDaysSince(o.date)} days ago and nobody has rung yet. Could you get to it today?`,
        },
        { to: n.spokeWith, contactName: n.name },
      );
    }
    showToast(`Sent ${firstName(userById(n.spokeWith)?.displayName || n.spokeWith)} a reminder about ${firstName(n.name)}.`);
  };

  const remove = async (o: OutreachRecord) => {
    await removeOutreach(o.id, o.where);
    setOpenId(null);
    bump();
    showToast('Removed from the record.');
  };

  const last = thisMonth[0] || earlier[0] || null;

  if (error) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontFamily: font.semi, fontSize: fs(14), color: c.room.ink2, textAlign: 'center' }}>{error}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.room.bg }}>
      <V2Screen
        title="Outreach"
        note={last ? `Last out: ${outreachWhen(last.date)}` : 'Nothing written down yet'}
        action={canLog ? { label: 'Log an outreach', onPress: () => setSheet({ mode: 'log' }) } : undefined}
        onBack={back}
      >
        <View style={{ marginTop: 10 }}>
          <Text style={{ fontFamily: font.extra, fontSize: fs(24), lineHeight: fs(29), letterSpacing: -0.8, color: c.room.ink }}>
            {last ? (
              <>
                Last time out was {outreachWhen(last.date)} at {last.where}.
              </>
            ) : (
              <>Once a month, out in the open.</>
            )}
          </Text>
          <Text style={{ fontFamily: font.semi, fontSize: fs(13), lineHeight: fs(19), color: c.room.ink3, marginTop: 8 }}>
            {pending.length > 0
              ? `${pending.length} ${pending.length === 1 ? 'person' : 'people'} left us a number and ${pending.length === 1 ? "hasn't" : "haven't"} heard back yet — that's the whole job this week.`
              : last
                ? 'Everyone who left us a number has heard from someone. That\'s rare, and worth saying out loud.'
                : 'Log a month once you\'re home — the names are the part that matters.'}
          </Text>
        </View>

        {pending.length > 0 && (
          <>
            <Kicker label="People we met, not yet reached" sub="A number given is a door held open. It doesn't stay open long." />
            <View style={{ gap: 10 }}>
              {pending.map((p, i) => (
                <PendingRow key={`${p.record.id}-${p.name.id || p.name.name}-${i}`} item={p} me={me} isAdmin={isAdmin} onTake={take} onNudge={nudge} onOpen={openContact} userById={userById} />
              ))}
            </View>
          </>
        )}

        {loading ? (
          <SkeletonList rows={3} style={{ marginTop: 48 }} />
        ) : (
          <>
            {thisMonth.length > 0 && (
              <>
                <Kicker label="This month" sub="Tap to read it back." />
                <View style={{ gap: 10 }}>
                  {thisMonth.map((o) => (
                    <OutreachCard
                      key={o.id}
                      item={o}
                      open={openId === o.id}
                      onToggle={() => setOpenId(openId === o.id ? null : o.id)}
                      onOpen={openContact}
                      onEdit={() => setSheet({ mode: 'edit', item: o })}
                      onRemove={() => remove(o)}
                      isAdmin={isAdmin}
                      touches={touches}
                      userById={userById}
                    />
                  ))}
                </View>
              </>
            )}

            {earlier.length > 0 && (
              <>
                <Kicker label="Earlier months" />
                <View style={{ gap: 10 }}>
                  {earlier.map((o) => (
                    <OutreachCard
                      key={o.id}
                      item={o}
                      open={openId === o.id}
                      onToggle={() => setOpenId(openId === o.id ? null : o.id)}
                      onOpen={openContact}
                      onEdit={() => setSheet({ mode: 'edit', item: o })}
                      onRemove={() => remove(o)}
                      isAdmin={isAdmin}
                      touches={touches}
                      userById={userById}
                    />
                  ))}
                </View>
              </>
            )}

            {thisMonth.length === 0 && earlier.length === 0 && (
              <View style={{ marginTop: 26 }}>
                <V2Empty>
                  Nothing here yet. An outreach gets written down after you're home — where you went, who came, what you handed out, and every name that came back with you.
                </V2Empty>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 22, flexWrap: 'wrap', marginTop: 28, alignItems: 'flex-end' }}>
              {(
                [
                  [stats.months, 'months out'],
                  [stats.names, 'names came back with us'],
                  [stats.bibles, 'Bibles into hands'],
                ] as const
              ).map(([n, l]) => (
                <View key={l} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7 }}>
                  <Text style={{ fontFamily: font.extra, fontSize: fs(24), color: c.room.ink }}>{n}</Text>
                  <Text style={{ fontFamily: font.semi, fontSize: fs(11.5), color: c.room.ink3 }}>{l}</Text>
                </View>
              ))}
            </View>
            <Text style={{ fontFamily: font.semi, fontSize: fs(10.5), color: c.room.faint, marginTop: 10 }}>
              Counted only so nobody waits by a phone that never rings.
            </Text>
          </>
        )}
      </V2Screen>

      {sheet && (
        <OutreachLogSheet
          item={sheet.mode === 'edit' ? sheet.item : null}
          me={me}
          userName={userName}
          canCreateTasks={isAdmin}
          goers={users}
          visible
          onClose={() => setSheet(null)}
          onSaved={(msg) => {
            setSheet(null);
            bump();
            showToast(msg);
          }}
        />
      )}
      {toast && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', bottom: 40, left: 24, right: 24, alignItems: 'center' }}
        >
          <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: c.room.ink, opacity: 0.94 }}>
            <Text style={{ fontFamily: font.bold, fontSize: fs(12.5), color: c.room.bg }}>{toast}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
