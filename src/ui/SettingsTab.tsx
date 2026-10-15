import React, { useEffect, useState } from 'react';
import { NotifierCard } from './NotifierCard.tsx';
import { ModelIndicatorCard } from './ModelIndicatorCard.tsx';

export function SettingsTab() {
  const [config, setConfig] = useState<any>(null);
  const [target, setTarget] = useState<'local' | 'base'>('local');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [testStatus, setTestStatus] = useState<{ loading: boolean; result?: any; error?: string }>({
    loading: false,
  });

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/local-plugins/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      setConfig(data.merged || { plugins: {} });
      setMessage(null);
    } catch (err: any) {
      setMessage({ text: `加载配置失败: ${err.message}`, error: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/local-plugins/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target, config }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMessage({
        text: `✅ 配置已成功保存至 ${target === 'local' ? 'plugins.config.local.json' : 'plugins.config.json'} 并即时热生效！`,
      });
    } catch (err: any) {
      setMessage({ text: `保存失败: ${err.message}`, error: true });
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotify = async () => {
    setTestStatus({ loading: true });
    try {
      const res = await fetch('/api/local-plugins/test-notify', {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTestStatus({ loading: false, result: data });
    } catch (err: any) {
      setTestStatus({ loading: false, error: err.message });
    }
  };

  if (loading && !config) {
    return (
      <div style={{ padding: '24px', color: 'var(--dsw-alias-label-tertiary, #888)' }}>
        正在读取本地插件配置...
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxWidth: '760px',
        color: 'var(--dsw-alias-label-primary, #fff)',
        padding: '4px 0 24px 0',
      }}
    >
      {/* 顶部操作条 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          paddingBottom: '12px',
          borderBottom: '0.5px solid var(--dsw-alias-border-l2, #333)',
        }}
      >
        <div>
          <div style={{ fontSize: '18px', fontWeight: 600 }}>本地插件参数配置</div>
          <div style={{ fontSize: '13px', color: 'var(--dsw-alias-label-tertiary, #888)' }}>
            统一管理本地聚合插件的运行参数，保存后无需重启 DSH 自动热生效。
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as any)}
            title="保存位置：local 为私有覆盖（含 Secret，不进 Git）；base 为基础默认配置"
            style={{
              background: 'var(--dsw-alias-bg-layer-1, #242424)',
              color: 'var(--dsw-alias-label-primary, #fff)',
              border: '0.5px solid var(--dsw-alias-border-l4, #444)',
              borderRadius: 'var(--dsw-radius-md, 6px)',
              padding: '6px 8px',
              fontSize: '12px',
            }}
          >
            <option value="local">保存至 local.json (私有推荐)</option>
            <option value="base">保存至 config.json (共享提交)</option>
          </select>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !config}
            style={{
              background: 'var(--dsw-alias-state-business-primary, #3b82f6)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--dsw-radius-md, 6px)',
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? '保存中...' : '💾 保存更改'}
          </button>
        </div>
      </div>

      {message && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--dsw-radius-md, 6px)',
            background: message.error ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
            color: message.error ? '#f87171' : '#4ade80',
            fontSize: '13px',
          }}
        >
          {message.text}
        </div>
      )}

      {/* 插件卡片列表 */}
      <NotifierCard
        config={config}
        onChange={setConfig}
        onTestNotify={handleTestNotify}
        testStatus={testStatus}
      />

      <ModelIndicatorCard config={config} onChange={setConfig} />
    </div>
  );
}
