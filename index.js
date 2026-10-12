// src/index.ts
import fs3 from "node:fs";
import path3 from "node:path";
import { fileURLToPath } from "node:url";

// src/config.ts
import fs from "node:fs";
import path from "node:path";
var BASE_CONFIG_FILENAME = "plugins.config.json";
var LOCAL_CONFIG_FILENAME = "plugins.config.local.json";
var ENV_PLACEHOLDER_PATTERN = /\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)\}/g;
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function clonePlain(value) {
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
  return raw.replace(ENV_PLACEHOLDER_PATTERN, (placeholder, varName) => {
    const value = process.env[varName];
    return value === void 0 ? placeholder : value;
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
var Config = {
  "~standard": {
    version: 1,
    vendor: "schemastery",
    validate(value) {
      return { value: isPlainObject(value) ? value : {} };
    }
  }
};

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
  const fileConfig = loadUmbrellaConfig(rootDir);
  const mergedConfig = deepMerge(config || {}, fileConfig);
  const scanned = scanPlugins(rootDir);
  if (scanned.length === 0) {
    logger.warn(
      `\u672A\u5728\u6839\u76EE\u5F55 ${rootDir} \u4E0B\u626B\u63CF\u5230\u4EFB\u4F55 dsh-* \u5B50\u63D2\u4EF6\uFF0C\u8BF7\u68C0\u67E5\u662F\u5426\u5DF2\u5B89\u88C5\u5B50\u63D2\u4EF6\uFF0C\u6216\u9879\u76EE\u6839\u76EE\u5F55\u5B9A\u4F4D\u662F\u5426\u6709\u8BEF\u3002`
    );
    return;
  }
  warnUnknownPluginKeys(mergedConfig, scanned, logger);
  const forks = /* @__PURE__ */ new Map();
  let currentConfig = mergedConfig;
  for (const plugin of scanned) {
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
  const reload = async () => {
    if (!active) return;
    const latestConfig = deepMerge(config || {}, loadUmbrellaConfig(rootDir));
    for (const plugin of scanned) {
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
          forks.get(key)?.update?.(next.config);
        }
      } catch (error) {
        logger.warn(`\u5B50\u63D2\u4EF6 ${key} \u70ED\u91CD\u8F7D\u5931\u8D25:`, error);
      }
    }
    currentConfig = latestConfig;
    logger.info(`\u914D\u7F6E\u6587\u4EF6\u53D8\u66F4\u5DF2\u751F\u6548\uFF0C\u5171 ${scanned.length} \u4E2A\u5B50\u63D2\u4EF6\u53C2\u4E0E\u70ED\u91CD\u8F7D`);
  };
  try {
    watcher = fs3.watch(rootDir, (_eventType, filename) => {
      if (filename && !WATCHED_CONFIG_FILENAMES.has(String(filename))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = void 0;
        void reload();
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
  ctx.on?.("dispose", () => {
    active = false;
    if (timer) {
      clearTimeout(timer);
      timer = void 0;
    }
    watcher?.close();
    watcher = void 0;
  });
}
export {
  Config,
  apply,
  name,
  resolveProjectRoot
};
