/**
 * 环境变量占位符插值。
 *
 * 支持 `${VAR_NAME}`、`${env:VAR_NAME}` 以及带默认值的 `${VAR_NAME:-default_value}`。
 * 变量名限定为 `[A-Za-z_][A-Za-z0-9_]*`，避免把 `${a.b}` 这类非环境变量写法误伤。
 *
 * 抽到独立模块是因为 `src/config.ts`（插件运行时）与 `bin/test-notify.ts`（诊断 CLI）
 * 都需要它；重复实现一份必然随时间漂移，而 CLI 的诊断结论必须与生产行为一致。
 */
const ENV_PLACEHOLDER_PATTERN = /\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

/**
 * 插值配置文本中的环境变量占位符（`${VAR_NAME}`、`${env:VAR_NAME}` 与 `${VAR_NAME:-default}`）。
 *
 * - 变量已定义时替换为对应值（空串也是合法取值，照常替换）；
 * - 变量未定义但提供了 `:-default` 默认值时替换为默认值；
 * - 变量未定义且无默认值时**原样保留占位符**，便于用户直观发现漏配的变量，
 *   而不是被静默替换成空串导致凭据以空值下发；
 * - 经 JSON.stringify 安全转义并剥离首尾引号，防止 Windows 路径反斜杠 `\`、双引号 `"` 等
 *   字符破坏 JSON 语法。
 *
 * 替换值经函数返回，因此变量内容中的 `$&` / `$1` 不会被当作替换模式二次解释。
 */
export function interpolateEnvVariables(
  raw: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return raw.replace(
    ENV_PLACEHOLDER_PATTERN,
    (placeholder, varName: string, defaultValue?: string) => {
      const value = env[varName];
      if (value !== undefined) {
        return JSON.stringify(value).slice(1, -1);
      }
      if (defaultValue !== undefined) {
        return JSON.stringify(defaultValue).slice(1, -1);
      }
      return placeholder;
    },
  );
}
