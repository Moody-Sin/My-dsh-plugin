# DSH 聚合插件加载器与统一配置 (Umbrella Loader) 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 DSH 聚合插件总线 Loader (`@local/my-dsh-plugins`)，将仓库子插件目录规范升级为 `dsh-*`，实现子插件在启动时的自动扫描、动态 ESM 挂载以及基于 `plugins.config.json` 的集中化双层配置管控，达成 DSH 官方配置文件一次接入、后续零修改。

**Architecture:** 采用 Cordis 微内核架构的单入口 Umbrella Bundle 设计。仓库根目录作为唯一的 Cordis 插件接入 DSH Profile，其 `apply` 生命周期自动扫描当前目录下的所有 `dsh-*` 子插件目录，在 `import` 前依据 `plugins.config.json` 判定 `enabled`，利用 `pathToFileURL` 动态加载 ESM 模块，剥离控制元字段后通过独立沙箱隔离机制注入 `ctx.plugin(module, subConfig)`。

**Tech Stack:** TypeScript / Node.js (>= 18.0.0, Native ESM, fs, path, url), `@deepseek-ai/cordis` (v4.x), `@standard-schema/spec`, `esbuild`.

**Spec:** `docs/superpowers/specs/2026-10-12-dsh-umbrella-loader-design.md`

## Global Constraints

- **语言规范**：全程使用简体中文，称呼用户为“老大”。
- **工程规范**：约定式提交 (Conventional Commits)、语义化版本 (SemVer)、维护更新日志 (Keep a Changelog)、标准 README.md。
- **编码工作模型**：所有的编码工作必须通过子 agent `group/deepseek` 实现，单次派发不超过两个。
- **依赖限制**：零外部编译型依赖，仅使用 Node.js 原生模块及 Cordis 基础类型。
- **Schema 兼容**：每个自定义 `Config` 必须实现 Standard Schema 同步校验（遵循 Lessons Learned #3）。
- **Windows 路径安全**：动态 import 必须经过 `pathToFileURL` 转换，严禁直接拼接 Windows 反斜杠路径。

## Review Focus

1. **语法错误或有害副作用子插件被误执行**：在 `import()` 之前必须仅凭目录名推导出的 key 检查 `enabled === false` 并跳过，绝不能提前 import 禁用状态的模块。
2. **子插件 Schema 被加载器元字段污染**：透传给子插件的配置必须严格剥离 `enabled` 字段，避免严格 Schema 校验因未知字段报错。
3. **单插件崩溃连带拖垮聚合器**：每个子插件必须独立 `try...catch` 包裹 `await ctx.plugin(...)`，捕获异常后记录中文告警，不使聚合器自身的 Fiber 状态变为 failed。
4. **子插件与独立挂载冲突导致双重执行**：检查 Cordis Registry，若子插件已被其他途径挂载则自动跳过并告警。
5. **本地敏感密钥泄露**：双层配置机制中，`plugins.config.local.json` 必须严格进入 `.gitignore`，且本地文件优先级高于公开文件与官方 Profile。

---

### Task 1: 规范化重构现有通知插件目录与命名 (`dsh-notifier`)

**Files:**
- Move: `dsh-plugin-notifier` -> `dsh-notifier`
- Modify: `dsh-notifier/package.json`
- Modify: `dsh-notifier/cordis.patch.yml`
- Modify: `dsh-notifier/tests/manifest.test.ts`
- Modify: `package.json` (根目录 workspaces)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: None
- Produces: 统一命名的 `@local/dsh-notifier` 子包

- [ ] **Step 1: 重命名目录并更新子包元数据**

将 `dsh-plugin-notifier` 移动重命名为 `dsh-notifier`。
修改 `dsh-notifier/package.json`：
- `"name": "@local/dsh-notifier"`
- 脚本与入口保持不变。
修改 `dsh-notifier/cordis.patch.yml`：
- 将声明的条目 name 改为 `'@local/dsh-notifier'`。
修改根目录 `package.json`：
- `"workspaces": ["dsh-*"]`

- [ ] **Step 2: 更新子插件测试断言**

修改 `dsh-notifier/tests/manifest.test.ts`：
- 断言 `pkg.name === '@local/dsh-notifier'`。
- 断言 `cordis.patch.yml` 包含 `'@local/dsh-notifier'`。

- [ ] **Step 3: 运行子插件单元测试验证**

运行: `npm test --workspace=dsh-notifier`
预期结果: 全部测试通过 (52 项测试 PASS)

- [ ] **Step 4: 重新打包子插件**

运行: `npm run build --workspace=dsh-notifier`
预期结果: 成功编译生成 `dsh-notifier/index.js`

- [ ] **Step 5: 提交更改**

```bash
git add .
git commit -m "refactor(notifier): rename package to @local/dsh-notifier and align workspaces"
```

---

### Task 2: 统一双层配置管理器模块 (`src/config.ts`)

