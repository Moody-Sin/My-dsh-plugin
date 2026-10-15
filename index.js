// src/index.ts
import fs3 from "node:fs";
import path3 from "node:path";
import { fileURLToPath } from "node:url";

// src/config.ts
import fs from "node:fs";
import path from "node:path";
var BASE_CONFIG_FILENAME = "plugins.config.json";
var LOCAL_CONFIG_FILENAME = "plugins.config.local.json";
var ENV_PLACEHOLDER_PATTERN = /\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;
var SCHEMASTER_SYMBOL = /* @__PURE__ */ Symbol.for("schemastery");
var VOLATILE_WRITE_SYMBOL = /* @__PURE__ */ Symbol.for("cosmokit.volatile.write");
function isVolatileRef(value) {
  return typeof value === "object" && value !== null && VOLATILE_WRITE_SYMBOL in value;
}
function snapshotVolatile(value, ancestors = /* @__PURE__ */ new Set()) {
  if (typeof value === "function") throw new TypeError("volatile \u914D\u7F6E\u4E0D\u5141\u8BB8\u5305\u542B\u51FD\u6570");
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new TypeError("volatile \u914D\u7F6E\u4E0D\u5141\u8BB8\u5305\u542B\u5FAA\u73AF\u5F15\u7528");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Object.freeze(value.map((item) => snapshotVolatile(item, ancestors)));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("volatile \u914D\u7F6E\u53EA\u5141\u8BB8\u666E\u901A\u5BF9\u8C61\u6216\u6570\u7EC4");
    }
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, snapshotVolatile(item, ancestors)])
      )
    );
  } finally {
    ancestors.delete(value);
  }
}
function createVolatileRef(value) {
  let current = snapshotVolatile(value);
  return Object.freeze({
    get: () => current,
    [VOLATILE_WRITE_SYMBOL]: (next) => {
      current = next;
    }
  });
}
function resolveVolatileRefs(value) {
  if (isVolatileRef(value)) return resolveVolatileRefs(value.get());
  if (Array.isArray(value)) return value.map(resolveVolatileRefs);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveVolatileRefs(item)])
    );
  }
  return value;
}
var SCHEMA_DICT = {
  plugins: {
    type: "object",
    description: "\u5B50\u63D2\u4EF6\u914D\u7F6E\u96C6\u5408",
    meta: {},
    dict: {
      notifier: {
        type: "object",
        description: "\u901A\u77E5\u63D2\u4EF6\u914D\u7F6E",
        meta: {},
        dict: {
          enabled: {
            type: "boolean",
            description: "\u542F\u7528\u901A\u77E5\u63D2\u4EF6",
            meta: { volatile: true }
          },
          locale: {
            type: "string",
            description: "\u8BED\u8A00\u8BBE\u7F6E (auto | zh | en)",
            meta: { volatile: true }
          },
          desktop: {
            type: "object",
            description: "\u7CFB\u7EDF\u684C\u9762\u5F39\u7A97",
            meta: {},
            dict: {
              enabled: {
                type: "boolean",
                description: "\u5F00\u542F\u684C\u9762\u5F39\u7A97",
                meta: { volatile: true }
              }
            }
          },
          sound: {
            type: "object",
            description: "\u7CFB\u7EDF\u63D0\u793A\u97F3",
            meta: {},
            dict: {
              enabled: {
                type: "boolean",
                description: "\u5F00\u542F\u7CFB\u7EDF\u63D0\u793A\u97F3",
                meta: { volatile: true }
              }
            }
          },
          events: {
            type: "object",
            description: "\u4E8B\u4EF6\u901A\u77E5\u4E0E\u8017\u65F6\u8FC7\u6EE4",
            meta: {},
            dict: {
              onTurnEnd: {
                type: "boolean",
                description: "\u4EFB\u52A1\u5B8C\u6210\u65F6\u901A\u77E5",
                meta: { volatile: true }
              },
              onQuestion: {
                type: "boolean",
                description: "\u7B49\u5F85\u63D0\u95EE\u65F6\u901A\u77E5",
                meta: { volatile: true }
              },
              onApproval: {
                type: "boolean",
                description: "\u6743\u9650\u5BA1\u6279\u65F6\u901A\u77E5",
                meta: { volatile: true }
              },
              onError: {
                type: "boolean",
                description: "\u4EFB\u52A1\u5F02\u5E38\u65F6\u901A\u77E5",
                meta: { volatile: true }
              },
              minDurationSeconds: {
                type: "number",
                description: "\u4EFB\u52A1\u5B8C\u6210\u8FC7\u6EE4\u9608\u503C (\u79D2)",
                meta: { volatile: true }
              }
            }
          },
          webhook: {
            type: "object",
            description: "Webhook \u79BB\u673A\u63A8\u9001",
            meta: {},
            dict: {
              enabled: {
                type: "boolean",
                description: "\u5F00\u542F Webhook \u63A8\u9001",
                meta: { volatile: true }
              },
              provider: {
                type: "string",
                description: "\u6E20\u9053\u7C7B\u578B (feishu | dingtalk | wecom | bark | telegram | discord | generic)",
                meta: { volatile: true }
              },
              url: {
                type: "string",
                description: "Webhook \u673A\u5668\u4EBA\u5730\u5740",
                meta: { volatile: true }
              },
              secret: {
                type: "string",
                description: "\u7B7E\u540D\u5BC6\u94A5 / Chat ID (\u53EF\u9009)",
                meta: { volatile: true }
              }
            }
          }
        }
      },
      "subagent-model-indicator": {
        type: "object",
        description: "\u5B50\u667A\u80FD\u4F53\u6A21\u578B\u6307\u793A\u5668\u914D\u7F6E",
        meta: {},
        dict: {
          enabled: {
            type: "boolean",
            description: "\u542F\u7528\u5B50\u667A\u80FD\u4F53\u6A21\u578B\u6307\u793A\u5668",
            meta: { volatile: true }
          }
        }
      }
    }
  }
};
function cloneSchemaNode(node) {
  const copy = {
    type: node.type,
    meta: { ...node.meta }
  };
  if (node.description !== void 0) copy.description = node.description;
  if (node.dict) {
    copy.dict = Object.fromEntries(
      Object.entries(node.dict).map(([key, child]) => [key, cloneSchemaNode(child)])
    );
  }
  return copy;
}
function attachToJSON(node) {
  for (const child of Object.values(node.dict ?? {})) attachToJSON(child);
  node.toJSON = () => cloneSchemaNode(node);
  return node;
}
attachToJSON({
  type: "object",
  description: "DSH \u805A\u5408\u603B\u7EBF\u914D\u7F6E",
  meta: {},
  dict: SCHEMA_DICT
});
function registerPluginSchema(pluginKey, schemaOrDict) {
  const pluginsDict = SCHEMA_DICT.plugins?.dict;
  if (!pluginsDict) return;
  if (schemaOrDict && typeof schemaOrDict === "object") {
    let nodeToAttach;
    if ("dict" in schemaOrDict && schemaOrDict.dict) {
      nodeToAttach = {
        type: "object",
        description: schemaOrDict.description || `${pluginKey} \u63D2\u4EF6\u914D\u7F6E`,
        meta: { ...schemaOrDict.meta || {} },
        dict: schemaOrDict.dict
      };
    } else {
      nodeToAttach = {
        type: "object",
        description: `${pluginKey} \u63D2\u4EF6\u914D\u7F6E`,
        meta: {},
        dict: schemaOrDict
      };
    }
    if (nodeToAttach.dict && !nodeToAttach.dict.enabled) {
      nodeToAttach.dict = {
        enabled: {
          type: "boolean",
          description: `\u542F\u7528 ${pluginKey} \u63D2\u4EF6`,
          meta: { volatile: true }
        },
        ...nodeToAttach.dict
      };
    }
    attachToJSON(nodeToAttach);
    pluginsDict[pluginKey] = nodeToAttach;
  } else if (!pluginsDict[pluginKey]) {
    const defaultNode = {
      type: "object",
      description: `${pluginKey} \u63D2\u4EF6\u914D\u7F6E`,
      meta: {},
      dict: {
        enabled: {
          type: "boolean",
          description: `\u542F\u7528 ${pluginKey} \u63D2\u4EF6`,
          meta: { volatile: true }
        }
      }
    };
    attachToJSON(defaultNode);
    pluginsDict[pluginKey] = defaultNode;
  }
}
var SCHEMA_ROOT = {
  type: "object",
  description: "DSH \u805A\u5408\u603B\u7EBF\u914D\u7F6E",
  meta: {},
  dict: SCHEMA_DICT
};
function materializeVolatile(value, node) {
  if (node.meta?.volatile) {
    try {
      return createVolatileRef(value);
    } catch (error) {
      console.warn(`[my-dsh-plugins] \u914D\u7F6E\u5B57\u6BB5\u5FEB\u7167\u5931\u8D25\uFF0C\u5DF2\u964D\u7EA7\u4E3A\u4E0D\u53EF\u70ED\u6539: ${String(error)}`);
      return value;
    }
  }
  if (node.type === "object" && node.dict) {
    const source = value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
    const result = {};
    for (const [key, item] of Object.entries(source)) {
      const child = node.dict[key];
      result[key] = child ? materializeVolatile(item, child) : clonePlain(item);
    }
    for (const [key, child] of Object.entries(node.dict)) {
      if (!(key in result)) result[key] = materializeVolatile(void 0, child);
    }
    return result;
  }
  return clonePlain(value);
}
function validateConfig(value) {
  const source = value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
  return materializeVolatile(source, SCHEMA_ROOT);
}
var Config = Object.assign(
  function validatePluginConfig(data) {
    return validateConfig(data);
  },
  {
    [SCHEMASTER_SYMBOL]: true,
    "~standard": {
      version: 1,
      vendor: "schemastery",
      validate(value) {
        return { value: validateConfig(value) };
      }
    },
    /** 返回 plain schema 结构（**深拷贝**），而非 schemastery 原生的 `{ uid, refs }` 引用图 */
    toJSON() {
      return cloneSchemaNode(SCHEMA_ROOT);
    },
    type: SCHEMA_ROOT.type,
    description: SCHEMA_ROOT.description,
    meta: { ...SCHEMA_ROOT.meta },
    dict: SCHEMA_DICT
  }
);
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function clonePlain(value) {
  if (isVolatileRef(value)) return clonePlain(value.get());
  if (!isPlainObject(value)) return value;
  const copy = {};
  for (const [key, item] of Object.entries(value)) {
    copy[key] = clonePlain(item);
  }
  return copy;
}
function deepMerge(target, source) {
  if (!isPlainObject(source)) return clonePlain(source);
  const merged = isPlainObject(target) ? clonePlain(target) : {};
  for (const [key, value] of Object.entries(source)) {
    merged[key] = isPlainObject(value) && isPlainObject(merged[key]) ? deepMerge(merged[key], value) : clonePlain(value);
  }
  return merged;
}
function interpolateEnvVariables(raw) {
  return raw.replace(ENV_PLACEHOLDER_PATTERN, (placeholder, varName, defaultValue) => {
    const value = process.env[varName];
    if (value !== void 0) {
      return JSON.stringify(value).slice(1, -1);
    }
    if (defaultValue !== void 0) {
      return JSON.stringify(defaultValue).slice(1, -1);
    }
    return placeholder;
  });
}
function readJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(interpolateEnvVariables(raw));
    return isPlainObject(parsed) ? parsed : {};
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn(`[my-dsh-plugins] \u914D\u7F6E\u6587\u4EF6\u89E3\u6790\u5931\u8D25\uFF0C\u5DF2\u5FFD\u7565\u8BE5\u6587\u4EF6: ${filePath}`, error);
    }
    return {};
  }
}
function loadUmbrellaConfig(rootDir) {
  const base = readJsonFile(path.join(rootDir, BASE_CONFIG_FILENAME));
  const local = readJsonFile(path.join(rootDir, LOCAL_CONFIG_FILENAME));
  const merged = deepMerge(base, local);
  return {
    ...merged,
    plugins: isPlainObject(merged.plugins) ? merged.plugins : {}
  };
}
function getPluginConfig(config, pluginKey) {
  const section = config?.plugins?.[pluginKey];
  const { enabled, ...rest } = isPlainObject(section) ? section : {};
  return {
    enabled: enabled !== false,
    config: rest
  };
}

