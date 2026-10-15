import React from 'react';

export interface ModelIndicatorCardProps {
  config: any;
  onChange: (updater: (prev: any) => any) => void;
}

export function ModelIndicatorCard({
  config,
  onChange,
}: ModelIndicatorCardProps) {
  const indicator = config?.plugins?.['subagent-model-indicator'] || {
    enabled: true,
  };

  const updateIndicator = (key: string, val: any) => {
    onChange((prev: any) => ({
      ...prev,
      plugins: {
        ...prev.plugins,
        'subagent-model-indicator': {
          ...prev.plugins?.['subagent-model-indicator'],
          [key]: val,
        },
      },
    }));
  };

  return (
    <div
      style={{
        border: '0.5px solid var(--dsw-alias-border-l3, #333)',
        borderRadius: 'var(--dsw-radius-xl, 12px)',
        background: 'var(--dsw-alias-settings-card-fill, #1a1a1a)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      {/* 头部标题与总开关 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>🏷️</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px' }}>
              子智能体模型指示器 (dsh-subagent-model-indicator)
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--dsw-alias-label-tertiary, #888)',
              }}
            >
              在子智能体对话页面头部直观展示当前模型名称与推理层级 (Reasoning
              Effort)
            </div>
          </div>
        </div>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            cursor: 'pointer',
            gap: '6px',
          }}
        >
          <input
            type="checkbox"
            checked={indicator.enabled !== false}
            onChange={(e) => updateIndicator('enabled', e.target.checked)}
          />
          <span style={{ fontSize: '13px' }}>启用指示器</span>
        </label>
      </div>

      {indicator.enabled !== false && (
        <div
          style={{
            background: 'var(--dsw-alias-bg-layer-1, #242424)',
            padding: '12px',
            borderRadius: 'var(--dsw-radius-md, 6px)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              color: 'var(--dsw-alias-label-tertiary, #aaa)',
            }}
          >
            展示效果预览：
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 8px',
              borderRadius: '9999px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '0.5px solid rgba(59, 130, 246, 0.3)',
              color: '#60a5fa',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            <span>🤖</span>
            <span>DeepSeek-V3 · high</span>
          </div>
        </div>
      )}
    </div>
  );
}