**Files:**
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Consumes: Node.js `fs`, `path`, `@standard-schema/spec`
- Produces:
  - `loadUmbrellaConfig(rootDir: string): UmbrellaLoaderConfig`
  - `getPluginConfig(config: UmbrellaLoaderConfig, pluginKey: string): { enabled: boolean; config: Record<string, any> }`
  - `Config`: Standard Schema 校验器

- [ ] **Step 1: 编写配置管理器单元测试**

在 `tests/config.test.ts` 中编写测试：
- 测试 `plugins.config.json` 与 `plugins.config.local.json` 的深层合并逻辑（local 字段覆盖 base 字段）。
- 测试配置文件缺失时的平稳降级（返回空集合 `{ plugins: {} }`）。
- 测试 `getPluginConfig` 正确解析 `enabled: false`，并确保返回的业务 `config` 中已完全剔除 `enabled` 键。
- 测试 Standard Schema 的同步验证器符合规范。

- [ ] **Step 2: 运行测试验证失败**

运行: `node --experimental-strip-types --test tests/config.test.ts`
预期结果: FAIL (模块不存在)

- [ ] **Step 3: 实现 `src/config.ts`**

实现：
1. `deepMerge(target, source)`：递归合并纯对象。
2. `loadUmbrellaConfig(rootDir)`：依次尝试读取 `plugins.config.json` 与 `plugins.config.local.json`，完成合并。
3. `getPluginConfig(config, pluginKey)`：返回 `{ enabled: boolean, config: Record<string, any> }`，过滤掉 `enabled` 字段。
4. 导出符合 Lessons Learned #3 的 Standard Schema 校验器 `Config`。

- [ ] **Step 4: 运行测试验证通过**

运行: `node --experimental-strip-types --test tests/config.test.ts`
预期结果: PASS

- [ ] **Step 5: 提交更改**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat(loader): implement dual-layer configuration loader with deep merge"
```

---

### Task 3: 子插件扫描器模块 (`src/scanner.ts`)

**Files:**
- Create: `src/scanner.ts`
- Test: `tests/scanner.test.ts`

**Interfaces:**
- Consumes: Node.js `fs`, `path`, `url`
- Produces:
  - `interface ScannedPlugin { dirName: string; pluginKey: string; dirPath: string; entryPath: string; entryUrl: string; }`
  - `scanPlugins(rootDir: string): ScannedPlugin[]`

- [ ] **Step 1: 编写扫描器单元测试**

在 `tests/scanner.test.ts` 中编写测试：
- 模拟目录结构，验证仅识别以 `dsh-` 开头且存在有效入口（`index.js` 或 `package.json` 指向的入口）的目录。
- 验证排除隐藏目录与 `node_modules`。
- 验证从目录名推导出的 `pluginKey`（如 `dsh-notifier` -> `notifier`）。
- 验证生成的 `entryUrl` 是符合标准的 `file:///` 格式 URL（兼容 Windows）。
- 验证结果按字母序稳定排列。

- [ ] **Step 2: 运行测试验证失败**

运行: `node --experimental-strip-types --test tests/scanner.test.ts`
预期结果: FAIL (模块不存在)

- [ ] **Step 3: 实现 `src/scanner.ts`**

实现：
1. 读取根目录下的子项，筛选 `dsh-*` 目录。
2. 解析子目录入口（优先检查 `index.js`，若不存在则读取 `package.json` 中的 `exports` 或 `main`）。
3. 使用 `pathToFileURL` 生成跨平台安全的 `entryUrl`。
4. 返回排序后的 `ScannedPlugin[]` 列表。

- [ ] **Step 4: 运行测试验证通过**

运行: `node --experimental-strip-types --test tests/scanner.test.ts`
预期结果: PASS

- [ ] **Step 5: 提交更改**

```bash
git add src/scanner.ts tests/scanner.test.ts
git commit -m "feat(loader): implement plugin directory scanner with safe url resolution"
```

---

### Task 4: 聚合插件核心生命周期与沙箱接线 (`src/index.ts`)

**Files:**
- Create: `src/index.ts`
- Test: `tests/loader.test.ts`

**Interfaces:**
- Consumes: `@deepseek-ai/cordis`, `scanner.ts`, `config.ts`
- Produces:
  - `export const name = 'my-dsh-plugins'`
  - `export { Config } from './config.js'`
  - `export function apply(ctx: Context, config?: UmbrellaLoaderConfig): Promise<void>`

- [ ] **Step 1: 编写 Cordis 聚合挂载集成测试**

在 `tests/loader.test.ts` 中编写测试：
- 构建 Mock Cordis Context（模拟 `ctx.plugin`, `ctx.registry`）。
- 验证正常情况下自动挂载 `dsh-notifier`，并成功传入剥离后的子配置。
- 验证当 `plugins.config.json` 中配置 `notifier.enabled = false` 时，不调用 dynamic import，直接跳过。
- 验证当单个插件的初始化抛错时，被单独 catch 并打印告警，不会影响其他插件挂载。
- 验证重复挂载同一个插件时执行跳过去重。

