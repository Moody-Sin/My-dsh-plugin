export interface ModelIndicatorConfig {
  enabled?: boolean;
}

export function resolveConfig(raw: unknown): ModelIndicatorConfig {
  if (typeof raw !== 'object' || raw === null) {
    return { enabled: true };
  }
  const conf = raw as Record<string, any>;
  return {
    enabled: conf.enabled ?? true,
  };
}
