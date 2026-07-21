import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import {
  DUE_PRESETS,
  duePresetToISO,
  presetForDue,
  toLocalDate,
  type DuePresetKey,
  type Task,
} from '@cisa/core';
import { AppText, Button, Card, DuePresetPills, InlineInput, SectionHead } from '../ui';
import { useTheme } from '../../theme/ThemeProvider';

function CheckCircle({ done, onPress }: { done: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1.5,
        borderColor: done ? colors.primary : colors.outline,
        backgroundColor: done ? colors.primary : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
      }}
    >
      {done && <Ionicons name="checkmark" size={13} color={colors.onPrimary} />}
    </Pressable>
  );
}

// On the horizon — assigned + personal to-dos. Design: dash-sec / bd-task rows.
export function OnTheHorizon({
  assignedTasks,
  personalTasks,
  onToggle,
  onAdd,
  onUpdate,
  onDelete,
}: {
  assignedTasks: Task[];
  personalTasks: Task[];
  onToggle: (task: Task) => void;
  onAdd: (title: string, dueDate: string | null) => void;
  onUpdate: (id: string, patch: { title?: string; dueDate?: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const { colors, spacing } = useTheme();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editPreset, setEditPreset] = useState<DuePresetKey>('week');
  const [editDue, setEditDue] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const [newPreset, setNewPreset] = useState<DuePresetKey>('week');
  const [newDue, setNewDue] = useState<string | null>(duePresetToISO(5));

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditText(task.title);
    setEditPreset(presetForDue(task.dueDate));
    setEditDue(task.dueDate ?? null);
  };

  const saveEdit = (task: Task) => {
    const t = editText.trim();
    if (!t) return;
    onUpdate(task.id, { title: t, dueDate: editDue });
    setEditingId(null);
  };

  const commitNew = () => {
    const t = newText.trim();
    if (!t) return;
    onAdd(t, newDue);
    setNewText('');
    setNewPreset('week');
    setNewDue(duePresetToISO(5));
    setAdding(false);
  };

  const rows = assignedTasks.length + personalTasks.length;

  return (
    <View>
      <SectionHead title="On the horizon" />
      <Card style={{ padding: 0 }}>
        <View style={{ paddingHorizontal: spacing.lg }}>
          {assignedTasks.map((task, i) => {
            const done = task.status === 'completed';
            return (
              <View
                key={task.id}
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  paddingVertical: 14,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.outlineVariant,
                }}
              >
                <CheckCircle done={done} onPress={() => onToggle(task)} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14.5,
                      fontWeight: '500',
                      color: done ? colors.onSurfaceVariant : colors.onSurface,
                      textDecorationLine: done ? 'line-through' : 'none',
                    }}
                  >
                    {task.title}
                  </Text>
                  {task.sourceDocTitle && (
                    <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginTop: 3 }}>
                      From {task.sourceDocTitle}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}

          {personalTasks.map((task, i) => {
            const done = task.status === 'completed';
            const isEditing = editingId === task.id;
            const first = i === 0 && assignedTasks.length === 0;
            const dueDate = toLocalDate(task.dueDate);
            return (
              <View
                key={task.id}
                style={{
                  paddingVertical: 14,
                  borderTopWidth: first ? 0 : 1,
                  borderTopColor: colors.outlineVariant,
                  gap: 8,
                }}
              >
                {isEditing ? (
                  <>
                    <InlineInput autoFocus value={editText} onChangeText={setEditText} />
                    <DuePresetPills
                      presets={DUE_PRESETS}
                      value={editPreset}
                      onPick={(key, days) => {
                        setEditPreset(key as DuePresetKey);
                        setEditDue(duePresetToISO(days));
                      }}
                    />
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                      <Pressable onPress={() => onDelete(task.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="trash-outline" size={14} color={colors.error} />
                        <Text style={{ fontSize: 12.5, color: colors.error, fontWeight: '500' }}>Delete</Text>
                      </Pressable>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Button title="Cancel" variant="ghost" onPress={() => setEditingId(null)} />
                        <Button title="Save" onPress={() => saveEdit(task)} disabled={!editText.trim()} />
                      </View>
                    </View>
                  </>
                ) : (
                  <Pressable
                    onPress={() => !done && startEdit(task)}
                    style={{ flexDirection: 'row', gap: 12 }}
                  >
                    <CheckCircle done={done} onPress={() => onToggle(task)} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14.5,
                          fontWeight: '500',
                          color: done ? colors.onSurfaceVariant : colors.onSurface,
                          textDecorationLine: done ? 'line-through' : 'none',
                        }}
                      >
                        {task.title}
                      </Text>
                      {dueDate && (
                        <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginTop: 3 }}>
                          Due: {format(dueDate, 'MMM d')}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                )}
              </View>
            );
          })}

          {adding ? (
            <View style={{ paddingVertical: 14, borderTopWidth: rows > 0 ? 1 : 0, borderTopColor: colors.outlineVariant, gap: 8 }}>
              <InlineInput autoFocus placeholder="What needs doing?" value={newText} onChangeText={setNewText} />
              <Text style={{ fontSize: 11, fontWeight: '600', textTransform: 'uppercase', color: colors.onSurfaceVariant }}>
                Due
              </Text>
              <DuePresetPills
                presets={DUE_PRESETS}
                value={newPreset}
                onPick={(key, days) => {
                  setNewPreset(key as DuePresetKey);
                  setNewDue(duePresetToISO(days));
                }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <Button title="Cancel" variant="ghost" onPress={() => setAdding(false)} />
                <Button title="Add" onPress={commitNew} disabled={!newText.trim()} />
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setAdding(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 12,
                borderTopWidth: rows > 0 ? 1 : 0,
                borderTopColor: colors.outlineVariant,
              }}
            >
              <Ionicons name="add" size={16} color={colors.primary} />
              <AppText variant="body" color={colors.primary} style={{ fontWeight: '600' }}>
                Add a task
              </AppText>
            </Pressable>
          )}
        </View>
      </Card>
    </View>
  );
}
