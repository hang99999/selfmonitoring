import { useState, useEffect } from 'react';
import { api } from '../api';
import type { LifeDomain, Value, Activity } from '../types';

type Tab = 'library' | 'plan';

export default function Activities() {
  const [tab, setTab] = useState<Tab>('library');
  const [domains, setDomains] = useState<LifeDomain[]>([]);
  const [values, setValues] = useState<Value[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<LifeDomain | null>(null);
  const [selectedValue, setSelectedValue] = useState<Value | null>(null);
  const [loading, setLoading] = useState(false);

  // 新建状态
  const [newValueText, setNewValueText] = useState('');
  const [newActivityName, setNewActivityName] = useState('');
  const [showValueForm, setShowValueForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);

  useEffect(() => {
    loadDomains();
  }, []);

  useEffect(() => {
    if (selectedDomain) loadValues(selectedDomain.id);
    else setValues([]);
  }, [selectedDomain]);

  useEffect(() => {
    if (selectedValue) loadActivities(selectedValue.id);
    else if (selectedDomain) loadActivities(undefined, selectedDomain.id);
    else setActivities([]);
  }, [selectedValue, selectedDomain]);

  async function loadDomains() {
    setLoading(true);
    try {
      const data = await api.getDomains();
      setDomains(data);
    } finally {
      setLoading(false);
    }
  }

  async function loadValues(domainId: string) {
    const data = await api.getValues('default_user', domainId);
    setValues(data);
    setSelectedValue(null);
  }

  async function loadActivities(valueId?: string, domainId?: string) {
    const data = await api.getActivities('default_user', domainId, valueId);
    setActivities(data);
  }

  async function handleAddValue() {
    if (!newValueText.trim() || !selectedDomain) return;
    await api.createValue(selectedDomain.id, newValueText.trim());
    setNewValueText('');
    setShowValueForm(false);
    loadValues(selectedDomain.id);
  }

  async function handleDeleteValue(valueId: string) {
    await api.deleteValue(valueId);
    loadValues(selectedDomain!.id);
  }

  async function handleAddActivity() {
    if (!newActivityName.trim()) return;
    await api.createActivity({
      name: newActivityName.trim(),
      value_id: selectedValue?.id,
      life_domain_id: selectedDomain?.id,
    });
    setNewActivityName('');
    setShowActivityForm(false);
    if (selectedValue) loadActivities(selectedValue.id);
    else if (selectedDomain) loadActivities(undefined, selectedDomain.id);
  }

  async function handleDeleteActivity(activityId: string) {
    await api.deleteActivity(activityId);
    if (selectedValue) loadActivities(selectedValue.id);
    else if (selectedDomain) loadActivities(undefined, selectedDomain.id);
  }

  const domainColors: Record<string, string> = {
    '亲密关系': 'bg-pink-100 text-pink-700 border-pink-200',
    '教育与职业': 'bg-blue-100 text-blue-700 border-blue-200',
    '休闲兴趣': 'bg-yellow-100 text-yellow-700 border-yellow-200',
    '身心灵': 'bg-green-100 text-green-700 border-green-200',
    '日常责任': 'bg-purple-100 text-purple-700 border-purple-200',
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">价值观与活动库</h1>
      <p className="text-sm text-gray-500 mb-5">建立你的行为激活计划基础</p>

      {/* 生活领域 */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">生活领域</h2>
        {loading ? (
          <div className="text-center py-4 text-gray-400 text-sm">加载中...</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  setSelectedDomain(selectedDomain?.id === d.id ? null : d);
                  setSelectedValue(null);
                }}
                className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
                  selectedDomain?.id === d.id
                    ? (domainColors[d.name] || 'bg-orange-100 text-orange-700 border-orange-200')
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {d.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 价值观（选中领域后展示） */}
      {selectedDomain && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                {selectedDomain.name} · 价值观
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">在这个领域，你理想的生活方式是？</p>
            </div>
            <button
              onClick={() => setShowValueForm(!showValueForm)}
              className="text-orange-500 text-sm font-medium hover:text-orange-600"
            >
              + 添加
            </button>
          </div>

          {showValueForm && (
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newValueText}
                onChange={(e) => setNewValueText(e.target.value)}
                placeholder="例如：做一个关心家人的人"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-300"
                onKeyDown={(e) => e.key === 'Enter' && handleAddValue()}
              />
              <button
                onClick={handleAddValue}
                disabled={!newValueText.trim()}
                className="px-4 py-2 bg-orange-500 text-white text-sm rounded-xl disabled:opacity-50"
              >
                确定
              </button>
            </div>
          )}

          {values.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">还没有价值观，点击"添加"来描述你的理想生活方式</p>
          ) : (
            <div className="space-y-2">
              {values.map((v) => (
                <div
                  key={v.id}
                  onClick={() => setSelectedValue(selectedValue?.id === v.id ? null : v)}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer border transition-all duration-200 ${
                    selectedValue?.id === v.id
                      ? 'bg-orange-50 border-orange-200'
                      : 'bg-white border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-orange-400 text-sm">◆</span>
                    <span className="text-sm text-gray-700 truncate">{v.content}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteValue(v.id); }}
                    className="text-gray-300 hover:text-red-400 ml-2 text-xs"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 活动库（选中领域后展示） */}
      {selectedDomain && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                {selectedValue ? `"${selectedValue.content}" · ` : `${selectedDomain.name} · `}活动
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">具体可执行的最小行为单元</p>
            </div>
            <button
              onClick={() => setShowActivityForm(!showActivityForm)}
              className="text-orange-500 text-sm font-medium hover:text-orange-600"
            >
              + 添加
            </button>
          </div>

          {showActivityForm && (
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newActivityName}
                onChange={(e) => setNewActivityName(e.target.value)}
                placeholder="例如：每周二晚陪妈妈打一通电话"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-300"
                onKeyDown={(e) => e.key === 'Enter' && handleAddActivity()}
              />
              <button
                onClick={handleAddActivity}
                disabled={!newActivityName.trim()}
                className="px-4 py-2 bg-orange-500 text-white text-sm rounded-xl disabled:opacity-50"
              >
                确定
              </button>
            </div>
          )}

          {activities.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">
              {selectedValue ? '在这个价值观下还没有活动' : '在这个领域还没有活动'}，点击"添加"创建
            </p>
          ) : (
            <div className="space-y-2">
              {activities.map((a, idx) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-100"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {a.difficulty_rank && (
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-xs font-bold flex items-center justify-center">
                        {a.difficulty_rank}
                      </span>
                    )}
                    <span className="text-sm text-gray-700 truncate">{a.name}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteActivity(a.id)}
                    className="text-gray-300 hover:text-red-400 ml-2 text-xs flex-shrink-0"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 三条活动质量提示 */}
          {showActivityForm && (
            <div className="mt-4 p-4 bg-blue-50 rounded-xl">
              <p className="text-xs font-semibold text-blue-700 mb-2">好的活动应该是：</p>
              <ul className="text-xs text-blue-600 space-y-1">
                <li>✓ <strong>可观察</strong>：他人能看到你在做这件事</li>
                <li>✓ <strong>可测量</strong>：能明确知道是否完成了</li>
                <li>✓ <strong>最小单元</strong>：不需要额外步骤，直接就能开始做</li>
              </ul>
            </div>
          )}
        </section>
      )}

      {/* 未选中领域时的引导 */}
      {!selectedDomain && !loading && (
        <div className="text-center py-10 text-gray-400">
          <p className="text-4xl mb-3">🎯</p>
          <p className="text-sm">选择一个生活领域</p>
          <p className="text-xs mt-1">开始建立你的价值观与活动体系</p>
        </div>
      )}
    </div>
  );
}
