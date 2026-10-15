import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * 构建产物与源码同步性校验。
 *
 * 产物（`index.js` / `client.js` 及各子包入口）是**入库**的（`.gitignore` 未忽略），
 * 而 `npm test` 跑的是 TypeScript 源码。这意味着「改了源码忘了 `npm run build`」
 * 不会让任何既有测试变红 —— 但用户实际加载的是陈旧产物。
 *
 * **判据刻意不依赖文件系统 `mtime`。** 早期版本用「源码 mtime > 产物 mtime」判定，
 * 但 Git 在 `clone` / CI 检出时**不保留**原始修改时间，而是按检出顺序即时赋时；
 * 实测全新 clone 后 `src/` 下 9 个源文件都比 `index.js` 新，导致在完全干净的
 * 检出上误报「产物已过期」。这类 flaky 断言比没有断言更糟。
 *
 * 现在改用两个 mtime 无关的判据：
 *  1. **Git 提交次序**：产物是否落后于**生成它的那个入口源文件**的最后一次提交；
 *  2. **工作区脏改动**：该入口源文件有未提交改动而产物没有 —— 手改源码忘了重建。
 *
 * 判据 1 刻意按「具体入口文件」而非「整个 src/ 目录」比对：一个包常有多个入口
 * （如 `index.ts` 与 `client.ts` 分别产出 `index.js` 与 `client.js`），
 * 按目录比对会把「只改了另一个入口」误判成产物过期。
 *
 * 判据 2 有一个已知的保守边界：若同一次提交里源码与产物**都**被改动（哪怕产物
 * 改错了内容），本测试不会发现。彻底校验需要重新构建后逐字节比对，而那会把
 * esbuild 版本、tsconfig 继承上下文、工作区依赖解析等构建环境细节锁进测试，
 * 脆弱且难以诊断 —— 与其如此，不如把「源码改了产物没跟上」这一最常见情况焊死。
 */
describe('构建产物同步性', () => {
  const repoRoot = process.cwd();

  /** 该路径在指定提交中是否存在（用于处理「产物首次入库」等边界） */
  const existsInHead = (relPath: string): boolean => {
    try {
      execFileSync('git', ['cat-file', '-e', `HEAD:${relPath}`], {
        cwd: repoRoot,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  };

  /** 某路径最后被提交的 Unix 秒；未提交过则返回 undefined */
  const lastCommitTime = (relPath: string): number | undefined => {
    try {
      const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', relPath], {
        cwd: repoRoot,
        stdio: 'pipe',
      })
        .toString()
        .trim();
      return out ? Number(out) : undefined;
    } catch {
      return undefined;
    }
  };

  /** 该路径是否有未提交改动（含暂存与未暂存） */
  const isDirty = (relPath: string): boolean => {
    try {
      const out = execFileSync('git', ['status', '--porcelain', '--', relPath], {
        cwd: repoRoot,
        stdio: 'pipe',
      })
        .toString()
        .trim();
      return out !== '';
    } catch {
      return false; // 非 Git 环境（如导出的 tarball）不做脏判定
    }
  };

  /**
   * @param artifact 产物相对路径
   * @param entrySources 真正参与构建该产物的源文件（含打包脚本），而非整个目录
   */
  const assertUpToDate = (artifact: string, entrySources: string[]): void => {
    const artifactPath = path.join(repoRoot, artifact);
    assert.ok(fs.existsSync(artifactPath), `${artifact} 必须存在（请先运行 npm run build）`);

    const sources = entrySources.filter((rel) => fs.existsSync(path.join(repoRoot, rel)));
    assert.ok(sources.length > 0, `${artifact} 未声明任何存在的源文件，测试夹具可能已失效`);

    // 判据 1：产物落后于其入口源文件的最后一次提交 → 源码后来改过而产物没重建
    const artifactTime = existsInHead(artifact) ? lastCommitTime(artifact) : undefined;
    if (artifactTime !== undefined) {
      for (const source of sources) {
        const sourceTime = lastCommitTime(source);
        if (sourceTime === undefined) continue;
        assert.ok(
          artifactTime >= sourceTime,
          `${artifact} 落后于 ${source} 的最后一次改动（产物提交于 ${new Date(
            artifactTime * 1000,
          ).toISOString()}，源码提交于 ${new Date(sourceTime * 1000).toISOString()}）。\n` +
            '请运行 npm run build 后把产物一并提交',
        );
      }
    }

    // 判据 2：入口源文件有未提交改动，而产物没有 → 手改源码忘了重建
    const dirtySources = sources.filter((rel) => isDirty(rel));
    if (dirtySources.length > 0 && !isDirty(artifact)) {
      assert.fail(
        `${artifact} 未随之更新：以下源文件有未提交改动，但产物没有。\n  ${dirtySources.join(
          '\n  ',
        )}\n请运行 npm run build 后把产物一并提交`,
      );
    }
  };

  it('根加载器 index.js 与其入口源码同步', () => {
    assertUpToDate('index.js', ['src/index.ts', 'src/api.ts', 'src/config.ts', 'src/scanner.ts']);
  });

  it('client.js 与其入口源码、构建脚本同步', () => {
    // client bundle 由 scripts/build-client.mjs 从 src/client.tsx 及其 UI 子模块打包
    assertUpToDate('client.js', [
      'scripts/build-client.mjs',
      'src/client.tsx',
      'src/ui/SettingsTab.tsx',
      'src/ui/NotifierCard.tsx',
      'src/ui/ModelIndicatorCard.tsx',
    ]);
  });

  it('dsh-notifier/index.js 与其入口源码同步', () => {
    assertUpToDate('dsh-notifier/index.js', [
      'dsh-notifier/src/index.ts',
      'dsh-notifier/src/config.ts',
      'dsh-notifier/src/dispatcher.ts',
      'dsh-notifier/src/channels/desktop.ts',
      'dsh-notifier/src/channels/sound.ts',
      'dsh-notifier/src/channels/webhook.ts',
      'dsh-notifier/src/utils/i18n.ts',
      'dsh-notifier/src/utils/env.ts',
      'dsh-notifier/src/utils/wsl.ts',
      'dsh-notifier/src/utils/xml.ts',
    ]);
  });

  it('dsh-subagent-model-indicator 两个产物分别与各自入口同步', () => {
    // 该包有两个独立入口：src/index.ts → index.js，src/client.ts → client.js。
    // 必须分开比对：只改 client.ts 时 index.js 无需重建。
    assertUpToDate('dsh-subagent-model-indicator/index.js', [
      'dsh-subagent-model-indicator/src/index.ts',
      'dsh-subagent-model-indicator/src/config.ts',
    ]);
    assertUpToDate('dsh-subagent-model-indicator/client.js', [
      'dsh-subagent-model-indicator/src/client.ts',
      'dsh-subagent-model-indicator/src/formatter.ts',
    ]);
  });
});
