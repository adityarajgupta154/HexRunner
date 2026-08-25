import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useCreateSafetyReport } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import {
  getPendingSafetyReports,
  flushPendingSafetyReports,
  queueSafetyReport,
  removePendingSafetyReport,
} from '@/src/services/safetyStorage';
import {
  loadTrustedContacts,
  saveTrustedContacts,
  type TrustedContact,
  validTrustedContact,
} from '@/src/services/trustedContacts';
import { pointToSafetyArea } from '@/src/services/hexEngine';

type SafetyPoint = { lat: number; lng: number; timestamp: number };

export default function SafetyTools({
  currentPoint,
  isRunning,
  clientRunId,
}: {
  currentPoint: SafetyPoint | null;
  isRunning: boolean;
  clientRunId: string | null;
}) {
  const colors = useColors();
  const reportMutation = useCreateSafetyReport();
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [drafts, setDrafts] = useState<TrustedContact[]>([
    { name: '', phone: '' },
    { name: '', phone: '' },
  ]);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<'report' | 'sos' | null>(null);

  const refreshContacts = useCallback(async () => {
    const saved = await loadTrustedContacts();
    setContacts(saved);
    setDrafts([saved[0] ?? { name: '', phone: '' }, saved[1] ?? { name: '', phone: '' }]);
  }, []);

  useEffect(() => {
    void refreshContacts();
    const flush = async () => {
      await flushPendingSafetyReports();
    };
    void flush();
    const retryTimer = setInterval(() => void flush(), 30_000);
    return () => clearInterval(retryTimer);
  }, []);

  const submitUnsafeReport = useCallback(async () => {
    if (!currentPoint) {
      setNotice('GPS is not ready. Keep location permission enabled and try again.');
      return;
    }
    const report = {
      clientReportId: `safety_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      clientRunId: clientRunId ?? '',
      areaH3Index: pointToSafetyArea(currentPoint.lat, currentPoint.lng),
      occurredAt: new Date(currentPoint.timestamp).toISOString(),
    };
    await queueSafetyReport(report);
    try {
      const result = await reportMutation.mutateAsync({ data: report });
      await removePendingSafetyReport(report.clientReportId);
      setNotice(result.duplicate
        ? 'This coarse area was already reported recently.'
        : 'Thank you. Your report was reduced to a coarse area before being stored.');
    } catch {
      setNotice('Signal saved as a coarse area on this device. It will retry after this run is securely saved.');
    }
  }, [clientRunId, currentPoint, reportMutation]);

  const saveContacts = async () => {
    const partial = drafts.filter((item) => item.name.trim() || item.phone.trim());
    if (partial.some((item) => !validTrustedContact(item))) {
      setNotice('Each saved contact needs a name and valid phone number.');
      return;
    }
    await saveTrustedContacts(partial);
    await refreshContacts();
    setContactsOpen(false);
    setNotice(partial.length ? 'Trusted contacts saved only on this device.' : 'Trusted contacts removed.');
  };

  const launchSos = async () => {
    if (!currentPoint) {
      setNotice('GPS is not ready, so HexRunner cannot create an SOS location message.');
      return;
    }
    if (!contacts.length) {
      setContactsOpen(true);
      setNotice('Add at least one trusted contact before sharing SOS.');
      return;
    }
    const timestamp = new Date().toLocaleString();
    const mapUrl = `https://maps.google.com/?q=${currentPoint.lat},${currentPoint.lng}`;
    const message = `I may need help. My HexRunner location at ${timestamp}: ${mapUrl}\n\nThis is a personal location share and does not contact emergency services.`;
    try {
      if (Platform.OS === 'web') {
        await Share.share({ title: 'HexRunner SOS location', message });
      } else {
        const separator = Platform.OS === 'android' ? ';' : ',';
        const querySeparator = Platform.OS === 'ios' ? '&' : '?';
        await Linking.openURL(
          `sms:${contacts.map((contact) => contact.phone).join(separator)}${querySeparator}body=${encodeURIComponent(message)}`,
        );
      }
    } catch {
      setNotice('Could not open your messaging app. Check that SMS sharing is available.');
    }
  };

  return (
    <>
      <View style={styles.actions}>
        {isRunning ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Report feeling unsafe here"
            disabled={reportMutation.isPending}
            onPress={() => setConfirmation('report')}
            style={({ pressed }) => [styles.action, { backgroundColor: colors.card, borderColor: colors.destructive, opacity: pressed ? 0.75 : 1 }]}
          >
            {reportMutation.isPending ? <ActivityIndicator color={colors.destructive} /> : <Feather name="alert-triangle" size={18} color={colors.destructive} />}
            <Text style={[styles.actionText, { color: colors.foreground }]}>Unsafe here</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit trusted contacts"
          onPress={() => setContactsOpen(true)}
          style={({ pressed }) => [styles.action, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
        >
          <Feather name="users" size={18} color={colors.primary} />
          <Text style={[styles.actionText, { color: colors.foreground }]}>Safety setup</Text>
        </Pressable>
        {isRunning ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share SOS location"
            onPress={() => setConfirmation('sos')}
            style={({ pressed }) => [styles.action, { backgroundColor: colors.destructive, borderColor: colors.destructive, opacity: pressed ? 0.75 : 1 }]}
          >
            <Feather name="send" size={18} color={colors.destructiveForeground} />
            <Text style={[styles.actionText, { color: colors.destructiveForeground }]}>SOS share</Text>
          </Pressable>
        ) : null}
      </View>
      {notice ? (
        <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.noticeText, { color: colors.foreground }]}>{notice}</Text>
          <Pressable accessibilityLabel="Dismiss safety notice" onPress={() => setNotice(null)}>
            <Feather name="x" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>
      ) : null}
      <Modal visible={contactsOpen} transparent animationType="slide" onRequestClose={() => setContactsOpen(false)}>
        <View style={styles.scrim}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
            bottomOffset={32}
          >
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.modalEyebrow, { color: colors.primary }]}>ON-DEVICE ONLY</Text>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Trusted contacts</Text>
              <Text style={[styles.modalCopy, { color: colors.mutedForeground }]}>
                Save up to two people. HexRunner opens a prefilled SMS; you review and send it yourself.
              </Text>
              {drafts.map((contact, index) => (
                <View key={index} style={styles.contactBlock}>
                  <TextInput
                    value={contact.name}
                    onChangeText={(name) => setDrafts((items) => items.map((item, i) => i === index ? { ...item, name } : item))}
                    placeholder={`Contact ${index + 1} name`}
                    placeholderTextColor={colors.mutedForeground}
                    maxLength={50}
                    style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                  />
                  <TextInput
                    value={contact.phone}
                    onChangeText={(phone) => setDrafts((items) => items.map((item, i) => i === index ? { ...item, phone } : item))}
                    placeholder="Phone number"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="phone-pad"
                    maxLength={25}
                    style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                  />
                </View>
              ))}
              <View style={styles.modalActions}>
                <Pressable onPress={() => setContactsOpen(false)} style={[styles.modalButton, { borderColor: colors.border }]}>
                  <Text style={[styles.modalButtonText, { color: colors.foreground }]}>Cancel</Text>
                </Pressable>
                <Pressable onPress={() => void saveContacts()} style={[styles.modalButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  <Text style={[styles.modalButtonText, { color: colors.primaryForeground }]}>Save locally</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>
      <Modal visible={confirmation !== null} transparent animationType="fade" onRequestClose={() => setConfirmation(null)}>
        <View style={[styles.scrim, styles.confirmScrim]}>
          <View style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: confirmation === 'sos' ? colors.destructive : colors.border }]}>
            <Feather name={confirmation === 'sos' ? 'send' : 'alert-triangle'} size={28} color={colors.destructive} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {confirmation === 'sos' ? 'Share SOS location?' : 'Felt unsafe here?'}
            </Text>
            <Text style={[styles.modalCopy, { color: colors.mutedForeground }]}>
              {confirmation === 'sos'
                ? `HexRunner will open a timestamped message for ${contacts.length || 'your'} trusted contact${contacts.length === 1 ? '' : 's'}. Review it before sending. This does not call emergency services.`
                : 'This submits one anonymous, coarse-area signal. Your exact route is never shown publicly.'}
            </Text>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setConfirmation(null)} style={[styles.modalButton, { borderColor: colors.border }]}>
                <Text style={[styles.modalButtonText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const action = confirmation;
                  setConfirmation(null);
                  if (action === 'sos') void launchSos();
                  else void submitUnsafeReport();
                }}
                style={[styles.modalButton, { backgroundColor: colors.destructive, borderColor: colors.destructive }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.destructiveForeground }]}>
                  {confirmation === 'sos' ? 'Open message' : 'Submit signal'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13 },
  actionText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 10 },
  noticeText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  scrim: { flex: 1, backgroundColor: 'rgba(3, 8, 12, 0.88)' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  modalCard: { borderWidth: 1, borderRadius: 22, padding: 20 },
  modalEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 25, marginTop: 5 },
  modalCopy: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 16 },
  contactBlock: { gap: 8, marginBottom: 12 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontFamily: 'Inter_500Medium', fontSize: 15 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 13 },
  modalButtonText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  confirmScrim: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  confirmCard: { width: '100%', maxWidth: 420, borderWidth: 1, borderRadius: 22, padding: 20 },
});