- [ ] **Step 2: 运行测试验证失败**

运行: `node --experimental-strip-types --test tests/loader.test.ts`
预期结果: FAIL (模块不存在)

- [ ] **Step 3: 实现 `src/index.ts`**

实现：
1. 导出 `name = 'my-dsh-plugins'` 与 `Config`。
2. 在 `apply(ctx, config)` 中：
   - 解析根目录物理绝对路径。
   - 加载合并配置（本地文件优先于传入的 config）。
   - 扫描子目录获得 `ScannedPlugin[]`。
   - 遍历各插件：
     - 若 `pluginConfig.enabled === false`，打印调试信息并跳过；
     - 动态 `await import(plugin.entryUrl)`；
     - 去重校验；
     - `try { const fiber = ctx.plugin(pluginDef, pluginConfig.config); await fiber; } catch (err) { ... }` 隔离异常。

- [ ] **Step 4: 运行测试验证通过**

运行: `node --experimental-strip-types --test tests/loader.test.ts`
预期结果: PASS

- [ ] **Step 5: 提交更改**

```bash
git add src/index.ts tests/loader.test.ts
git commit -m "feat(loader): wire umbrella cordis lifecycle with isolated plugin injection"
```

---

### Task 5: 根工程 Bundle 清单、构建流水线与模板配置

**Files:**
- Create: `cordis.patch.yml`
- Create: `plugins.config.json`
- Modify: `package.json`
- Modify: `.gitignore`
- Build: `index.js`

**Interfaces:**
- Consumes: `esbuild`, `src/index.ts`
- Produces: 根目录可直接由 DSH 运行的 Bundle 入口 `index.js` 与 patch 清单

- [ ] **Step 1: 配置根工程 Bundle 清单与脚本**

1. 修改根目录 `package.json`：
   - 增加包元数据：`"name": "@local/my-dsh-plugins"`, `"type": "module"`, `"exports": { ".": "./index.js" }`, `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`。
   - 增加构建脚本：
     `"build:self": "esbuild src/index.ts --bundle --platform=node --format=esm --outfile=index.js"`
     `"build": "npm run build --workspaces && npm run build:self"`
     `"test": "npm test --workspaces && node --experimental-strip-types --test tests/*.test.ts"`
2. 创建根目录 `cordis.patch.yml`：
   ```yaml
   - insert:
       - id: my-dsh-plugins
         name: '@local/my-dsh-plugins'
   ```
3. 创建根目录 `plugins.config.json`（公开基础配置模板，支持 `notifier` 的默认开关）。
4. 更新 `.gitignore`：加入 `plugins.config.local.json`。

- [ ] **Step 2: 执行完整构建与全量测试**

运行: `npm run build && npm test`
预期结果:
1. `index.js` 成功生成；
2. 所有子插件构建通过；
3. 所有单元测试和集成测试 100% PASS。

- [ ] **Step 3: 提交更改**

```bash
git add package.json cordis.patch.yml plugins.config.json .gitignore index.js
git commit -m "feat(build): setup root umbrella bundle manifest and build pipeline"
```

---

### Task 6: DSH 官方 Profile 切换、端到端验证与文档归档

**Files:**
- Modify: `C:\Users\illli\.dsh\profiles\web\package.json`
- Modify: `C:\Users\illli\.dsh\profiles\web\cordis.patch.yml`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `Lessons Learned.md`

- [ ] **Step 1: 切换 DSH 官方 Profile 依赖**

1. 修改 `~/.dsh/profiles/web/package.json`：
   - 将依赖 `"@local/dsh-plugin-notifier"` 替换为 `"@local/my-dsh-plugins": "link:D:/Project/My-dsh-plugin"`。
   - 将 `bundles` 列表中的 `"@local/dsh-plugin-notifier"` 替换为 `"@local/my-dsh-plugins"`。
2. 修改 `~/.dsh/profiles/web/cordis.patch.yml`：
   - 将末尾的 `- id: notifier; disabled: false` 替换为：
     ```yaml
     - id: my-dsh-plugins
       disabled: false
     ```

- [ ] **Step 2: 验证官方 Profile 解析与插件加载**

运行: `npx dsh web --dump-config` 或在 Web 宿主验证。
预期结果: 成功解析 `@local/my-dsh-plugins`，无模块缺失或崩溃异常。

- [ ] **Step 3: 更新项目文档与经验教训**

1. 更新 `README.md`：记录 Umbrella Loader 机制与子插件列表（更新为 `dsh-notifier`），说明集中配置 `plugins.config.json` 与 `plugins.config.local.json` 的使用方式。
2. 更新 `CHANGELOG.md`：记录 v0.3.0 聚合加载器与命名规范升级。
3. 检查是否有反复踩坑点，适度补充至 `Lessons Learned.md`。

- [ ] **Step 4: 提交所有文档与最终版本归档**

```bash
git add README.md CHANGELOG.md Lessons Learned.md
git commit -m "docs: document umbrella loader architecture and update plugin index"
```
