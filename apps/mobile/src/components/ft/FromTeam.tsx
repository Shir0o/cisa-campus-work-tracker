// Mobile v2 — "From the team". Everyone else's work, so a full-timer can see it
// and answer it. Ported from the design's `.ftw-item` rows.
import React from 'react';
import { Text, View } from 'react-native';
import { ftInboxVisible, type FtInboxRow } from '@cisa/core';
import { useV2Theme } from '../../theme/v2';
import { PersonMark } from '../queue/atoms';
import { FtAction, FtEmpty, FtRow, FtWidget } from './FtWidget';

export function FromTeam({
  rows,
  unread,
  onReply,
  onOpen,
  onScan,
}: {
  rows: FtInboxRow[];
  unread: number;
  onReply: (row: FtInboxRow) => void;
  onOpen: (contactId: string) => void;
  onScan: (row: FtInboxRow) => void;
}) {
  const { c, font } = useV2Theme();
  const [expanded, setExpanded] = React.useState(false);
  const shown = ftInboxVisible(rows, expanded);
  const rest = rows.length - shown.length;

  return (
    <FtWidget
      label="From the team"
      count={unread}
      link={expanded ? 'Show less' : rest > 0 ? `Everything else (${rest}) →` : null}
      onLink={() => setExpanded((v) => !v)}
    >
      {shown.length === 0 && <FtEmpty>All scanned.</FtEmpty>}
      {shown.map((row, i) => (
        <FtRow key={row.item.id} first={i === 0}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <PersonMark name={row.who} id={row.item.by} size={34} radius={11} fontSize={12} />
            <View style={{ flex: 1, opacity: row.unread ? 1 : 0.66 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                {row.unread && (
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: c.tones.follow.dot,
                    }}
                  />
                )}
                <Text
                  style={{
                    flex: 1,
                    fontFamily: font.bold,
                    fontSize: 15,
                    lineHeight: 20,
                    color: c.cardInk,
                  }}
                >
                  {row.headline}
                </Text>
              </View>
              {!!row.sub && (
                <Text
                  style={{
                    fontFamily: font.medium,
                    fontSize: 13,
                    lineHeight: 18,
                    color: c.cardInk2,
                    marginTop: 4,
                  }}
                  numberOfLines={3}
                >
                  {row.sub}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 18, marginTop: 2 }}>
                <FtAction
                  label={row.reply === 'write-back' ? 'Write back' : 'Encourage'}
                  onPress={() => onReply(row)}
                />
                <FtAction label="Open" onPress={() => onOpen(row.item.contactId)} />
                <FtAction label={row.unread ? 'Scanned' : 'Unscan'} onPress={() => onScan(row)} />
              </View>
            </View>
          </View>
        </FtRow>
      ))}
    </FtWidget>
  );
}