// src/scanner.ts
import fs2 from "node:fs";
import path2 from "node:path";
import { pathToFileURL } from "node:url";
var PLUGIN_DIR_PREFIX = "dsh-";
function resolvePackageEntry(dirPath) {
  const packagePath = path2.join(dirPath, "package.json");
  if (!fs2.existsSync(packagePath)) return void 0;
  let pkg;
  try {
    const raw = fs2.readFileSync(packagePath, "utf8").replace(/^\uFEFF/, "");
    pkg = JSON.parse(raw);
  } catch (error) {
    console.warn(`[my-dsh-plugins] \u5B50\u63D2\u4EF6 ${path2.basename(dirPath)} \u7684 package.json \u89E3\u6790\u5931\u8D25\uFF0C\u5DF2\u8DF3\u8FC7:`, error);
    return void 0;
  }
  if (typeof pkg !== "object" || pkg === null) return void 0;
  const exported = pkg.exports?.["."] ?? pkg.exports;
  const candidates = [
    exported,
    typeof exported === "object" && exported !== null ? exported.node ?? exported.import ?? exported.default ?? exported.require : void 0,
    pkg.main
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
  }
  return void 0;
}
function resolveEntryPath(dirPath) {
  const indexFile = path2.join(dirPath, "index.js");
  if (fs2.existsSync(indexFile)) return indexFile;
  const declared = resolvePackageEntry(dirPath);
  if (declared === void 0) return void 0;
  const entryPath = path2.resolve(dirPath, declared);
  return fs2.existsSync(entryPath) ? entryPath : void 0;
}
function isDirectoryEntry(rootDir, entry) {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return fs2.statSync(path2.join(rootDir, entry.name), { throwIfNoEntry: false })?.isDirectory() === true;
  } catch {
    return false;
  }
}
function scanPlugins(rootDir) {
  let entries;
  try {
    entries = fs2.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const plugins = [];
  for (const entry of entries) {
    if (!isDirectoryEntry(rootDir, entry)) continue;
    if (!entry.name.startsWith(PLUGIN_DIR_PREFIX)) continue;
    const dirPath = path2.join(rootDir, entry.name);
    const entryPath = resolveEntryPath(dirPath);
    if (entryPath === void 0) continue;
    plugins.push({
      dirName: entry.name,
      pluginKey: entry.name.slice(PLUGIN_DIR_PREFIX.length),
      dirPath,
      entryPath,
      entryUrl: pathToFileURL(entryPath).href
    });
  }
  return plugins.sort((a, b) => a.dirName.localeCompare(b.dirName));
}

// src/index.ts
var name = "my-dsh-plugins";
var ROOT_PACKAGE_NAME = "@local/my-dsh-plugins";
var LOG_PREFIX = "[my-dsh-plugins]";
var CONFIG_WATCH_DEBOUNCE_MS = 300;
var WATCHED_CONFIG_FILENAMES = /* @__PURE__ */ new Set([BASE_CONFIG_FILENAME, LOCAL_CONFIG_FILENAME]);
var fallbackLogger = {
  info: (...args) => console.info(LOG_PREFIX, ...args),
  warn: (...args) => console.warn(LOG_PREFIX, ...args),
  error: (...args) => console.error(LOG_PREFIX, ...args)
};
function resolveLogger(ctx) {
  let logger;
  try {
    logger = ctx?.logger?.(name);
  } catch {
    logger = void 0;
  }
  if (!logger) return fallbackLogger;
  const pick = (level) => typeof logger[level] === "function" ? (...args) => logger[level](...args) : fallbackLogger[level];
  return { info: pick("info"), warn: pick("warn"), error: pick("error") };
}
function isProjectRoot(dir) {
  try {
    const packagePath = path3.join(dir, "package.json");
    if (fs3.existsSync(packagePath)) {
      const raw = fs3.readFileSync(packagePath, "utf8").replace(/^\uFEFF/, "");
      if (JSON.parse(raw)?.name === ROOT_PACKAGE_NAME) return true;
    }
  } catch {
  }
  return fs3.existsSync(path3.join(dir, BASE_CONFIG_FILENAME));
}
function resolveProjectRoot() {
  let current = path3.dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (isProjectRoot(current)) return current;
    const parent = path3.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`${LOG_PREFIX} \u65E0\u6CD5\u5B9A\u4F4D\u9879\u76EE\u6839\u76EE\u5F55\uFF0C\u8BF7\u786E\u4FDD\u4ECE\u6709\u6548\u7684\u4ED3\u5E93\u5B89\u88C5\u6216\u8FD0\u884C`);
}
function warnUnknownPluginKeys(config, scanned, logger) {
  const known = new Set(scanned.map((plugin) => plugin.pluginKey));
  for (const key of Object.keys(config.plugins ?? {})) {
    if (known.has(key)) continue;
    const detected = known.size > 0 ? [...known].join("\u3001") : "\uFF08\u65E0\uFF09";
    logger.warn(`\u914D\u7F6E\u6587\u4EF6\u4E2D\u5305\u542B\u672A\u8BC6\u522B\u7684\u63D2\u4EF6\u9879 "${key}"\uFF0C\u5F53\u524D\u5DF2\u68C0\u6D4B\u5230\u7684\u5B50\u63D2\u4EF6\u4E3A: ${detected}`);
  }
}
async function importPluginDef(entryUrl) {
  const mod = await import(entryUrl);
  return mod.default ?? mod;
}
async function mountPlugin(ctx, plugin, pluginConfig, logger) {
  const pluginDef = await importPluginDef(plugin.entryUrl);
  try {
    const rawSchema = pluginDef?.Config ?? pluginDef?.SCHEMA_DICT ?? pluginDef?.schema;
    registerPluginSchema(plugin.pluginKey, rawSchema);
  } catch {
  }
  if (ctx.registry?.has?.(pluginDef)) return void 0;
  const fiber = await ctx.plugin(pluginDef, pluginConfig);
  if (fiber?.state !== void 0 && fiber.state !== 2) {
    logger.warn(
      `\u5B50\u63D2\u4EF6 ${plugin.pluginKey} \u88C5\u8F7D\u540E\u672A\u8FDB\u5165 ACTIVE \u72B6\u6001\uFF08state=${fiber.state}\uFF09\uFF0C\u53EF\u80FD\u5728\u7B49\u5F85\u4F9D\u8D56\u6CE8\u5165\uFF0C\u63D2\u4EF6\u5C1A\u672A\u771F\u6B63\u751F\u6548\u3002`
    );
  }
  return fiber;
}
async function apply(ctx, config) {
  const rootDir = resolveProjectRoot();
  const logger = resolveLogger(ctx);
  const scanned = scanPlugins(rootDir);
  const resolveLatest = () => (
    // 文件配置为最高权威，必须覆盖 DSH Profile Patch 传入的配置。
    deepMerge(resolveVolatileRefs(config) || {}, loadUmbrellaConfig(rootDir))
  );
  const mergedConfig = resolveLatest();
  if (scanned.length === 0) {
    logger.warn(
      `\u672A\u5728\u6839\u76EE\u5F55 ${rootDir} \u4E0B\u626B\u63CF\u5230\u4EFB\u4F55 dsh-* \u5B50\u63D2\u4EF6\uFF0C\u8BF7\u68C0\u67E5\u662F\u5426\u5DF2\u5B89\u88C5\u5B50\u63D2\u4EF6\uFF0C\u6216\u9879\u76EE\u6839\u76EE\u5F55\u5B9A\u4F4D\u662F\u5426\u6709\u8BEF\u3002`
    );
    return;
  }
  warnUnknownPluginKeys(mergedConfig, scanned, logger);
  const forks = /* @__PURE__ */ new Map();
  let currentConfig = mergedConfig;
  let currentScanned = scanned;
  for (const plugin of currentScanned) {
    const conf = getPluginConfig(currentConfig, plugin.pluginKey);
    if (!conf.enabled) continue;
    try {
      const fiber = await mountPlugin(ctx, plugin, conf.config, logger);
      if (fiber) forks.set(plugin.pluginKey, fiber);
    } catch (err) {
      logger.error(`\u5B50\u63D2\u4EF6 ${plugin.pluginKey} \u521D\u59CB\u5316\u5931\u8D25:`, err);
    }
  }
  let watcher;
  let timer;
  let active = true;
  const reload = async (source) => {
    if (!active) return;
    const latestScanned = scanPlugins(rootDir);
    const latestConfig = resolveLatest();
    if (latestScanned.length === 0) {
      logger.warn(
        `\u672A\u5728\u6839\u76EE\u5F55 ${rootDir} \u4E0B\u626B\u63CF\u5230\u4EFB\u4F55 dsh-* \u5B50\u63D2\u4EF6\uFF0C\u8BF7\u68C0\u67E5\u662F\u5426\u5DF2\u5B89\u88C5\u5B50\u63D2\u4EF6\uFF0C\u6216\u9879\u76EE\u6839\u76EE\u5F55\u5B9A\u4F4D\u662F\u5426\u6709\u8BEF\u3002`
      );
    } else {
      warnUnknownPluginKeys(latestConfig, latestScanned, logger);
    }
    const latestScannedKeys = new Set(latestScanned.map((p) => p.pluginKey));
    for (const [key, fiber] of forks) {
      if (!latestScannedKeys.has(key)) {
        try {
          forks.delete(key);
          fiber?.dispose?.();
          logger.info(`\u5B50\u63D2\u4EF6 ${key} \u76EE\u5F55\u5DF2\u79FB\u9664\uFF0C\u5DF2\u9500\u6BC1\u5B9E\u4F8B`);
        } catch (error) {
          logger.warn(`\u9500\u6BC1\u5DF2\u79FB\u9664\u5B50\u63D2\u4EF6 ${key} \u5931\u8D25:`, error);
        }
      }
    }
    for (const plugin of latestScanned) {
      const key = plugin.pluginKey;
      const wasEnabled = getPluginConfig(currentConfig, key).enabled;
      const next = getPluginConfig(latestConfig, key);
      try {
        if (wasEnabled && !next.enabled) {
          const fiber = forks.get(key);
          forks.delete(key);
          fiber?.dispose?.();
        } else if (!wasEnabled && next.enabled) {
          const fiber = await mountPlugin(ctx, plugin, next.config, logger);
          if (fiber) forks.set(key, fiber);
        } else if (wasEnabled && next.enabled) {
          if (!forks.has(key)) {
            const fiber = await mountPlugin(ctx, plugin, next.config, logger);
            if (fiber) forks.set(key, fiber);
          } else {
            forks.get(key)?.update?.(next.config);
          }
        }
      } catch (error) {
        logger.warn(`\u5B50\u63D2\u4EF6 ${key} \u70ED\u91CD\u8F7D\u5931\u8D25:`, error);
      }
    }
    currentScanned = latestScanned;
    currentConfig = latestConfig;
    logger.info(
      source === "settings" ? `\u8BBE\u7F6E\u8868\u5355\u53D8\u66F4\u5DF2\u751F\u6548\uFF0C\u5171 ${latestScanned.length} \u4E2A\u5B50\u63D2\u4EF6\u53C2\u4E0E\u70ED\u91CD\u8F7D` : `\u914D\u7F6E\u6587\u4EF6\u53D8\u66F4\u5DF2\u751F\u6548\uFF0C\u5171 ${latestScanned.length} \u4E2A\u5B50\u63D2\u4EF6\u53C2\u4E0E\u70ED\u91CD\u8F7D`
    );
  };
  let reloadQueue = Promise.resolve();
  const queueReload = (source) => {
    reloadQueue = reloadQueue.then(() => reload(source)).catch((error) => {
      logger.warn(`\u5B50\u63D2\u4EF6\u70ED\u91CD\u8F7D\u961F\u5217\u6267\u884C\u5F02\u5E38 (${source}):`, error);
    });
  };
  try {
    watcher = fs3.watch(rootDir, (_eventType, filename) => {
      if (filename && !WATCHED_CONFIG_FILENAMES.has(String(filename)) && !String(filename).startsWith("dsh-")) {
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = void 0;
        queueReload("file");
      }, CONFIG_WATCH_DEBOUNCE_MS);
      timer.unref?.();
    });
    watcher.unref?.();
    watcher.on?.("error", (error) => {
      logger.warn("\u914D\u7F6E\u6587\u4EF6\u70ED\u91CD\u8F7D\u76D1\u542C\u5DF2\u4E2D\u65AD\uFF0C\u914D\u7F6E\u53D8\u66F4\u9700\u91CD\u542F\u540E\u751F\u6548:", error);
    });
  } catch (error) {
    logger.warn("\u914D\u7F6E\u6587\u4EF6\u70ED\u91CD\u8F7D\u76D1\u542C\u542F\u52A8\u5931\u8D25\uFF0C\u914D\u7F6E\u53D8\u66F4\u9700\u91CD\u542F\u540E\u751F\u6548:", error);
  }
  try {
    ctx.on?.("loader/volatile-update", (paths) => {
      logger.info(`\u8BBE\u7F6E\u8868\u5355\u66F4\u65B0\u4E86\u914D\u7F6E\u5B57\u6BB5: ${JSON.stringify(paths)}`);
      queueReload("settings");
    });
  } catch (error) {
    logger.warn("\u8BBE\u7F6E\u8868\u5355\u8054\u52A8\u76D1\u542C\u6CE8\u518C\u5931\u8D25\uFF0C\u8868\u5355\u53D8\u66F4\u9700\u91CD\u542F\u540E\u751F\u6548:", error);
  }
  const cleanup = () => {
    active = false;
    if (timer) {
      clearTimeout(timer);
      timer = void 0;
    }
    watcher?.close();
    watcher = void 0;
    for (const [key, fiber] of forks) {
      try {
        fiber?.dispose?.();
      } catch (err) {
        logger.warn(`\u6E05\u7406\u5B50\u63D2\u4EF6 ${key} Fiber \u5931\u8D25:`, err);
      }
    }
    forks.clear();
  };
  try {
    if (typeof ctx?.effect === "function") {
      ctx.effect(() => cleanup);
    } else if (typeof ctx?.on === "function") {
      ctx.on("dispose", cleanup);
    }
  } catch {
    try {
      if (typeof ctx?.on === "function") {
        ctx.on("dispose", cleanup);
      }
    } catch {
    }
  }
}
export {
  Config,
  apply,
  name,
  resolveProjectRoot
};
