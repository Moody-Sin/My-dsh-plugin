/**
 * 格式化模型名称工具函数。
 * 将诸如 "remote-magpie/antigravity/gemini-3.8-flash" 或 "deepseek/deepseek-chat"
 * 转化为用户友好的展示标签。
 * 可选参数 trimVersionSuffix 决定是否截断 -latest 或 -20241022 等长版本日期后缀（默认保持全名）。
 */
export function formatModelName(
  fullModel: string | null | undefined,
  trimVersionSuffix = false,
): string {
  if (!fullModel || typeof fullModel !== 'string') return '';
  const parts = fullModel.split('/');
  let name = parts[parts.length - 1];

  // 友好大小写美化与前缀转换
  if (name.toLowerCase().startsWith('gemini-')) {
    name = name.replace(/^gemini-/i, 'Gemini ');
  } else if (name.toLowerCase().startsWith('deepseek-')) {
    name = name.replace(/^deepseek-/i, 'DeepSeek ');
  } else if (name.toLowerCase().startsWith('claude-')) {
    name = name.replace(/^claude-/i, 'Claude ');
  } else if (name.toLowerCase().startsWith('gpt-')) {
    name = name.replace(/^gpt-/i, 'GPT-');
  } else if (name.toLowerCase().startsWith('minimax-')) {
    name = name.replace(/^minimax-/i, 'MiniMax-');
  } else if (name.toLowerCase().startsWith('qwen-')) {
    name = name.replace(/^qwen-/i, 'Qwen-');
  }

  if (trimVersionSuffix) {
    name = name.replace(/-(?:latest|\d{8})$/i, '');
  }

  return name;
}

/**
 * 组合模型显示文本与推理层级（Reasoning Effort）。
 */
export function formatModelBadgeText(
  modelName: string,
  effort?: string | null,
): string {
  if (!modelName) return '';
  if (!effort) return modelName;
  return `${modelName} · ${effort.toUpperCase()}`;
}

/**
 * 格式化模型完整提示文本（Tooltip），支持根据当前语言动态输出中英文。
 */
export function formatModelTooltip(
  provider: string,
  model: string,
  effort?: string | null,
  isZh = true,
): string {
  const fullModel = `${provider}/${model}`;
  if (isZh) {
    return effort
      ? `子智能体模型: ${fullModel} (推理层级: ${effort})`
      : `子智能体模型: ${fullModel}`;
  }
  return effort
    ? `Subagent Model: ${fullModel} (Reasoning Effort: ${effort})`
    : `Subagent Model: ${fullModel}`;
}
