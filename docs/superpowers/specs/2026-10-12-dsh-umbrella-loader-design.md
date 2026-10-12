# DSH 聚合插件加载器与统一配置 (Umbrella Loader) 设计文档

## 1. 背景与意图 (Intent and Why)

当前在 DeepSeek Harness (DSH) 中开发和运行自定义插件时，标准方式是将每个插件作为独立的 Bundle 直接声明在 DSH 官方 Profile 配置（`~/.dsh/profiles/web/package.json` 与 `cordis.patch.yml`）中。

随着自定义插件数量的增加（如通知、工作流助手、会话监控等），该模式暴露了明显的痛点：
1. **官方配置文件频繁污染**：每新增或重构一个插件，都需要手动修改 DSH 官方 profile 的 `package.json` 与 `cordis.patch.yml`。
2. **配置分散不可控**：插件配置散落在官方庞大的系统配置文件中，无法纳入当前项目的 Git 版本管理，难以在团队内或多机间同步。
3. **升级与重置脆弱性**：DSH 升级或执行 profile 重置/修复（如 `dsh rescue` 或 `sanitizeProfile`）时，自定义插件配置极易丢失。
4. **命名不统一**：既有插件采用 `dsh-plugin-*` 命名，与项目演进规划不够精简一致。

本设计旨在为 `My-dsh-plugin` 仓库构建**统一聚合插件加载器 (Umbrella Loader)**，将目录规范升级为 **`dsh-*`**，并通过单入口 Cordis 插件实现子插件**自动扫描发现**、**安全动态挂载**与**集中化配置管控 (`plugins.config.json`)**，实现 DSH 官方配置文件的“一次挂载、后续零修改”。

---

## 2. 目标、非目标与反向目标 (Goals, Non-Goals, and Anti-Goals)

### 2.1 目标 (Goals)
- **单入口接入**：仓库根目录作为唯一的 Cordis Bundle (`@local/my-dsh-plugins`) 接入 DSH，官方配置仅需初始注册一次。
- **自动扫描与动态加载**：
  - 启动时自动扫描仓库根目录下所有匹配 `dsh-*` 的子目录。
  - 动态读取各子插件入口（优先 `index.js`，开发态兼容解析）并通过 `ctx.plugin(module, config)` 注入 Cordis 容器。
- **集中化统一配置 (`plugins.config.json`)**：
  - 在仓库根目录维护一份集中配置文件，支持各插件独立命名空间。
  - 支持每个插件的快捷开关（`enabled: false` 即跳过加载）。
  - 若配置文件中未声明某插件，则安全回退到该插件自身的默认配置。
- **命名规范重构**：
  - 将既有 `dsh-plugin-notifier` 统一重命名为 `dsh-notifier`（包名 `@local/dsh-notifier`）。
  - 项目根 `package.json` 的 `workspaces` 更新为 `["dsh-*"]`。
- **强健的容错与隔离**：
  - 单个子插件扫描失败、文件损坏或加载抛错时，记录告警日志并优雅降级，严禁阻塞其它插件或使 DSH 宿主崩溃。
- **严格遵循架构约定**：
  - 根 Loader 的 `Config` 严格实现 Standard Schema 同步校验（遵循 Lessons Learned #3）。

### 2.2 非目标 (Non-Goals)
- 不替代 Cordis 底层 Loader 的核心功能，不接管 DSH 内置官方包的依赖图解析。
- 不开发独立的 Web 管理 UI 视图，配置与开关直接由根目录 `plugins.config.json` 驱动。

### 2.3 反向目标 (Anti-Goals)
- **严禁引入重量级外部依赖**：仅使用 Node.js 原生模块（`fs`, `path`, `url`）与既有 Cordis 依赖。
- **严禁阻塞 DSH 启动流程**：子插件加载与配置解析必须轻量高效。
- **严禁破坏既有子插件的独立性**：每个 `dsh-*` 插件依然保留完整的独立生命周期、单测套件和 `package.json`，既可由聚合器加载，也可作为独立包直接导出。

---

## 3. 约束与运行环境 (Constraints)

- **Node.js 版本**：>= 18.0.0 (当前宿主为 Node v24.19.0)。
- **微内核框架**：`@deepseek-ai/cordis` (v4.x)。
- **Schema 规范**：`@standard-schema/spec` (Standard Schema v1)。
- **工作区规范**：npm workspaces，所有子插件存放于根目录下以 `dsh-*` 命名的子目录。
- **编码规范**：全中文日志提示、语义化版本、约定式提交。

---

## 4. 架构与设计决策 (Architecture & Decisions)

### 4.1 目录组织与文件架构

