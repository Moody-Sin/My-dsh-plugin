import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatModelBadgeText,
  formatModelName,
  formatModelTooltip,
} from '../src/formatter.ts';

describe('formatModelName', () => {
  it('应当正确美化 gemini 前缀模型', () => {
    assert.equal(
      formatModelName('remote-magpie/antigravity/gemini-3.8-flash'),
      'Gemini 3.8-flash',
    );
  });

  it('应当正确美化 deepseek 前缀模型', () => {
    assert.equal(formatModelName('deepseek/deepseek-chat'), 'DeepSeek chat');
  });

  it('应当正确美化 claude 前缀模型', () => {
    assert.equal(
      formatModelName('anthropic/claude-3-5-sonnet-20241022'),
      'Claude 3-5-sonnet-20241022',
    );
  });

  it('应当正确美化 gpt 前缀模型', () => {
    assert.equal(formatModelName('openai/gpt-4o'), 'GPT-4o');
  });

  it('应当容错处理空值与非字符串', () => {
    assert.equal(formatModelName(null), '');
    assert.equal(formatModelName(undefined), '');
    assert.equal(formatModelName(''), '');
  });

  it('可选 trimVersionSuffix 为 true 时裁剪日期或 latest 后缀', () => {
    assert.equal(
      formatModelName('anthropic/claude-3-5-sonnet-20241022', true),
      'Claude 3-5-sonnet',
    );
    assert.equal(
      formatModelName('google/gemini-1.5-pro-latest', true),
      'Gemini 1.5-pro',
    );
  });
});

describe('formatModelBadgeText', () => {
  it('当没有 reasoning effort 时仅展示模型名', () => {
    assert.equal(formatModelBadgeText('Gemini 3.8-flash', null), 'Gemini 3.8-flash');
    assert.equal(formatModelBadgeText('Gemini 3.8-flash', undefined), 'Gemini 3.8-flash');
  });

  it('当存在 reasoning effort 时附加层级并大写', () => {
    assert.equal(
      formatModelBadgeText('Gemini 3.8-flash', 'high'),
      'Gemini 3.8-flash · HIGH',
    );
  });

  it('空模型名返回空字符串', () => {
    assert.equal(formatModelBadgeText('', 'high'), '');
  });
});

describe('formatModelTooltip', () => {
  it('中文环境下格式化 tooltip（带与不带 effort）', () => {
    assert.equal(
      formatModelTooltip('magpie', 'remote-magpie/gemini', 'high', true),
      '子智能体模型: magpie/remote-magpie/gemini (推理层级: high)',
    );
    assert.equal(
      formatModelTooltip('magpie', 'remote-magpie/gemini', null, true),
      '子智能体模型: magpie/remote-magpie/gemini',
    );
  });

  it('英文环境下格式化 tooltip（带与不带 effort）', () => {
    assert.equal(
      formatModelTooltip('magpie', 'remote-magpie/gemini', 'high', false),
      'Subagent Model: magpie/remote-magpie/gemini (Reasoning Effort: high)',
    );
    assert.equal(
      formatModelTooltip('magpie', 'remote-magpie/gemini', undefined, false),
      'Subagent Model: magpie/remote-magpie/gemini',
    );
  });
});
