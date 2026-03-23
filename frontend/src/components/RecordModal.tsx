import { useState } from 'react';
import type { MoodRecord } from '../types';
import { api } from '../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onRecordCreated: (record: MoodRecord) => void;
}

type ModalState = 'input' | 'loading' | 'result' | 'crisis';

export default function RecordModal({ isOpen, onClose, onRecordCreated }: Props) {
  const [state, setState] = useState<ModalState>('input');
  const [text, setText] = useState('');
  const [record, setRecord] = useState<MoodRecord | null>(null);
  const [editActivity, setEditActivity] = useState('');
  const [editThought, setEditThought] = useState('');
  const [editIntensity, setEditIntensity] = useState(5);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'text' | 'voice'>('text');

  const reset = () => {
    setState('input');
    setText('');
    setRecord(null);
    setEditActivity('');
    setEditThought('');
    setEditIntensity(5);
    setError('');
    setActiveTab('text');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setState('loading');
    setError('');
    try {
      const rec = await api.submitRecord(text.trim());
      setRecord(rec);
      setEditActivity(rec.activity);
      setEditThought(rec.thought);
      setEditIntensity(rec.emotion_intensity);
      if (rec.risk_level === 'crisis') {
        setState('crisis');
      } else {
        setState('result');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请重试');
      setState('input');
    }
  };

  const handleConfirm = async () => {
    if (!record) return;
    try {
      const updated = await api.confirmRecord(record.id, {
        activity: editActivity,
        thought: editThought,
        emotion_intensity: editIntensity,
      });
      onRecordCreated(updated);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '确认失败，请重试');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className={`relative w-full max-w-md mx-auto min-h-[80vh] sm:min-h-0 sm:max-h-[90vh] rounded-t-3xl sm:rounded-3xl overflow-y-auto transition-all duration-300 ${
        state === 'crisis' ? 'bg-red-50' : 'bg-white'
      }`}>
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors z-10"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>

        {/* Input state */}
        {state === 'input' && (
          <div className="p-6 pt-8">
            {/* Tabs */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setActiveTab('text')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  activeTab === 'text'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                文字
              </button>
              <button
                onClick={() => setActiveTab('voice')}
                className="px-4 py-2 rounded-full text-sm font-medium bg-gray-100 text-gray-400 cursor-not-allowed relative"
                disabled
              >
                语音
                <span className="absolute -top-2 -right-2 bg-gray-300 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  即将开放
                </span>
              </button>
            </div>

            {/* Text input */}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="说说今天发生了什么，你的感受和想法..."
              className="w-full h-48 p-4 border border-gray-200 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent text-gray-700 placeholder-gray-400 transition-all duration-300"
            />

            {error && (
              <p className="mt-2 text-sm text-red-500">{error}</p>
            )}

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={!text.trim()}
              className="mt-6 w-full py-3.5 rounded-full bg-orange-500 text-white font-medium text-lg shadow-md hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-300"
            >
              记录心情
            </button>
          </div>
        )}

        {/* Loading state */}
        {state === 'loading' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] p-6">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full bg-orange-200 animate-ping opacity-30" />
              <div className="absolute inset-2 rounded-full bg-orange-300 animate-ping opacity-40 [animation-delay:0.3s]" />
              <div className="absolute inset-4 rounded-full bg-orange-400 animate-pulse" />
            </div>
            <p className="mt-6 text-lg text-gray-600 font-medium">小暖正在倾听...</p>
          </div>
        )}

        {/* Result state */}
        {state === 'result' && record && (
          <div className="p-6 pt-8">
            <h2 className="text-xl font-bold text-gray-800 mb-6">确认记录</h2>

            {/* High risk warning */}
            {record.risk_level === 'high' && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-2xl">
                <p className="text-yellow-800 text-sm font-medium mb-1">我们注意到你可能正在经历一些困难</p>
                <p className="text-yellow-700 text-sm">如果你需要帮助，请联系：</p>
                <p className="text-yellow-800 text-sm font-bold mt-1">全国心理援助热线：400-161-9995</p>
              </div>
            )}

            {/* Editable fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">活动</label>
                <input
                  type="text"
                  value={editActivity}
                  onChange={(e) => setEditActivity(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-300 text-gray-700 transition-all duration-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">想法</label>
                <input
                  type="text"
                  value={editThought}
                  onChange={(e) => setEditThought(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-300 text-gray-700 transition-all duration-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">情绪</label>
                <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-700">
                  {record.emotion_type}
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  强度: <span className="text-orange-500 font-bold">{editIntensity}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={editIntensity}
                  onChange={(e) => setEditIntensity(Number(e.target.value))}
                  className="w-full accent-orange-500"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>1 轻微</span>
                  <span>10 强烈</span>
                </div>
              </div>
            </div>

            {/* AI feedback preview */}
            <div className="mt-4 p-4 bg-orange-50 rounded-2xl">
              <p className="text-sm text-gray-600 italic">"{record.ai_immediate_feedback}"</p>
            </div>

            {error && (
              <p className="mt-2 text-sm text-red-500">{error}</p>
            )}

            <button
              onClick={handleConfirm}
              className="mt-6 w-full py-3.5 rounded-full bg-orange-500 text-white font-medium text-lg shadow-md hover:bg-orange-600 transition-all duration-300"
            >
              确认
            </button>
          </div>
        )}

        {/* Crisis state */}
        {state === 'crisis' && (
          <div className="p-6 pt-12 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-red-800 mb-4">我们很关心你的安全</h2>

            <div className="space-y-3 mb-6">
              <div className="p-4 bg-white rounded-2xl shadow-sm">
                <p className="text-sm text-gray-500">全国心理援助热线</p>
                <p className="text-xl font-bold text-red-600">400-161-9995</p>
              </div>
              <div className="p-4 bg-white rounded-2xl shadow-sm">
                <p className="text-sm text-gray-500">北京心理危机研究与干预中心</p>
                <p className="text-xl font-bold text-red-600">010-82951332</p>
              </div>
              <div className="p-4 bg-white rounded-2xl shadow-sm">
                <p className="text-sm text-gray-500">生命热线</p>
                <p className="text-xl font-bold text-red-600">400-821-1215</p>
              </div>
            </div>

            <p className="text-red-700 text-sm mb-8">
              如果你正处于危险中，请立即拨打 120 或联系身边信任的人
            </p>

            <button
              onClick={handleClose}
              className="w-full py-3.5 rounded-full bg-red-500 text-white font-medium text-lg shadow-md hover:bg-red-600 transition-all duration-300"
            >
              我知道了
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
