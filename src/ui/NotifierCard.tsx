import React from 'react';

export interface NotifierCardProps {
  config: any;
  onChange: (updater: (prev: any) => any) => void;
  onTestNotify: () => void;
  testStatus?: { loading: boolean; result?: any; error?: string };
}

export function NotifierCard({
  config,
  onChange,
  onTestNotify,
  testStatus,
}: NotifierCardProps) {
  const notifier = config?.plugins?.notifier || { enabled: true };
  const desktop = notifier.desktop || { enabled: true };
  const sound = notifier.sound || { enabled: true };
  const events = notifier.events || {
    onTurnEnd: true,
    onQuestion: true,
    onApproval: true,
    onError: true,
    minDurationSeconds: 5,
  };
  const webhook = notifier.webhook || {
    enabled: false,
    provider: 'generic',
    url: '',
    secret: '',
  };

  const updateNotifier = (key: string, val: any) => {
    onChange((prev: any) => ({
      ...prev,
      plugins: {
        ...prev.plugins,
        notifier: {
          ...prev.plugins?.notifier,
          [key]: val,
        },
      },
    }));
  };

  const updateDesktop = (key: string, val: any) => {
    updateNotifier('desktop', { ...desktop, [key]: val });
  };

  const updateSound = (key: string, val: any) => {
    updateNotifier('sound', { ...sound, [key]: val });
  };

  const updateEvents = (key: string, val: any) => {
    updateNotifier('events', { ...events, [key]: val });
  };

  const updateWebhook = (key: string, val: any) => {
    updateNotifier('webhook', { ...webhook, [key]: val });
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
          <span style={{ fontSize: '18px' }}>🔔</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px' }}>
              通知中心 (dsh-notifier)
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--dsw-alias-label-tertiary, #888)',
              }}
            >
              支持跨平台系统原生桌面弹窗、提示音与 Webhook 离机多渠道推送
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
            checked={notifier.enabled !== false}
            onChange={(e) => updateNotifier('enabled', e.target.checked)}
          />
          <span style={{ fontSize: '13px' }}>启用插件</span>
        </label>
      </div>

      {notifier.enabled !== false && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            marginTop: '4px',
          }}
        >
          {/* 语言设置 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '13px' }}>通知语言</span>
            <select
              value={notifier.locale || 'auto'}
              onChange={(e) => updateNotifier('locale', e.target.value)}
              style={{
                background: 'var(--dsw-alias-bg-layer-1, #242424)',
                color: 'var(--dsw-alias-label-primary, #fff)',
                border: '0.5px solid var(--dsw-alias-border-l4, #444)',
                borderRadius: 'var(--dsw-radius-md, 6px)',
                padding: '4px 8px',
                fontSize: '13px',
              }}
            >
              <option value="auto">跟随系统 (auto)</option>
              <option value="zh">简体中文 (zh)</option>
              <option value="en">English (en)</option>
            </select>
          </div>

          {/* 系统通知与声音 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--dsw-alias-bg-layer-1, #242424)',
                padding: '10px 12px',
                borderRadius: 'var(--dsw-radius-md, 6px)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={desktop.enabled !== false}
                onChange={(e) => updateDesktop('enabled', e.target.checked)}
              />
              <span style={{ fontSize: '13px' }}>💻 系统桌面弹窗</span>
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--dsw-alias-bg-layer-1, #242424)',
                padding: '10px 12px',
                borderRadius: 'var(--dsw-radius-md, 6px)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={sound.enabled !== false}
                onChange={(e) => updateSound('enabled', e.target.checked)}
              />
              <span style={{ fontSize: '13px' }}>🔊 系统提示音</span>
            </label>
          </div>

          {/* 触发事件过滤 */}
          <div
            style={{
              background: 'var(--dsw-alias-bg-layer-1, #242424)',
              padding: '12px',
              borderRadius: 'var(--dsw-radius-md, 6px)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 500 }}>
              触发时机与耗时过滤
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px',
                fontSize: '12px',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={events.onTurnEnd !== false}
                  onChange={(e) => updateEvents('onTurnEnd', e.target.checked)}
                />
                <span>回合结束 (onTurnEnd)</span>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={events.onQuestion !== false}
                  onChange={(e) => updateEvents('onQuestion', e.target.checked)}
                />
                <span>用户提问 (onQuestion)</span>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={events.onApproval !== false}
                  onChange={(e) => updateEvents('onApproval', e.target.checked)}
                />
                <span>审批确认 (onApproval)</span>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={events.onError !== false}
                  onChange={(e) => updateEvents('onError', e.target.checked)}
                />
                <span>执行异常 (onError)</span>
              </label>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '4px',
              }}
            >
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--dsw-alias-label-tertiary, #888)',
                }}
              >
                过滤极速任务：最小耗时阈值（秒）
              </span>
              <input
                type="number"
                min="0"
                value={events.minDurationSeconds ?? 5}
                onChange={(e) =>
                  updateEvents(
                    'minDurationSeconds',
                    Math.max(0, parseInt(e.target.value, 10) || 0),
                  )
                }
                style={{
                  width: '60px',
                  background: 'var(--dsw-alias-bg-layer-2, #333)',
                  color: 'var(--dsw-alias-label-primary, #fff)',
                  border: '0.5px solid var(--dsw-alias-border-l4, #444)',
                  borderRadius: 'var(--dsw-radius-sm, 4px)',
                  padding: '2px 6px',
                  fontSize: '12px',
                }}
              />
            </div>
          </div>

          {/* Webhook 离机推送配置 */}
          <div
            style={{
              background: 'var(--dsw-alias-bg-layer-1, #242424)',
              padding: '12px',
              borderRadius: 'var(--dsw-radius-md, 6px)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 500 }}>
                🌐 Webhook 离机推送
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(webhook.enabled)}
                  onChange={(e) => updateWebhook('enabled', e.target.checked)}
                />
                <span style={{ fontSize: '12px' }}>开启推送</span>
              </label>
            </div>

            {webhook.enabled && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>提供商</span>
                  <select
                    value={webhook.provider || 'generic'}
                    onChange={(e) => updateWebhook('provider', e.target.value)}
                    style={{
                      background: 'var(--dsw-alias-bg-layer-2, #333)',
                      color: 'var(--dsw-alias-label-primary, #fff)',
                      border: '0.5px solid var(--dsw-alias-border-l4, #444)',
                      borderRadius: 'var(--dsw-radius-sm, 4px)',
                      padding: '2px 6px',
                      fontSize: '12px',
                    }}
                  >
                    <option value="feishu">飞书机器人</option>
                    <option value="dingtalk">钉钉机器人</option>
                    <option value="wecom">企业微信</option>
                    <option value="bark">Bark (iOS)</option>
                    <option value="telegram">Telegram</option>
                    <option value="discord">Discord</option>
                    <option value="generic">自定义通用 Webhook</option>
                  </select>
                </div>
                <div>
                  <div style={{ marginBottom: '2px' }}>Webhook 地址 (URL)</div>
                  <input
                    type="text"
                    placeholder="https://... 支持 ${WEBHOOK_URL}"
                    value={webhook.url || ''}
                    onChange={(e) => updateWebhook('url', e.target.value)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: 'var(--dsw-alias-bg-layer-2, #333)',
                      color: 'var(--dsw-alias-label-primary, #fff)',
                      border: '0.5px solid var(--dsw-alias-border-l4, #444)',
                      borderRadius: 'var(--dsw-radius-sm, 4px)',
                      padding: '4px 8px',
                      fontSize: '12px',
                    }}
                  />
                </div>
                <div>
                  <div style={{ marginBottom: '2px' }}>
                    签名密钥 (Secret，可选)
                  </div>
                  <input
                    type="password"
                    placeholder="支持 ${WEBHOOK_SECRET}"
                    value={webhook.secret || ''}
                    onChange={(e) => updateWebhook('secret', e.target.value)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: 'var(--dsw-alias-bg-layer-2, #333)',
                      color: 'var(--dsw-alias-label-primary, #fff)',
                      border: '0.5px solid var(--dsw-alias-border-l4, #444)',
                      borderRadius: 'var(--dsw-radius-sm, 4px)',
                      padding: '4px 8px',
                      fontSize: '12px',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 诊断测试按钮 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '4px',
            }}
          >
            <button
              type="button"
              onClick={onTestNotify}
              disabled={testStatus?.loading}
              style={{
                border: '0.5px solid var(--dsw-alias-border-l3, #555)',
                borderRadius: 'var(--dsw-radius-md, 6px)',
                background: 'var(--dsw-alias-bg-layer-1, #2a2a2a)',
                color: 'var(--dsw-alias-label-primary, #fff)',
                padding: '6px 14px',
                fontSize: '12px',
                cursor: testStatus?.loading ? 'not-allowed' : 'pointer',
              }}
            >
              {testStatus?.loading ? '正在测试通知...' : '⚡ 发送测试通知'}
            </button>
            {testStatus?.result && (
              <span style={{ fontSize: '12px', color: '#4ade80' }}>
                ✅ {testStatus.result.message || '测试通知已发送'}
              </span>
            )}
            {testStatus?.error && (
              <span style={{ fontSize: '12px', color: '#f87171' }}>
                ❌ {testStatus.error}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
