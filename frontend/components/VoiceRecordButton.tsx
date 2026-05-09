import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Text, TouchableOpacity, View } from 'react-native';
import { useAudioRecorder, RecordingPresets, usePermissions } from 'expo-audio';

// 阿里云 NLS 一句话识别要求 16K 单声道 AAC
const PRESET_16K_MONO = {
  ...RecordingPresets.HIGH_QUALITY,
  android: { ...RecordingPresets.HIGH_QUALITY.android, sampleRate: 16000, numberOfChannels: 1, bitRate: 32000 },
  ios:     { ...RecordingPresets.HIGH_QUALITY.ios,     sampleRate: 16000, numberOfChannels: 1, bitRate: 32000 },
};
import { api } from '../src/api';

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
  const [state, setState] = useState<RecordState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [permissionStatus, requestPermission] = usePermissions();
  const audioRecorder = useAudioRecorder(PRESET_16K_MONO);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (state === 'recording') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 550, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 550, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
      if (timerRef.current) clearInterval(timerRef.current);
      if (state !== 'transcribing') setSeconds(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state]);

  const handlePress = async () => {
    if (state === 'idle') {
      if (permissionStatus?.status !== 'granted') {
        const result = await requestPermission();
        if (result.status !== 'granted') {
          setErrorMsg('需要麦克风权限才能录音');
          setState('error');
          return;
        }
      }
      setErrorMsg('');
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setState('recording');

    } else if (state === 'recording') {
      setState('transcribing');
      await audioRecorder.stop();
      const uri = audioRecorder.uri;

      if (!uri) {
        setErrorMsg('录音失败，请重试');
        setState('error');
        return;
      }

      try {
        const result = await api.uploadAudio(uri, userId);
        if (result.whisper_error) {
          // 音频已保存，但转写失败
          setErrorMsg(`转写失败：${result.whisper_error}`);
          setState('error');
        } else {
          onTranscript(result.transcript, result.audio_record_id);
          setState('idle');
        }
      } catch {
        setErrorMsg('上传失败，请检查网络后重试');
        setState('error');
      }

    } else if (state === 'error') {
      setState('idle');
      setErrorMsg('');
    }
  };

  if (state === 'transcribing') {
    return (
      <View className="items-center py-3">
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color="#f97316" />
          <Text className="text-sm text-gray-500">语音转写中…</Text>
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
          <Text className="text-2xl">
            {state === 'recording' ? '⏹' : state === 'error' ? '🔄' : '🎙️'}
          </Text>
        </Animated.View>

        {state === 'recording' && (
          <Text className="text-sm text-red-500 mt-1.5 font-medium tabular-nums">
            {formatTime(seconds)}
          </Text>
        )}
        {state === 'idle' && (
          <Text className="text-xs text-gray-400 mt-1.5">语音输入</Text>
        )}
        {state === 'error' && (
          <Text className="text-xs text-orange-500 mt-1.5">点击重试</Text>
        )}
      </TouchableOpacity>

      {errorMsg ? (
        <Text className="text-xs text-red-400 mt-1 text-center px-4">{errorMsg}</Text>
      ) : null}
    </View>
  );
}
