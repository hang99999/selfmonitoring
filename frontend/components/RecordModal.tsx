import { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { api, isAiAccessRequiredError } from '../src/api';
import { translateDomainName, useLanguage } from '../src/i18n';
import type { MoodRecord, LifeDomain } from '../src/types';
import VoiceRecordButton from './VoiceRecordButton';

// Fixed domain list (names match DEFAULT_LIFE_DOMAINS on backend)
const DOMAIN_NAMES = ['亲密关系', '教育与职业', '休闲兴趣', '自我关怀', '日常责任', '其他'] as const;

interface Props {
  visible: boolean;
  onClose: () => void;
  onRecordSubmitted?: (recordId: string) => void;
  plannedActivityId?: string;
  plannedActivityName?: string;
  prefillActivity?: string;
  userId?: string;
}

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function ScoreRow({ label, value, onChange, activeColor }: {
  label: string; value: number | null; onChange: (v: number) => void; activeColor: string;
}) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-gray-600 mb-2">{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {SCORES.map(s => {
            const active = value === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => onChange(s)}
                style={{ backgroundColor: active ? activeColor : '#fff', borderColor: active ? activeColor : '#e5e7eb' }}
                className="w-10 h-10 rounded-xl items-center justify-center border"
              >
                <Text style={{ color: active ? '#fff' : '#6b7280' }} className="text-sm font-medium">{s}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function RecordModeTabs({ value, onChange }: {
  value: 'input' | 'manual';
  onChange: (value: 'input' | 'manual') => void;
}) {
  const { t } = useLanguage();
  const modes: Array<{ value: 'input' | 'manual'; label: string }> = [
    { value: 'input', label: t('freeRecord') },
    { value: 'manual', label: t('manualRecord') },
  ];
  return (
    <View className="flex-row bg-gray-100 rounded-2xl p-1 mb-5">
      {modes.map(mode => {
        const active = value === mode.value;
        return (
          <TouchableOpacity
            key={mode.value}
            onPress={() => onChange(mode.value)}
            className="flex-1 py-2.5 rounded-xl items-center"
            style={{ backgroundColor: active ? '#ffffff' : 'transparent' }}
          >
            <Text className={`text-sm font-semibold ${active ? 'text-gray-800' : 'text-gray-500'}`}>
              {mode.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function RecordModal({
  visible, onClose, onRecordSubmitted,
  plannedActivityId, plannedActivityName, prefillActivity,
  userId = 'default_user',
}: Props) {
  const { language, t } = useLanguage();
  const [step, setStep] = useState<'input' | 'manual' | 'loading' | 'result' | 'done' | 'crisis'>('input');
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [text, setText] = useState(prefillActivity ? (language === 'en' ? `Did: ${prefillActivity}` : `做了：${prefillActivity}`) : '');
  const [record, setRecord] = useState<MoodRecord | null>(null);
  const [activity, setActivity] = useState('');
  const [thought, setThought] = useState('');
  const [pleasure, setPleasure] = useState<number | null>(null);
  const [importance, setImportance] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [audioRecordId, setAudioRecordId] = useState<string | null>(null);
  // Domain selection: undefined = not loaded, null = "其他", string = domain ID
  const [domains, setDomains] = useState<LifeDomain[]>([]);
  const [selectedDomainId, setSelectedDomainId] = useState<string | null | undefined>(undefined);

  const reset = () => {
    setStep('input');
    setAiEnabled(null);
    setText(prefillActivity ? (language === 'en' ? `Did: ${prefillActivity}` : `做了：${prefillActivity}`) : '');
    setRecord(null);
    setActivity('');
    setThought('');
    setPleasure(null);
    setImportance(null);
    setError('');
    setSelectedDomainId(undefined);
    setDomains([]);
    setAudioRecordId(null);
  };

  const handleClose = () => { reset(); onClose(); };

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setError('');
    setAiEnabled(null);
    api.getUnlockStatus(userId)
      .then((status) => {
        if (cancelled) return;
        const premiumUntil = status.premium_until ? new Date(status.premium_until) : null;
        const enabled = Boolean(status.is_unlocked || (premiumUntil && premiumUntil > new Date()));
        setAiEnabled(enabled);
        if (!enabled) {
          setStep('manual');
          setActivity(plannedActivityName || prefillActivity || '');
          setThought('');
          setPleasure(null);
          setImportance(null);
          setSelectedDomainId(undefined);
        } else {
          setStep('input');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAiEnabled(false);
        setStep('manual');
        setActivity(plannedActivityName || prefillActivity || '');
      });
    api.getDomains(userId).then(setDomains).catch(() => {});
    return () => { cancelled = true; };
  }, [visible, userId, plannedActivityName, prefillActivity]);

  const handleSubmitText = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    setStep('loading');
    try {
      const rec = await api.submitRecord(text.trim(), userId, plannedActivityId, undefined, audioRecordId ?? undefined);
      setRecord(rec);
      setActivity(rec.activity || '');
      setThought(rec.thought || '');
      setPleasure(rec.pleasure_score ?? 5);
      setImportance(rec.importance_score ?? 5);
      // Pre-fill domain from LLM suggestion (undefined life_domain_id → "其他" = null)
      setSelectedDomainId(rec.life_domain_id ?? null);
      // Fetch domain list for the selector
      api.getDomains(userId).then(setDomains).catch(() => {});
      if (rec.risk_level === 'crisis') {
        setStep('crisis');
      } else {
        setStep('result');
      }
    } catch (error) {
      setError(isAiAccessRequiredError(error) ? t('aiRecordAccessMessage') : t('submitFailed'));
      setStep('input');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (!record || pleasure === null || importance === null || submitting) return;
    setSubmitting(true);
    try {
      const updated = await api.confirmRecord(record.id, {
        activity,
        thought,
        pleasure_score: pleasure,
        importance_score: importance,
        life_domain_id: selectedDomainId ?? null,
      });
      setStep('done');
      onRecordSubmitted?.(updated.id);
      setTimeout(() => { handleClose(); }, 1800);
    } catch {
      setError(t('confirmFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitManual = async () => {
    if (!activity.trim() || pleasure === null || importance === null || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const saved = await api.submitManualRecord({
        user_id: userId,
        activity: activity.trim(),
        thought: thought.trim(),
        pleasure_score: pleasure,
        importance_score: importance,
        life_domain_id: selectedDomainId ?? null,
        planned_activity_id: plannedActivityId,
      });
      setStep('done');
      onRecordSubmitted?.(saved.id);
      setTimeout(() => { handleClose(); }, 1200);
    } catch {
      setError(t('saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const canDismiss = step === 'input' || step === 'manual' || step === 'result';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end"
      >
        <TouchableOpacity className="flex-1" activeOpacity={1} onPress={canDismiss ? handleClose : undefined} />

        <View className={`rounded-t-3xl px-6 pt-6 pb-10 shadow-2xl ${step === 'crisis' ? 'bg-red-50' : 'bg-white'}`}>

          {/* done */}
          {step === 'done' && (
            <View className="items-center py-10">
              <Text className="text-5xl mb-4">✅</Text>
              <Text className="text-gray-800 font-semibold text-lg">{t('recordDoneTitle')}</Text>
              <Text className="text-sm text-gray-500 mt-1">{t('recordDoneSubtitle')}</Text>
            </View>
          )}

          {/* loading */}
          {step === 'loading' && (
            <View className="items-center py-12">
              <ActivityIndicator size="large" color="#f97316" />
              <Text className="text-gray-500 mt-4 text-sm">{t('parsingRecord')}</Text>
            </View>
          )}

          {step === 'input' && aiEnabled === null && (
            <View className="items-center py-12">
              <ActivityIndicator size="large" color="#f97316" />
              <Text className="text-gray-500 mt-4 text-sm">{t('preparingRecord')}</Text>
            </View>
          )}

          {/* input */}
          {step === 'input' && aiEnabled === true && (
            <>
              <RecordModeTabs value="input" onChange={setStep} />
              <Text className="text-lg font-bold text-gray-800 mb-1">{t('freeRecord')}</Text>
              <Text className="text-sm text-gray-400 mb-4">{t('freeRecordSubtitle')}</Text>

              {plannedActivityName && (
                <View className="mb-4 px-4 py-3 bg-blue-50 rounded-xl flex-row items-center">
                  <Text className="text-blue-500 text-sm mr-2">📋</Text>
                  <Text className="text-sm text-blue-700 flex-1">
                    {t('recordingActivity')}<Text className="font-semibold">{plannedActivityName}</Text>
                  </Text>
                </View>
              )}

              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={t('freeRecordPlaceholder')}
                multiline
                style={{ minHeight: 100, textAlignVertical: 'top' }}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-800"
                placeholderTextColor="#9ca3af"
                autoFocus
              />

              {/* 语音输入 */}
              <View className="flex-row items-center mt-4 mb-1 gap-3">
                <View className="flex-1 h-px bg-gray-100" />
                <Text className="text-xs text-gray-400">{t('orUseVoice')}</Text>
                <View className="flex-1 h-px bg-gray-100" />
              </View>
              <VoiceRecordButton
                userId={userId}
                onTranscript={(transcript, id) => {
                  setText(transcript);
                  setAudioRecordId(id);
                }}
              />

              {error ? <Text className="text-red-500 text-sm mt-2">{error}</Text> : null}

              <TouchableOpacity
                onPress={handleSubmitText}
                disabled={!text.trim() || submitting}
                className="mt-4 w-full py-4 bg-orange-500 rounded-2xl items-center"
                style={{ opacity: !text.trim() ? 0.4 : 1 }}
              >
                <Text className="text-white font-semibold text-base">{t('submitRecord')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClose} className="mt-3 items-center py-2">
                <Text className="text-gray-400 text-sm">{t('cancel')}</Text>
              </TouchableOpacity>
            </>
          )}

          {/* manual */}
          {step === 'manual' && (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {aiEnabled === true && <RecordModeTabs value="manual" onChange={setStep} />}
              <Text className="text-lg font-bold text-gray-800 mb-1">{t('manualRecordTitle')}</Text>
              <Text className="text-sm text-gray-400 mb-5">
                {aiEnabled
                  ? t('manualRecordAiHint')
                  : t('manualRecordLockedHint')}
              </Text>

              {plannedActivityName && (
                <View className="mb-4 px-4 py-3 bg-blue-50 rounded-xl flex-row items-center">
                  <Text className="text-blue-500 text-sm mr-2">•</Text>
                  <Text className="text-sm text-blue-700 flex-1">
                    {t('recordingActivity')}<Text className="font-semibold">{plannedActivityName}</Text>
                  </Text>
                </View>
              )}

              <View className="mb-4">
                <Text className="text-sm font-medium text-gray-500 mb-1">{t('activity')}</Text>
                <TextInput
                  value={activity}
                  onChangeText={setActivity}
                  placeholder={t('manualActivityPlaceholder')}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-700 bg-white"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <View className="mb-5">
                <Text className="text-sm font-medium text-gray-500 mb-1">
                  {t('thought')} <Text className="text-gray-400 font-normal">{t('optional')}</Text>
                </Text>
                <TextInput
                  value={thought}
                  onChangeText={setThought}
                  placeholder={t('thoughtPlaceholder')}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-700 bg-white"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <View className="mb-5">
                <Text className="text-sm font-medium text-gray-500 mb-2">{t('lifeDomain')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {DOMAIN_NAMES.map(name => {
                    const domain = domains.find(d => d.name === name);
                    const domainId = name === '其他' ? null : (domain?.id ?? null);
                    const isSelected = selectedDomainId === domainId;
                    return (
                      <TouchableOpacity
                        key={name}
                        onPress={() => setSelectedDomainId(domainId)}
                        className="px-3 py-1.5 rounded-full border"
                        style={{
                          backgroundColor: isSelected ? '#f97316' : '#f9fafb',
                          borderColor: isSelected ? '#f97316' : '#e5e7eb',
                        }}
                      >
                        <Text style={{ color: isSelected ? '#fff' : '#6b7280' }} className="text-xs font-medium">
                          {translateDomainName(name, language)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View className="bg-gray-50 rounded-2xl p-4 mb-5">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">{t('activityRating')}</Text>
                <ScoreRow label={t('pleasureLabel')} value={pleasure} onChange={setPleasure} activeColor="#f97316" />
                <ScoreRow label={t('importanceLabel')} value={importance} onChange={setImportance} activeColor="#6366f1" />
              </View>

              {error ? <Text className="text-red-500 text-sm mb-3">{error}</Text> : null}

              <TouchableOpacity
                onPress={handleSubmitManual}
                disabled={!activity.trim() || pleasure === null || importance === null || submitting}
                className="w-full py-4 bg-orange-500 rounded-2xl items-center mb-2"
                style={{ opacity: !activity.trim() || pleasure === null || importance === null ? 0.4 : 1 }}
              >
                {submitting
                  ? <ActivityIndicator color="white" />
                  : <Text className="text-white font-semibold text-base">{t('saveRecord')}</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClose} className="items-center py-2">
                <Text className="text-gray-400 text-sm">{t('cancel')}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* result */}
          {step === 'result' && record && (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text className="text-lg font-bold text-gray-800 mb-1">{t('confirmRecord')}</Text>
              <Text className="text-sm text-gray-400 mb-5">{t('confirmRecordSubtitle')}</Text>

              {record.risk_level === 'high' && (
                <View className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-2xl">
                  <Text className="text-yellow-800 text-sm font-semibold mb-1">{t('highRiskTitle')}</Text>
                  <Text className="text-yellow-700 text-sm">{t('highRiskHelp')}</Text>
                </View>
              )}

              <View className="mb-4">
                <Text className="text-sm font-medium text-gray-500 mb-1">{t('activity')}</Text>
                <TextInput
                  value={activity}
                  onChangeText={setActivity}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-700 bg-white"
                />
              </View>

              <View className="mb-5">
                <Text className="text-sm font-medium text-gray-500 mb-1">
                  {t('thought')} <Text className="text-gray-400 font-normal">{t('optional')}</Text>
                </Text>
                <TextInput
                  value={thought}
                  onChangeText={setThought}
                  placeholder={t('thoughtPlaceholder')}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-700 bg-white"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              {/* Domain selector */}
              <View className="mb-5">
                <Text className="text-sm font-medium text-gray-500 mb-2">{t('lifeDomain')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {DOMAIN_NAMES.map(name => {
                    const domain = domains.find(d => d.name === name);
                    const domainId = name === '其他' ? null : (domain?.id ?? null);
                    const isSelected = selectedDomainId === domainId;
                    return (
                      <TouchableOpacity
                        key={name}
                        onPress={() => setSelectedDomainId(domainId)}
                        className="px-3 py-1.5 rounded-full border"
                        style={{
                          backgroundColor: isSelected ? '#f97316' : '#f9fafb',
                          borderColor: isSelected ? '#f97316' : '#e5e7eb',
                        }}
                      >
                        <Text style={{ color: isSelected ? '#fff' : '#6b7280' }} className="text-xs font-medium">
                          {translateDomainName(name, language)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View className="bg-gray-50 rounded-2xl p-4 mb-5">
                <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">{t('activityRating')}</Text>
                <ScoreRow label={t('pleasureLabel')} value={pleasure} onChange={setPleasure} activeColor="#f97316" />
                <ScoreRow label={t('importanceLabel')} value={importance} onChange={setImportance} activeColor="#6366f1" />
              </View>

              <View className="px-4 py-3 bg-orange-50 rounded-2xl flex-row items-center mb-5">
                <Text className="text-lg mr-2">💬</Text>
                <Text className="text-sm text-gray-500 flex-1">{t('confirmFeedbackHint')}</Text>
              </View>

              {error ? <Text className="text-red-500 text-sm mb-3">{error}</Text> : null}

              <TouchableOpacity
                onPress={handleConfirm}
                disabled={pleasure === null || importance === null || submitting}
                className="w-full py-4 bg-orange-500 rounded-2xl items-center mb-2"
                style={{ opacity: pleasure === null || importance === null ? 0.4 : 1 }}
              >
                {submitting
                  ? <ActivityIndicator color="white" />
                  : <Text className="text-white font-semibold text-base">{t('confirmRecord')}</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* crisis */}
          {step === 'crisis' && (
            <View className="items-center pt-4">
              <Text className="text-4xl mb-4">❤️</Text>
              <Text className="text-xl font-bold text-red-800 mb-2 text-center">{t('crisisTitle')}</Text>
              <Text className="text-sm text-red-600 mb-5 text-center">{t('highRiskHelp')}</Text>
              {[
                [language === 'en' ? 'National mental health support hotline' : '全国统一心理援助热线', '12356'],
                [language === 'en' ? 'Beijing crisis hotline' : '北京危机热线', '010-82951332'],
                [language === 'en' ? 'Hope 24 hotline' : '希望24热线', '400-161-9995'],
                [language === 'en' ? 'Lifeline China (10 AM-10 PM)' : 'Lifeline China（10:00-22:00）', '400-821-1215'],
              ].map(([label, num]) => (
                <TouchableOpacity
                  key={num}
                  onPress={() => Linking.openURL(`tel:${num}`)}
                  className="w-full bg-white rounded-2xl p-4 mb-2 shadow-sm"
                >
                  <Text className="text-xs text-gray-400">{label}</Text>
                  <Text className="text-xl font-bold text-red-600 mt-1">{num}</Text>
                </TouchableOpacity>
              ))}
              <Text className="text-xs text-red-500 text-center mt-3 mb-5">
                {t('crisisEmergency')}
              </Text>
              <TouchableOpacity onPress={handleClose} className="w-full py-4 bg-red-500 rounded-2xl items-center">
                <Text className="text-white font-semibold">{t('crisisAcknowledge')}</Text>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
