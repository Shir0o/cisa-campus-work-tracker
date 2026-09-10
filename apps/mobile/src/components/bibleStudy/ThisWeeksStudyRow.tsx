// Mobile v2 — "This week's study" on the phone (#946).
//
// The reader itself is not ported. The week is a read-only rich document whose
// renderer — Sections, Prompts, Blanks that reveal — exists only on web, and
// the URL behind it is durable by design (ADR 0011), so the row opens that URL
// in an in-app browser rather than duplicating the renderer in React Native.
// Dismissing the browser returns to the app; `expo-linking` would have handed
// the person to Safari and made them app-switch back.
//
// Show QR and Copy link are native, because those are the two things a person
// holding a phone in a room actually needs and neither requires the renderer.
//
// Every role gets this. It is one week — the current one — never the archive,
// which stays Full-timers-only on web (ADR 0011 §6).
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { subscribeEntryPoints, type EntryPoint } from '../../lib/data/bibleStudy';
import { useV2Theme } from '../../theme/v2';

/**
 * The production origin, matching web's `VITE_PUBLIC_APP_URL` default. Never
 * derived from anything device-local: this URL is what a student scans, and an
 * unreachable one in front of a room is the failure ADR 0011 §5 calls out.
 */
const PUBLIC_APP_URL = 'https://cisa-campus-work-tracker.pages.dev';
const entryPointUrl = (slug: string) => `${PUBLIC_APP_URL}/s/${slug}`;

/**
 * `list` is the tiled row used by the full-timer's More tab and the member's
 * You tab; `drawer` is the trainee's dot-and-label idiom, since that shell has
 * no tab bar and reaches everything through its drawer. Two skins, one
 * behaviour — the resolution, the copy and the code are written once.
 */
export function ThisWeeksStudyRow({
  isFirst = false,
  variant = 'list',
  onNavigate,
}: {
  isFirst?: boolean;
  variant?: 'list' | 'drawer';
  /** Called before the browser opens, so a drawer can close itself first. */
  onNavigate?: () => void;
}) {
  const { c, font, fs, radius } = useV2Theme();
  const [entryPoints, setEntryPoints] = useState<EntryPoint[]>([]);
  const [qrFor, setQrFor] = useState<EntryPoint | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribeEntryPoints(setEntryPoints), []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  // Nothing standing behind the app's code — no row to show. The web reader
  // owns the between-terms and never-published states, which are about the
  // Study rather than the invitation, so the row still opens for those.
  if (entryPoints.length === 0) return null;

  // A split week is two Entry points (ADR 0011 §4). Rather than remember a
  // pick on a surface that is a single row, each one gets its own row named
  // for the room — the names are what tell them apart anyway.
  const drawer = variant === 'drawer';
  const ink = drawer ? c.card.ink : c.widget.ink;
  const ink3 = drawer ? c.card.ink3 : c.widget.ink3;

  const open = (ep: EntryPoint) => {
    onNavigate?.();
    return WebBrowser.openBrowserAsync(entryPointUrl(ep.slug));
  };

  return (
    <>
      {entryPoints.map((ep, i) => (
        <View
          key={ep.slug}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: drawer ? 12 : 0,
            minHeight: drawer ? 52 : 58,
            paddingHorizontal: drawer ? 0 : 18,
            borderTopWidth: drawer || (isFirst && i === 0) ? 0 : 1,
            borderTopColor: c.widget.line,
          }}
        >
          {drawer && (
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ink3 }} />
          )}
          <Pressable
            onPress={() => open(ep)}
            style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1, paddingVertical: 12 })}
            accessibilityRole="button"
            accessibilityLabel={
              entryPoints.length > 1 ? `This week's study — ${ep.name}` : "This week's study"
            }
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(drawer ? 16 : 15.5), color: ink }}>
              This week's study
            </Text>
            {entryPoints.length > 1 && (
              <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: ink3 }}>
                {ep.name}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(entryPointUrl(ep.slug));
              setCopied(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Copy link"
            style={({ pressed }) => ({ paddingHorizontal: 10, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(12), color: ink3 }}>
              {copied ? 'Copied' : 'Copy'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setQrFor(ep)}
            accessibilityRole="button"
            accessibilityLabel="Show QR"
            style={({ pressed }) => ({ paddingLeft: 10, paddingVertical: 12, opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ fontFamily: font.bold, fontSize: fs(12), color: ink3 }}>QR</Text>
          </Pressable>
        </View>
      ))}

      {/* White ground regardless of the app's theme, like web's Present mode:
          a dark ground behind a code hurts scan reliability (ADR 0011). */}
      <Modal visible={!!qrFor} animationType="fade" transparent onRequestClose={() => setQrFor(null)}>
        <Pressable
          onPress={() => setQrFor(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: radius.tile, padding: 24, alignItems: 'center' }}>
            {qrFor && (
              <QRCode value={entryPointUrl(qrFor.slug)} size={248} color="#0A0A0B" backgroundColor="#FFFFFF" />
            )}
            <Text style={{ fontFamily: font.medium, fontSize: fs(12), color: '#6B6B6B', marginTop: 16 }}>
              {qrFor?.name}
            </Text>
            <Text style={{ fontFamily: font.medium, fontSize: fs(11), color: '#9B9B9B', marginTop: 4 }}>
              {qrFor ? entryPointUrl(qrFor.slug) : ''}
            </Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
