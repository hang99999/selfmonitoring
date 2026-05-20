import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Text, TouchableOpacity, View } from 'react-native';
import {
  AudioQuality,
  getRecordingPermissionsAsync,
  IOSOutputFormat,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { api, isAiAccessRequiredError } from '../src/api';
import { useLanguage } from '../src/i18n';

const IOS_WAV_PRESET = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
  },
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    bitDepthHint: 16,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

const ANDROID_AAC_PRESET = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    extension: '.m4a',
    outputFormat: 'mpeg4' as const,
    audioEncoder: 'aac' as const,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
  },
};

const RECORDING_PRESET = Platform.OS === 'android' ? ANDROID_AAC_PRESET : IOS_WAV_PRESET;

type RecordState = 'idle' | 'recording' | 'transcribing' | 'error';

interface Props {
  userId: string;
  onTranscript: (text: string, audioRecordId: string) => void;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function VoiceRecordButton({ userId, onTranscript }: Props) {
  const { t } = useLanguage();
  const [state, setState] = useState<RecordState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const audioRecorder = useAudioRecorder(RECORDING_PRESET);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (state === 'recording') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 550, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 550, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current.start();
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
      if (timerRef.current) clearInterval(timerRef.current);
      if (state !== 'transcribing') setSeconds(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pulseAnim, state]);

  const ensureRecordingPermission = async () => {
    const current = await getRecordingPermissionsAsync();
    if (current.granted) return true;

    const requested = await requestRecordingPermissionsAsync();
    return requested.granted;
  };

  const startRecording = async () => {
    const hasPermission = await ensureRecordingPermission();
    if (!hasPermission) {
      setErrorMsg(t('microphonePermission'));
      setState('error');
      return;
    }

    setErrorMsg('');
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
    setState('recording');
  };

  const stopAndTranscribe = async () => {
    setState('transcribing');
    await audioRecorder.stop();
    const uri = audioRecorder.uri;

    if (!uri) {
      setErrorMsg(t('recordingFailed'));
      setState('error');
      return;
    }

    try {
      const result = await api.uploadAudio(uri, userId);
      if (result.whisper_error) {
        setErrorMsg(`${t('transcriptionFailed')}${result.whisper_error}`);
        setState('error');
        return;
      }

      if (!result.transcript.trim()) {
        setErrorMsg(t('noSpeechDetected'));
        setState('error');
        return;
      }

      onTranscript(result.transcript, result.audio_record_id);
      setState('idle');
    } catch (error) {
      const message = isAiAccessRequiredError(error)
        ? t('voiceAccessMessage')
        : error instanceof Error ? error.message : t('unknownError');
      setErrorMsg(`${t('uploadFailed')}${message}`);
      setState('error');
    }
  };

  const handlePress = async () => {
    try {
      if (state === 'idle') {
        await startRecording();
      } else if (state === 'recording') {
        await stopAndTranscribe();
      } else if (state === 'error') {
        setState('idle');
        setErrorMsg('');
      }
    } catch {
      setErrorMsg(t('recordingError'));
      setState('error');
    }
  };

  if (state === 'transcribing') {
    return (
      <View className="items-center py-3">
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color="#f97316" />
          <Text className="text-sm text-gray-500">{t('transcribingVoice')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="items-center mt-2">
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8} className="items-center">
        <Animated.View
          style={{ transform: [{ scale: pulseAnim }] }}
          className={`w-14 h-14 rounded-full items-center justify-center ${
            state === 'recording' ? 'bg-red-500' : 'bg-gray-100'
          }`}
        >
          <Text className="text-2xl">{state === 'recording' ? '■' : state === 'error' ? '!' : '🎙️'}</Text>
        </Animated.View>

        {state === 'recording' && (
          <Text className="text-sm text-red-500 mt-1.5 font-medium tabular-nums">
            {formatTime(seconds)}
          </Text>
        )}
        {state === 'idle' && <Text className="text-xs text-gray-400 mt-1.5">{t('voiceInput')}</Text>}
        {state === 'error' && <Text className="text-xs text-orange-500 mt-1.5">{t('tapRetry')}</Text>}
      </TouchableOpacity>

      {errorMsg ? <Text className="text-xs text-red-400 mt-1 text-center px-4">{errorMsg}</Text> : null}
    </View>
  );
}
