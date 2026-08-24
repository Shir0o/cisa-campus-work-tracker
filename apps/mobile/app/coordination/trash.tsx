import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { dayNum, weekdayShort, type BoardDoc } from '@cisa/core';
import { Screen, AppText, Card } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAuth } from '../../src/lib/AuthProvider';
import { useLanguage } from '../../src/lib/LanguageProvider';
import { Translate } from '../../src/components/Translate';
import { handleFirestoreError, OperationType } from '../../src/lib/firebase';
import { deleteBoardDoc, purgeExpiredTrash, restoreBoardDoc, subscribeTrashedBoardDocs } from '../../src/lib/data/board';

// Trash for "The Board" (board_docs) — soft-deleted pages, admin-only
// (matches board_docs' delete rule, which is admin-only). Restore brings a
// page back to the main Pages list; "Delete Forever" is the old permanent
// hard-delete, now only reachable from here.
export default function CoordinationTrash() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { role } = useAuth();
  const { t } = useLanguage();
  const isAdmin = role === 'admin';
  const [docs, setDocs] = useState<BoardDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeTrashedBoardDocs(
      (list) => {
        setDocs(list);
        setLoading(false);
        void purgeExpiredTrash(list);
      },
      (e) => handleFirestoreError(e, OperationType.LIST, 'board_docs (trash)', { rethrow: false }),
    );
    return () => unsub();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 }}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.onSurfaceVariant} />
          <AppText variant="heading">{t('coordinationTrash.not_available', 'Not available')}</AppText>
        </View>
      </Screen>
    );
  }

  const confirmPurge = (d: BoardDoc) => {
    Alert.alert(
      t('mobile.board.delete_forever_title', 'Delete Forever?'),
      t('coordinationTrash.confirm_purge', `"${d.title}" will be permanently removed. This can't be undone.`).replace('{title}', d.title),
      [
        { text: t('mobile.common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('coordinationTrash.delete_forever', 'Delete Forever'), style: 'destructive', onPress: () => deleteBoardDoc(d) },
      ],
    );
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 40, gap: spacing.lg }}>
        <View style={{ gap: 4 }}>
          <AppText variant="label" color={colors.primary} style={{ textTransform: 'uppercase' }}>
            {t('coordinationTrash.coordination_notes', 'COORDINATION')}
          </AppText>
          <AppText variant="title">{t('coordinationTrash.title', 'Trash')}</AppText>
          <AppText variant="body" color={colors.onSurfaceVariant}>
            {t('coordinationTrash.subtitle', 'Deleted pages, kept here until restored or removed for good.')}
          </AppText>
        </View>

        {loading ? (
          <AppText variant="body" color={colors.onSurfaceVariant} style={{ textAlign: 'center', paddingVertical: 24 }}>
            {t('mobile.common.loading', 'Loading…')}
          </AppText>
        ) : docs.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
            <Ionicons name="trash-outline" size={40} color={colors.onSurfaceVariant} style={{ opacity: 0.4 }} />
            <AppText variant="heading" style={{ textAlign: 'center' }}>
              {t('coordinationTrash.trash_is_empty', 'Trash is empty')}
            </AppText>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {docs.map((doc) => (
              <Card key={doc.id}>
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <View
                    style={{
                      width: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      backgroundColor: colors.surfaceVariant,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.onSurfaceVariant }}>{weekdayShort(doc.date)}</Text>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: colors.onSurface }}>{dayNum(doc.date)}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <AppText variant="heading" numberOfLines={1}>
                      <Translate text={doc.title} />
                    </AppText>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <Pressable onPress={() => restoreBoardDoc(doc)}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                          {t('coordinationTrash.restore', 'Restore')}
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => confirmPurge(doc)}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.error }}>
                          {t('coordinationTrash.delete_forever', 'Delete Forever')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
