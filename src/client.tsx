import React from 'react';
import { SettingsTab } from './ui/SettingsTab.tsx';

declare const window: any;

export const name = 'my-dsh-plugins-client';
export const inject = ['slots'];

export function apply(ctx: any) {
  setupSettingsSlot(ctx, React);
}

/**
 * 客户端浏览器 bundle 入口：通过 __ModuleLoader__.load 注册设置标签页。
 *
 * 只保留这一条注册路径。DSH 会在渲染 index.html 之前先输出模块队列脚本
 * （`dsh-client-modules` 的 `bootInjections` 保证 `window.__ModuleLoader__` 在
 * queue 模式下必然存在），因此本 bundle 执行时 `ml.load` 一定可用，
 * 不需要任何「页面已初始化完成」的兜底分支。
 */
export function registerSettingsUI() {
  const PLUGIN_ID = '@local/my-dsh-plugins';

  if (typeof window === 'undefined') return;
  const w = window as any;

  if (w.__my_dsh_plugins_settings_ui_registered__) return;
  w.__my_dsh_plugins_settings_ui_registered__ = true;

  const ml = w.__ModuleLoader__;
  if (!ml?.load) return;

  const alreadyInQueue =
    ml.mode === 'queue' &&
    Array.isArray(ml.pendingQueue) &&
    ml.pendingQueue.some((reg: any) => reg.id === PLUGIN_ID);
  if (alreadyInQueue) return;

  ml.load({
    id: PLUGIN_ID,
    factory(require: any) {
      const ReactMod = require('react');
      return {
        name,
        inject,
        apply(ctx: any) {
          setupSettingsSlot(ctx, ReactMod);
        },
      };
    },
  });
}

function setupSettingsSlot(ctx: any, ReactMod: any) {
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
}

// 自动执行注册
registerSettingsUI();