重构后的仓库目录结构如下：

```text
My-dsh-plugin/
├── package.json              # 根清单：声明 @local/my-dsh-plugins、workspaces: ["dsh-*"]
├── cordis.patch.yml          # 根 Bundle Patch：暴露 my-dsh-plugins 聚合插件条目
├── plugins.config.json       # 全局统一插件配置文件（用户在此配置所有子插件）
├── src/
│   ├── index.ts              # 聚合 Loader 核心入口：实现自动扫描与动态加载
│   ├── scanner.ts            # 子目录扫描与元数据解析模块
│   └── config.ts             # plugins.config.json 读取与 Standard Schema 校验
├── tests/
│   └── loader.test.ts        # 聚合 Loader 端到端与单元测试
├── index.js                  # esbuild 构建生成的根入口
├── dsh-notifier/             # 原 dsh-plugin-notifier 重命名后的完整子插件
│   ├── package.json          # 包名改为 @local/dsh-notifier
│   ├── cordis.patch.yml
│   ├── index.js
│   ├── src/
│   └── tests/
├── README.md                 # 根文档：记录插件列表与统一使用指南
├── CHANGELOG.md              # 根更新日志
├── AGENTS.md
└── Lessons Learned.md
```

### 4.2 统一配置模型设计 (`plugins.config.json` & `plugins.config.local.json`)

在仓库根目录下提供双层配置机制：
1. **基础配置模板 (`plugins.config.json`)**：
   - 随 Git 提交，定义公共参数、开关及示例模板（敏感 Secret 留空）。
2. **本地私有覆盖 (`plugins.config.local.json`)**：
   - 纳入 `.gitignore`，专门用于保存本机个人私密 Webhook Secret、真实 Token 等敏感信息。
   - 聚合加载器在启动时，若检测到 `plugins.config.local.json`，将对其进行深层合并（Deep Merge），覆盖对应字段。
3. **配置优先级决策**：
   - **本地文件拥有绝对最高权威**（`plugins.config.local.json` > `plugins.config.json` > DSH 官方 Profile Patch）。
   - 官方 Profile Patch 中的参数仅作为默认底垫或被本地文件直接覆盖，确保插件配置完全自主可控，杜绝官方 UI 或系统升级篡改。

示例 `plugins.config.json`：
```json
{
  "plugins": {
    "notifier": {
      "enabled": true,
      "desktop": {
        "enabled": true,
        "minDurationSeconds": 5
      },
      "sound": {
        "enabled": true
      },
      "events": {
        "onTurnEnd": true,
        "onQuestion": true,
        "onApproval": true,
        "onError": true
      },
      "webhook": {
        "enabled": false,
        "provider": "generic",
        "url": "",
        "secret": ""
      }
    }
  }
}
```

### 4.3 自动扫描与动态挂载逻辑

1. **定位插件工作区**：
   - 根 Loader 启动时，基于 `import.meta.url`（`fileURLToPath(new URL('.', import.meta.url))`）解析出仓库物理根目录绝对路径。
2. **安全读取配置文件**：
   - 检查配置文件。支持基础配置与本地私有覆盖层：
     - 基础配置文件：`plugins.config.json`（可提交至版本控制，保存通用/默认配置）；
     - 本地私有覆盖：`plugins.config.local.json`（加入 `.gitignore`，保存机密密钥等本地覆盖配置）；
     - 若本地私有覆盖存在，则深层合并覆盖基础配置。
3. **扫描子目录与键名推导**：
   - 使用 `fs.readdirSync` 遍历根目录，筛选所有满足以下条件的目录项：
     - 名称以 `dsh-` 开头（如 `dsh-notifier`）；
     - 排除 `node_modules` 与以 `.` 开头的隐藏目录；
     - 目录下包含有效入口（优先 `index.js`，次选 `package.json` 中的 `main` / `exports`）。
   - **配置键名推导规则**：统一由目录名剥离 `dsh-` 前缀推导（例如 `dsh-notifier` -> `notifier`）。
   - **提前跳过判定**：在动态 import 之前，优先检查对应键名配置中的 `enabled === false`；若显式禁用，直接跳过扫描与模块导入，彻底杜绝语法损坏或副作用模块在禁用状态下被触发执行。
   - 扫描结果按字母序（`localeCompare`）排列，确保加载顺序稳定确定。
