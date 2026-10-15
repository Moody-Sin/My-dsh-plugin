import React, { useEffect, useState } from 'react';
import { NotifierCard } from './NotifierCard.tsx';
import { ModelIndicatorCard } from './ModelIndicatorCard.tsx';

export function SettingsTab() {
  /**
   * 两层配置快照，分别对应两个磁盘文件。
   *
   * **表单编辑的是「目标层自己」的内容，而不是合并视图。**
   * 曾经的实现把 `merged`（已合并 local）设为表单状态、保存时整体写回目标文件，
   * 于是选择「保存至 config.json」会把 local 层里的 Webhook 密钥一并复制进
   * 随 Git 提交的 `plugins.config.json` —— 彻底抵消 local 分层（README 明确
   * 承诺密钥不进库）的意义。改为逐层编辑后，这个泄露在结构上不可能发生。
   */
  const [layers, setLayers] = useState<{ base: any; local: any } | null>(null);
  const [config, setConfig] = useState<any>(null);
  const [target, setTarget] = useState<'local' | 'base'>('local');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [testStatus, setTestStatus] = useState<{ loading: boolean; result?: any; error?: string }>({
    loading: false,
  });

  const emptyLayer = { plugins: {} };

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/local-plugins/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      const next = {
        base: data.base || emptyLayer,
        local: data.local || emptyLayer,
      };
      setLayers(next);
      setMessage(null);
      return next;
    } catch (err: any) {
      setMessage({ text: `加载配置失败: ${err.message}`, error: true });
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 首次加载后直接把目标层灌入表单
    void fetchConfig().then((next) => {
      if (next) setConfig(next.local);
    });
  }, []);

  /** 切换目标层时同步切换表单内容，保证「所见即所写」 */
  const handleTargetChange = (next: 'local' | 'base') => {
    setTarget(next);
    setMessage(null);
    if (layers) setConfig(next === 'base' ? layers.base : layers.local);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/local-plugins/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // 提交的就是目标层自身的内容，不含另一层的任何字段
        body: JSON.stringify({ target, config }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();
      setMessage({
        text:
          data?.message ||
          `✅ 配置已保存至 ${
            target === 'local' ? 'plugins.config.local.json' : 'plugins.config.json'
          } 并即时热生效！`,
        error: data?.ok === false,
      });
      // 重新拉取以刷新两层快照（密钥为掩码）
      const next = await fetchConfig();
      if (next) setConfig(target === 'base' ? next.base : next.local);
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
      const data = await res.json().catch(() => ({}));
      // ok === false 时后端已给出具体原因（插件未启用 / 渠道失败），必须原样呈现，
      // 否则用户面对一个「看起来成功」的提示却收不到任何通知。
      if (!res.ok || data?.ok === false) {
        setTestStatus({
          loading: false,
          error: data?.message || data?.error || `HTTP ${res.status}`,
        });
        return;
      }
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
            选择要编辑的配置层，保存后无需重启 DSH 自动热生效。
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            value={target}
            onChange={(e) => handleTargetChange(e.target.value as any)}
            title="local 为私有覆盖（含 Secret，不进 Git）；base 为基础默认配置（随 Git 提交）"
            style={{
              background: 'var(--dsw-alias-bg-layer-1, #242424)',
              color: 'var(--dsw-alias-label-primary, #fff)',
              border: '0.5px solid var(--dsw-alias-border-l4, #444)',
              borderRadius: 'var(--dsw-radius-md, 6px)',
              padding: '6px 8px',
              fontSize: '12px',
            }}
          >
            <option value="local">编辑 local.json (私有，不进 Git)</option>
            <option value="base">编辑 config.json (共享提交)</option>
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
