import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  createCivicReport,
  requestCivicPhotoUpload,
  type CivicCategory,
  type CivicPhotoUploadRequestContentType,
  type CivicPhotoUploadResult,
  type CreateCivicReportRequest,
} from '@workspace/api-client-react';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { pointToSafetyArea } from '@/src/services/hexEngine';
import {
  flushPendingCivicReports,
  queueCivicReport,
  removePendingCivicReport,
} from '@/src/services/civicStorage';

type CivicPoint = { lat: number; lng: number; timestamp: number };
type FormStatus =
  | 'idle'
  | 'picking'
  | 'uploading'
  | 'submitting'
  | 'success'
  | 'error';

const CATEGORIES: Array<{
  value: CivicCategory;
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
}> = [
  { value: 'pothole', label: 'Pothole', icon: 'alert-circle' },
  { value: 'garbage', label: 'Garbage', icon: 'trash-2' },
  {
    value: 'broken_streetlight',
    label: 'Broken streetlight',
    icon: 'zap-off',
  },
];

const ALLOWED_CONTENT_TYPES = new Set<CivicPhotoUploadRequestContentType>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function createClientReportId(): string {
  return `civic_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

function contentTypeForAsset(
  asset: ImagePicker.ImagePickerAsset,
  blob: Blob,
): CivicPhotoUploadRequestContentType | null {
  const reportedType = (asset.mimeType || blob.type).toLowerCase();
  if (
    ALLOWED_CONTENT_TYPES.has(
      reportedType as CivicPhotoUploadRequestContentType,
    )
  ) {
    return reportedType as CivicPhotoUploadRequestContentType;
  }

  const uri = asset.uri.toLowerCase().split('?')[0];
  if (uri.endsWith('.jpg') || uri.endsWith('.jpeg')) return 'image/jpeg';
  if (uri.endsWith('.png')) return 'image/png';
  if (uri.endsWith('.webp')) return 'image/webp';
  return null;
}

export default function CivicReportTools({
  currentPoint,
  clientRunId,
}: {
  currentPoint: CivicPoint | null;
  clientRunId: string | null;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CivicCategory>('pothole');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [note, setNote] = useState('');
  const [consented, setConsented] = useState(false);
  const [status, setStatus] = useState<FormStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const clientReportIdRef = useRef<string | null>(null);
  const uploadGrantRef = useRef<CivicPhotoUploadResult | null>(null);
  const uploadedDraftRef = useRef<CreateCivicReportRequest | null>(null);

  useEffect(() => {
    void flushPendingCivicReports();
  }, []);

  const busy =
    status === 'picking' ||
    status === 'uploading' ||
    status === 'submitting';

  const resetForm = () => {
    clientReportIdRef.current = null;
    uploadGrantRef.current = null;
    uploadedDraftRef.current = null;
    setCategory('pothole');
    setPhoto(null);
    setNote('');
    setConsented(false);
    setStatus('idle');
    setMessage(null);
  };

  const closeModal = () => {
    if (busy) return;
    setOpen(false);
    resetForm();
  };

  const pickPhoto = async () => {
    setStatus('picking');
    setMessage(null);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error(
          'Photo library access is required to attach an issue photo.',
        );
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
        exif: false,
        selectionLimit: 1,
      });
      if (!result.canceled && result.assets[0]) {
        clientReportIdRef.current = null;
        uploadGrantRef.current = null;
        uploadedDraftRef.current = null;
        setPhoto(result.assets[0]);
      }
      setStatus('idle');
    } catch (error: unknown) {
      setStatus('error');
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not open the photo picker. Please try again.',
      );
    }
  };

  const submitReport = async () => {
    if (!currentPoint) {
      setStatus('error');
      setMessage(
        'GPS is not ready. Keep location permission enabled and try again.',
      );
      return;
    }
    if (!photo) {
      setStatus('error');
      setMessage('Choose a clear photo of the street issue before submitting.');
      return;
    }
    if (!consented) {
      setStatus('error');
      setMessage('Consent is required before the photo can be uploaded.');
      return;
    }
    if (!clientRunId) {
      setStatus('error');
      setMessage(
        'This report needs an active run. Keep the run open and try again.',
      );
      return;
    }

    setMessage(null);
    try {
      let draft = uploadedDraftRef.current;
      if (!draft) {
        setStatus('uploading');
        const blob = photo.file ?? (await (await fetch(photo.uri)).blob());
        const contentType = contentTypeForAsset(photo, blob);
        if (!contentType) {
          throw new Error('Please choose a JPEG, PNG, or WebP photo.');
        }
        if (blob.size < 1 || blob.size > 10 * 1024 * 1024) {
          throw new Error('The photo must be smaller than 10 MB.');
        }

        clientReportIdRef.current ??= createClientReportId();
        let upload = uploadGrantRef.current;
        if (
          !upload ||
          new Date(upload.expiresAt).getTime() <= Date.now() + 5_000
        ) {
          upload = await requestCivicPhotoUpload({
            contentType,
            sizeBytes: blob.size,
          });
          uploadGrantRef.current = upload;
        }
        const uploadResponse = await fetch(upload.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: blob,
        });
        if (!uploadResponse.ok) {
          throw new Error(
            `Photo upload failed (${uploadResponse.status}). Please try again.`,
          );
        }

        const trimmedNote = note.trim();
        draft = {
          clientReportId: clientReportIdRef.current,
          clientRunId,
          category,
          areaH3Index: pointToSafetyArea(
            currentPoint.lat,
            currentPoint.lng,
          ),
          occurredAt: new Date(currentPoint.timestamp).toISOString(),
          ...(trimmedNote ? { note: trimmedNote } : {}),
          photoObjectPath: upload.objectPath,
          consentToPublishCoarseReport: true,
        };
        await queueCivicReport(draft);
        uploadedDraftRef.current = draft;
      }

      setStatus('submitting');
      const result = await createCivicReport(draft);
      if (!result.accepted && !result.duplicate) {
        throw new Error(
          'The report is queued and will retry after this run is saved.',
        );
      }
      await removePendingCivicReport(draft.clientReportId);

      setStatus('success');
      setMessage(
        result.duplicate
          ? 'Submitted. It may match an existing report and is awaiting review.'
          : 'Submitted successfully. The report is unreviewed and awaiting moderation.',
      );
    } catch (error: unknown) {
      setStatus('error');
      setMessage(
        uploadedDraftRef.current
          ? 'Report queued on this device. It will retry after this run is saved and when street issue reporting opens; you can also retry now.'
          : error instanceof Error
            ? error.message
            : 'The report could not be submitted. Please try again.',
      );
    }
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Report a street issue"
        onPress={() => {
          setOpen(true);
          void flushPendingCivicReports();
        }}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <Feather name="camera" size={16} color={colors.primary} />
        <Text style={[styles.triggerText, { color: colors.foreground }]}>
          Street issue
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.scrim}>
          <KeyboardAwareScrollViewCompat
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            bottomOffset={72}
          >
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.headingRow}>
                <View style={styles.headingCopy}>
                  <Text style={[styles.eyebrow, { color: colors.primary }]}>
                    CIVIC REPORT
                  </Text>
                  <Text style={[styles.title, { color: colors.foreground }]}>
                    Report a street issue
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close street issue form"
                  disabled={busy}
                  hitSlop={8}
                  onPress={closeModal}
                >
                  <Feather
                    name="x"
                    size={22}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              </View>

              <Text style={[styles.copy, { color: colors.mutedForeground }]}>
                Choose the issue yourself—HexRunner does not diagnose photos.
                Reports are unreviewed until moderation.
              </Text>

              <Text style={[styles.label, { color: colors.foreground }]}>
                Issue type
              </Text>
              <View style={styles.categoryRow}>
                {CATEGORIES.map((item) => {
                  const selected = category === item.value;
                  return (
                    <Pressable
                      key={item.value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      disabled={
                        busy || status === 'success' || !!uploadedDraftRef.current
                      }
                      onPress={() => setCategory(item.value)}
                      style={[
                        styles.category,
                        {
                          backgroundColor: selected
                            ? colors.accent
                            : colors.background,
                          borderColor: selected
                            ? colors.primary
                            : colors.border,
                        },
                      ]}
                    >
                      <Feather
                        name={item.icon}
                        size={17}
                        color={
                          selected ? colors.primary : colors.mutedForeground
                        }
                      />
                      <Text
                        style={[
                          styles.categoryText,
                          {
                            color: selected
                              ? colors.accentForeground
                              : colors.foreground,
                          },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: colors.foreground }]}>
                Photo (required)
              </Text>
              {photo ? (
                <View
                  style={[
                    styles.photoFrame,
                    { borderColor: colors.border, backgroundColor: colors.background },
                  ]}
                >
                  <Image
                    source={{ uri: photo.uri }}
                    resizeMode="cover"
                    style={styles.photo}
                    accessibilityLabel="Selected street issue photo"
                  />
                  <Pressable
                    disabled={
                      busy || status === 'success' || !!uploadedDraftRef.current
                    }
                    onPress={() => void pickPhoto()}
                    style={[
                      styles.replacePhoto,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <Feather name="refresh-cw" size={14} color={colors.primary} />
                    <Text style={[styles.replaceText, { color: colors.foreground }]}>
                      Replace
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  disabled={busy || status === 'success'}
                  onPress={() => void pickPhoto()}
                  style={[
                    styles.photoButton,
                    { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                >
                  {status === 'picking' ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Feather name="image" size={21} color={colors.primary} />
                  )}
                  <Text style={[styles.photoButtonText, { color: colors.foreground }]}>
                    {status === 'picking' ? 'Opening photos…' : 'Choose photo'}
                  </Text>
                </Pressable>
              )}

              <View style={styles.noteHeading}>
                <Text style={[styles.label, { color: colors.foreground }]}>
                  Note (optional)
                </Text>
                <Text style={[styles.counter, { color: colors.mutedForeground }]}>
                  {note.length}/280
                </Text>
              </View>
              <TextInput
                accessibilityLabel="Optional street issue note"
                value={note}
                onChangeText={setNote}
                editable={
                  !busy && status !== 'success' && !uploadedDraftRef.current
                }
                maxLength={280}
                multiline
                placeholder="Add factual details visible at the scene."
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.note,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
                textAlignVertical="top"
              />

              <View
                style={[
                  styles.privacy,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <Feather name="shield" size={18} color={colors.primary} />
                <Text style={[styles.privacyText, { color: colors.mutedForeground }]}>
                  The photo is uploaded to HexRunner App Storage. The report
                  uses a coarse area rather than publishing your precise
                  location. Moderators may review the photo and note.
                </Text>
              </View>

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consented }}
                disabled={
                  busy || status === 'success' || !!uploadedDraftRef.current
                }
                onPress={() => setConsented((value) => !value)}
                style={styles.consentRow}
              >
                <Feather
                  name={consented ? 'check-square' : 'square'}
                  size={22}
                  color={consented ? colors.primary : colors.mutedForeground}
                />
                <Text style={[styles.consentText, { color: colors.foreground }]}>
                  I consent to upload this photo and publish this coarse,
                  unreviewed civic report.
                </Text>
              </Pressable>

              {message ? (
                <View
                  style={[
                    styles.message,
                    {
                      backgroundColor:
                        status === 'success' ? colors.accent : colors.background,
                      borderColor:
                        status === 'success'
                          ? colors.primary
                          : colors.destructive,
                    },
                  ]}
                >
                  <Feather
                    name={status === 'success' ? 'check-circle' : 'alert-circle'}
                    size={18}
                    color={
                      status === 'success' ? colors.primary : colors.destructive
                    }
                  />
                  <Text style={[styles.messageText, { color: colors.foreground }]}>
                    {message}
                  </Text>
                </View>
              ) : null}

              <View style={styles.actions}>
                {status === 'success' ? (
                  <>
                    <Pressable
                      onPress={resetForm}
                      style={[styles.button, { borderColor: colors.border }]}
                    >
                      <Text style={[styles.buttonText, { color: colors.foreground }]}>
                        Report another
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={closeModal}
                      style={[
                        styles.button,
                        { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.buttonText,
                          { color: colors.primaryForeground },
                        ]}
                      >
                        Done
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      disabled={busy}
                      onPress={closeModal}
                      style={[styles.button, { borderColor: colors.border }]}
                    >
                      <Text style={[styles.buttonText, { color: colors.foreground }]}>
                        Cancel
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() => void submitReport()}
                      style={[
                        styles.button,
                        {
                          backgroundColor: colors.primary,
                          borderColor: colors.primary,
                          opacity: busy ? 0.65 : 1,
                        },
                      ]}
                    >
                      {status === 'uploading' || status === 'submitting' ? (
                        <ActivityIndicator
                          size="small"
                          color={colors.primaryForeground}
                        />
                      ) : (
                        <Feather
                          name="upload-cloud"
                          size={17}
                          color={colors.primaryForeground}
                        />
                      )}
                      <Text
                        style={[
                          styles.buttonText,
                          { color: colors.primaryForeground },
                        ]}
                      >
                        {status === 'uploading'
                          ? 'Uploading…'
                          : status === 'submitting'
                            ? 'Submitting…'
                            : 'Submit report'}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 38,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  triggerText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  scrim: { flex: 1, backgroundColor: 'rgba(3, 8, 12, 0.88)' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', padding: 18 },
  card: {
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 22,
    padding: 19,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headingCopy: { flex: 1 },
  eyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    marginTop: 4,
  },
  copy: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
    marginBottom: 17,
  },
  label: { fontFamily: 'Inter_700Bold', fontSize: 13, marginBottom: 8 },
  categoryRow: { flexDirection: 'row', gap: 7, marginBottom: 17 },
  category: {
    flex: 1,
    minHeight: 66,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 5,
  },
  categoryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    textAlign: 'center',
  },
  photoButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderRadius: 13,
    marginBottom: 17,
  },
  photoButtonText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  photoFrame: {
    height: 154,
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 17,
  },
  photo: { width: '100%', height: '100%' },
  replacePhoto: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  replaceText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  noteHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counter: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  note: {
    minHeight: 86,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 19,
    marginBottom: 13,
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
  },
  privacyText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 16,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 14,
  },
  consentText: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 18,
  },
  message: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
    marginBottom: 4,
  },
  messageText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 17,
  },
  actions: { flexDirection: 'row', gap: 9, marginTop: 10 },
  button: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 8,
  },
  buttonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    textAlign: 'center',
  },
});