4. **子插件动态载入与挂载**：
   - 将插件入口绝对路径通过 `pathToFileURL(entryPath).href` 转换为标准 `file://` URL（严格规避 Windows 盘符路径反斜杠导致的 ESM 导入异常）。
   - 使用 `await import(entryUrl)` 动态加载 ES 模块。
   - 提取插件对象（兼容 `module.default` 或 `module` 自身包含的 `apply` / `name`）。
   - **幂等防重挂载**：检查当前 Cordis Registry 是否已加载该插件，若已存在则跳过并输出提示，避免与独立引用的插件双重加载冲突。
   - **配置剥离与透传**：
     - 从合并后的配置切片中提取子配置，**剥离加载器保留字段 `enabled`**（`const { enabled, ...subConfig } = rawSection`）；
     - 若该插件未配置具体参数，则传空对象 `{}`，由子插件自身的 Standard Schema 校验器解析内置的 `DEFAULT_CONFIG`。
   - **错误隔离与生命周期**：
     - 通过独立 `try...catch` 挂载：
       ```typescript
       try {
         const fiber = ctx.plugin(pluginDef, subConfig);
         await fiber; // 等待 setup 阶段完成，捕获配置校验与同步初始化异常
       } catch (pluginError) {
         console.warn(`[my-dsh-plugins] 子插件 ${pluginKey} 初始化失败:`, pluginError);
       }
       ```
     - 任何单一插件的加载失败仅在本地记录中文告警，绝不破坏加载器自身的 Fiber，更不拖垮 DSH 宿主与其它子插件。
5. **生效时机与缓存约定**：
   - 依据经验教训（Lessons Learned #4），子插件的新增、删除或配置更新在 DSH 启动时生效。在运行中的 DSH 进程中若做修改，需重启 `dsh web` 释放 Node ESM 内存缓存。

### 4.4 DSH 官方配置的接入变化

- **改造前**：
  - `~/.dsh/profiles/web/package.json` 需要挂载 `@local/dsh-plugin-notifier`。
  - `~/.dsh/profiles/web/cordis.patch.yml` 需要显式配置 `notifier` 条目及其详细配置。
  - 后续每增加一个插件都需要重复添加。
- **改造后**：
  - `~/.dsh/profiles/web/package.json` 仅保留一条：
    ```json
    "dependencies": {
      "@local/my-dsh-plugins": "link:D:/Project/My-dsh-plugin"
    }
    ```
    并在 `bundles` 中声明 `"@local/my-dsh-plugins"`。
  - `~/.dsh/profiles/web/cordis.patch.yml` 仅需启用聚合条目：
    ```yaml
    - id: my-dsh-plugins
      disabled: false
    ```
  - **后续新增/删除任何 `dsh-*` 插件，官方配置文件完全 0 修改！**

### 4.5 构建与打包联动机制

根目录 `package.json` 配置如下统一 scripts：
```json
"scripts": {
  "build:plugins": "npm run build --workspaces",
  "build:self": "esbuild src/index.ts --bundle --platform=node --format=esm --outfile=index.js",
  "build": "npm run build:plugins && npm run build:self",
  "test": "npm test --workspaces && node --experimental-strip-types --test tests/*.test.ts"
}
```
通过该配置：
- 执行 `npm run build` 时，会自动串行完成所有 `dsh-*` 子包的构建，并打包根 Loader 的 `index.js`。
- 根目录 `index.js` 作为 Cordis 插件的单一发布产物。

---

## 5. 配置 Schema 规范 (`Config`)

根据 Cordis 与 Standard Schema 约束，根插件的 `Config` 声明如下：

```typescript
export interface UmbrellaLoaderConfig {
  configFile?: string; // 默认 'plugins.config.json'
  plugins?: Record<string, any>;
}

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'schemastery',
    validate(value: unknown) {
      const config = (typeof value === 'object' && value !== null) ? value : {};
      return { value: config as UmbrellaLoaderConfig };
    },
  },
};
```

---

## 6. 测试与验证策略

1. **扫描器单测**：
   - 测试准确识别 `dsh-*` 目录并忽略无关目录。
   - 测试在缺少 `index.js` 时的容错与回退机制。
2. **配置读取与合并单测**：
   - 测试 `plugins.config.json` 缺失时的平稳降级。
   - 测试配置包含 `enabled: false` 时的正确抑制。
   - 测试配置参数能够准确透传给子插件。
3. **Cordis 集成挂载测试**：
   - 使用 Mock Cordis Context 启动根 Loader，验证 `dsh-notifier` 能够被动态导入并成功调用 `ctx.plugin()` 注入。
   - 验证单插件加载抛错时的异常隔离与非阻塞表现。
4. **真实 DSH 环境端到端验证**：
   - 重新打包生成根目录 `index.js` 与 `dsh-notifier/index.js`。
   - 验证 DSH 官方 Profile 切换到 `@local/my-dsh-plugins` 后正常启动并触发通知。
