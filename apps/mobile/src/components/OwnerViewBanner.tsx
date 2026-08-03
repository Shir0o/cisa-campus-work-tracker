import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView } from 'react-native';
import { useAuth, type AppRole } from '../lib/AuthProvider';
import { roleLabel } from '@cisa/core';

const ROLES: { key: AppRole; label: string; note: string }[] = [
  { key: 'admin', label: 'Full-timer', note: 'Widgets & full-timer home' },
  { key: 'manager', label: 'Trainee', note: 'Focus queue & drawer' },
  { key: 'operator', label: 'Student', note: 'Member app (Student)' },
  { key: 'viewer', label: 'Community', note: 'Member app (Community)' },
];

export function OwnerViewBanner() {
  const { isOwner, ownerViewRole, setOwnerViewRole } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);

  if (!isOwner) return null;

  const currentRoleLabel = ownerViewRole ? roleLabel(ownerViewRole) : 'App Owner';

  return (
    <>
      <View style={styles.bannerContainer}>
        <View style={styles.textContainer}>
          <Text style={styles.eyeIcon}>👁️</Text>
          <Text style={styles.bannerText} numberOfLines={1}>
            {ownerViewRole ? `Seeing CISA as: ${currentRoleLabel}` : 'App Owner View'}
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.switchButtonText}>
              {ownerViewRole ? 'Switch' : 'See their view'}
            </Text>
          </TouchableOpacity>

          {ownerViewRole ? (
            <TouchableOpacity
              style={styles.resetButton}
              onPress={() => setOwnerViewRole(null)}
              activeOpacity={0.7}
            >
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>See it as they do</Text>
            <Text style={styles.modalSub}>
              Preview mobile experience for each role. (Owner preview mode)
            </Text>

            <ScrollView style={styles.roleList}>
              {ROLES.map((r) => {
                const isActive = ownerViewRole === r.key;
                return (
                  <TouchableOpacity
                    key={r.key}
                    style={[styles.roleCard, isActive && styles.roleCardActive]}
                    onPress={() => {
                      setOwnerViewRole(r.key);
                      setModalVisible(false);
                    }}
                  >
                    <View>
                      <Text style={[styles.roleCardTitle, isActive && styles.roleCardTitleActive]}>
                        {r.label}
                      </Text>
                      <Text style={styles.roleCardSub}>{r.note}</Text>
                    </View>
                    {isActive ? <Text style={styles.activeCheck}>✓</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    backgroundColor: '#fffbeb',
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 99,
  },
  textContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  eyeIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  bannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  switchButton: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  switchButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#78350f',
  },
  resetButton: {
    backgroundColor: '#d97706',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  resetButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 16,
    lineHeight: 16,
  },
  roleList: {
    marginBottom: 16,
  },
  roleCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roleCardActive: {
    borderColor: '#d97706',
    backgroundColor: '#fffbeb',
  },
  roleCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  roleCardTitleActive: {
    color: '#92400e',
  },
  roleCardSub: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  activeCheck: {
    fontSize: 16,
    fontWeight: '700',
    color: '#d97706',
  },
  closeButton: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
});
