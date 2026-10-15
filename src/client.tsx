import React from 'react';
import { SettingsTab } from './ui/SettingsTab.tsx';

declare const window: any;
declare const document: any;

/**
 * 客户端浏览器 bundle 入口：通过 __ModuleLoader__.load 注册设置标签页。
 */
export function registerSettingsUI() {
  const PLUGIN_ID = '@local/my-dsh-plugins/settings-ui';

  if (typeof window === 'undefined') return;
  const w = window as any;

  if (w.__my_dsh_plugins_settings_ui_registered__) return;
  w.__my_dsh_plugins_settings_ui_registered__ = true;

  const ml = w.__ModuleLoader__;
  if (ml?.load) {
    const alreadyInQueue =
      ml.mode === 'queue' &&
      Array.isArray(ml.pendingQueue) &&
      ml.pendingQueue.some((reg: any) => reg.id === PLUGIN_ID);

    if (!alreadyInQueue) {
      try {
        ml.load({
          id: PLUGIN_ID,
          factory(require: any) {
            const ReactMod = require('react');
            return {
              inject: ['slots', 'locale'],
              apply(ctx: any) {
                setupSettingsSlot(ctx, ReactMod);
              },
            };
          },
        });
      } catch {
        // 容错处理
      }
    }
  }

  // 补丁直接挂载防御：如果页面已经初始化完成
  if (typeof document !== 'undefined') {
    mountDirectSlot();
  }
}

function setupSettingsSlot(ctx: any, ReactMod: any) {
  try {
    ctx.slots.inject('settings.plugins.tab', () =>
      ctx.slots.register(
        {
          name: 'settings.plugins.tab',
          id: 'local-plugins-config',
          order: 5, // 排在官方只读清单前面
          label: () => '参数配置',
        },
        () => ReactMod.createElement(SettingsTab, null),
      ),
    );
  } catch (err) {
    // 容错处理
  }
}

function mountDirectSlot() {
  try {
    const w = window as any;
    const slotService = w.__DSH_SLOTS__ || w.__dsh_slots__;
    if (slotService?.register && !w.__my_dsh_plugins_tab_direct_registered__) {
      w.__my_dsh_plugins_tab_direct_registered__ = true;
      slotService.register(
        {
          name: 'settings.plugins.tab',
          id: 'local-plugins-config',
          order: 5,
          label: '参数配置',
        },
        () => React.createElement(SettingsTab, null),
      );
    }
  } catch {
    // 忽略
  }
}

// 自动执行注册
registerSettingsUI();
