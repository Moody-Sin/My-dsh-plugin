// src/index.ts
import fs4 from "node:fs";
import path4 from "node:path";
import { fileURLToPath } from "node:url";

// src/api.ts
import fs2 from "node:fs";
import path2 from "node:path";

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
    dict: {}
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
  if (!node.meta || typeof node.meta !== "object") node.meta = {};
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
  const source = schemaOrDict;
  if (source && (typeof source === "object" || typeof source === "function")) {
    const dict = source.dict ?? (typeof source === "function" ? void 0 : source);
    if (dict && typeof dict === "object") {
      const fields = dict;
      const nodeToAttach = {
        type: "object",
        description: source.description || `${pluginKey} \u63D2\u4EF6\u914D\u7F6E`,
        meta: { ...source.meta || {} },
        // 确保包含 enabled 开关（聚合总线用 `enabled` 控制子插件装载，必须始终可编辑）
        dict: fields.enabled ? fields : {
          enabled: {
            type: "boolean",
            description: `\u542F\u7528 ${pluginKey} \u63D2\u4EF6`,
            meta: { volatile: true }
          },
          ...fields
        }
      };
      attachToJSON(nodeToAttach);
      pluginsDict[pluginKey] = nodeToAttach;
      return;
    }
  }
  if (!pluginsDict[pluginKey]) {
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
      result[key] = child ? materializeVolatile(item, child) : materializeUndeclared(item);
    }
    for (const [key, child] of Object.entries(node.dict)) {
      if (!(key in result)) result[key] = materializeVolatile(void 0, child);
    }
    return result;
  }
  return clonePlain(value);
}
function materializeUndeclared(value) {
  if (Array.isArray(value)) return value.map(materializeUndeclared);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, materializeUndeclared(item)])
    );
  }
  try {
    return createVolatileRef(value);
  } catch {
    return value;
  }
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

// src/api.ts
var SECRET_FIELD_NAMES = /* @__PURE__ */ new Set(["secret", "token", "password", "apiKey", "api_key"]);
var SECRET_MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value === null || typeof value !== "object") return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_FIELD_NAMES.has(key) && typeof item === "string" && item !== "") {
      result[key] = SECRET_MASK;
    } else {
      result[key] = redactSecrets(item);
    }
  }
  return result;
}
function restoreSecrets(incoming, existing) {
  if (Array.isArray(incoming)) {
    return Array.isArray(existing) ? incoming.map((item, index) => restoreSecrets(item, existing[index])) : incoming;
  }
  if (incoming === null || typeof incoming !== "object") return incoming;
  if (existing === null || typeof existing !== "object") return incoming;
  const result = {};
  for (const [key, item] of Object.entries(incoming)) {
    if (SECRET_FIELD_NAMES.has(key) && item === SECRET_MASK) {
      if (typeof existing[key] === "string" && existing[key] !== "") {
        result[key] = existing[key];
        continue;
      }
      result[key] = "";
      continue;
    }
    result[key] = restoreSecrets(item, existing[key]);
  }
  return result;
}
function readMergedConfig(projectRoot) {
  let base = {};
  let local = {};
  const basePath = path2.join(projectRoot, BASE_CONFIG_FILENAME);
  const localPath = path2.join(projectRoot, LOCAL_CONFIG_FILENAME);
  if (fs2.existsSync(basePath)) {
    try {
      const raw = fs2.readFileSync(basePath, "utf8").replace(/^\uFEFF/, "");
      base = JSON.parse(raw);
    } catch {
      base = {};
    }
  }
  if (fs2.existsSync(localPath)) {
    try {
      const raw = fs2.readFileSync(localPath, "utf8").replace(/^\uFEFF/, "");
      local = JSON.parse(raw);
    } catch {
      local = {};
    }
  }
  const merged = deepMerge(base, local);
  return {
    base: redactSecrets(base),
    local: redactSecrets(local),
    merged: redactSecrets(merged)
  };
}
function writeConfigFile(projectRoot, target, partialConfig) {
  const filename = target === "base" ? BASE_CONFIG_FILENAME : LOCAL_CONFIG_FILENAME;
  const filePath = path2.join(projectRoot, filename);
  let existing = {};
  if (fs2.existsSync(filePath)) {
    try {
      const raw = fs2.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
      existing = JSON.parse(raw);
    } catch {
      existing = {};
    }
  }
  const next = deepMerge(existing, restoreSecrets(partialConfig, existing));
  const serialized = JSON.stringify(next, null, 2) + "\n";
  const tmpPath = path2.join(projectRoot, `.${filename}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs2.writeFileSync(tmpPath, serialized, "utf8");
  fs2.renameSync(tmpPath, filePath);
}
async function handleFetchRequest(request, ctx) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (pathname === "/api/local-plugins/config" && request.method === "GET") {
    try {
      const configData = readMergedConfig(ctx.projectRoot);
      return new Response(JSON.stringify(configData), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: err?.message || String(err) }),
        {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8" }
        }
      );
    }
  }
  if (pathname === "/api/local-plugins/config" && request.method === "POST") {
    try {
      const body = await request.json();
      const target = body?.target === "base" ? "base" : "local";
      const config = body?.config || {};
      writeConfigFile(ctx.projectRoot, target, config);
      ctx.onConfigSaved?.();
      return new Response(JSON.stringify({ ok: true, target }), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: err?.message || String(err) }),
        {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8" }
        }
      );
    }
  }
  if (pathname === "/api/local-plugins/test-notify" && request.method === "POST") {
    try {
      let result = { ok: true, message: "\u901A\u77E5\u6D4B\u8BD5\u5DF2\u53D1\u9001" };
      if (typeof ctx.triggerTestNotify === "function") {
        result = await ctx.triggerTestNotify();
      }
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: err?.message || String(err) }),
        {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8" }
        }
      );
    }
  }
  return new Response("Not Found", { status: 404 });
}

// src/scanner.ts
import fs3 from "node:fs";
import path3 from "node:path";
import { pathToFileURL } from "node:url";
var PLUGIN_DIR_PREFIX = "dsh-";
function resolvePackageEntry(dirPath) {
  const packagePath = path3.join(dirPath, "package.json");
  if (!fs3.existsSync(packagePath)) return void 0;
  let pkg;
  try {
    const raw = fs3.readFileSync(packagePath, "utf8").replace(/^\uFEFF/, "");
    pkg = JSON.parse(raw);
  } catch (error) {
    console.warn(`[my-dsh-plugins] \u5B50\u63D2\u4EF6 ${path3.basename(dirPath)} \u7684 package.json \u89E3\u6790\u5931\u8D25\uFF0C\u5DF2\u8DF3\u8FC7:`, error);
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
  const indexFile = path3.join(dirPath, "index.js");
  if (fs3.existsSync(indexFile)) return indexFile;
  const declared = resolvePackageEntry(dirPath);
  if (declared === void 0) return void 0;
  const entryPath = path3.resolve(dirPath, declared);
  return fs3.existsSync(entryPath) ? entryPath : void 0;
}
function isDirectoryEntry(rootDir, entry) {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return fs3.statSync(path3.join(rootDir, entry.name), { throwIfNoEntry: false })?.isDirectory() === true;
  } catch {
    return false;
  }
}
function scanPlugins(rootDir) {
  let entries;
  try {
    entries = fs3.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const plugins = [];
  for (const entry of entries) {
    if (!isDirectoryEntry(rootDir, entry)) continue;
    if (!entry.name.startsWith(PLUGIN_DIR_PREFIX)) continue;
    const dirPath = path3.join(rootDir, entry.name);
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
    const packagePath = path4.join(dir, "package.json");
    if (fs4.existsSync(packagePath)) {
      const raw = fs4.readFileSync(packagePath, "utf8").replace(/^\uFEFF/, "");
      if (JSON.parse(raw)?.name === ROOT_PACKAGE_NAME) return true;
    }
  } catch {
  }
  return fs4.existsSync(path4.join(dir, BASE_CONFIG_FILENAME));
}
function resolveProjectRoot() {
  let current = path4.dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (isProjectRoot(current)) return current;
    const parent = path4.dirname(current);
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
    const shouldReload = (filename) => {
      if (!filename) return false;
      if (WATCHED_CONFIG_FILENAMES.has(filename)) return true;
      if (!filename.startsWith("dsh-")) return false;
      const stillDirectory = fs4.statSync(path4.join(rootDir, filename), { throwIfNoEntry: false })?.isDirectory() === true;
      const wasScanned = currentScanned.some((plugin) => plugin.dirName === filename);
      return stillDirectory !== wasScanned;
    };
    watcher = fs4.watch(rootDir, (_eventType, filename) => {
      if (!shouldReload(filename ? String(filename) : void 0)) return;
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
  try {
    const apiHandlerContext = {
      projectRoot: rootDir,
      logger,
      onConfigSaved: () => {
        logger.info("\u6536\u5230\u8BBE\u7F6E UI \u914D\u7F6E\u66F4\u65B0\uFF0C\u89E6\u53D1\u70ED\u91CD\u8F7D...");
        queueReload("file");
      },
      // 「⚡ 发送测试通知」按钮：必须真实连通通知渠道，绝不能返回假成功。
      // 总持有该子插件的模块定义，直接调用其导出的诊断函数，
      // 从而与用户当前生效的文件配置完全一致（含 local 私有覆盖）。
      triggerTestNotify: async () => {
        const plugin = scanPlugins(rootDir).find((item) => item.pluginKey === "notifier");
        if (!plugin) {
          return { ok: false, message: "\u672A\u626B\u63CF\u5230\u901A\u77E5\u63D2\u4EF6 dsh-notifier" };
        }
        const conf = getPluginConfig(resolveLatest(), "notifier");
        if (!conf.enabled) {
          return { ok: false, message: "\u901A\u77E5\u63D2\u4EF6\u5F53\u524D\u5DF2\u7981\u7528\uFF0C\u8BF7\u5148\u542F\u7528\u540E\u518D\u6D4B\u8BD5" };
        }
        const pluginDef = await importPluginDef(plugin.entryUrl);
        if (typeof pluginDef?.sendTestNotification !== "function") {
          return { ok: false, message: "\u901A\u77E5\u63D2\u4EF6\u672A\u5BFC\u51FA\u8BCA\u65AD\u5165\u53E3 sendTestNotification" };
        }
        return await pluginDef.sendTestNotification(conf.config);
      }
    };
    const registerConnectionRoutes = (connCtx) => {
      try {
        const fetchRegistry = connCtx?.connection?.fetch;
        if (typeof fetchRegistry?.register === "function") {
          connCtx.effect?.(() => {
            const unregisterConfig = fetchRegistry.register({
              path: "/api/local-plugins/config",
              methods: ["GET", "POST"],
              requestBody: "buffered",
              fetch: (request) => handleFetchRequest(request, apiHandlerContext)
            });
            const unregisterTest = fetchRegistry.register({
              path: "/api/local-plugins/test-notify",
              methods: ["POST"],
              requestBody: "buffered",
              fetch: (request) => handleFetchRequest(request, apiHandlerContext)
            });
            return () => {
              unregisterConfig?.();
              unregisterTest?.();
            };
          });
        }
      } catch (err) {
        logger.warn("\u6CE8\u518C connection.fetch \u8DEF\u7531\u5931\u8D25:", err);
      }
    };
    if (typeof ctx?.inject === "function") {
      ctx.inject(["connection"], registerConnectionRoutes);
    } else {
      if (typeof ctx?.connection?.fetch?.register === "function") {
        registerConnectionRoutes(ctx);
      }
    }
    const clientBundlePath = fs4.existsSync(path4.join(rootDir, "client.js")) ? path4.join(rootDir, "client.js") : path4.join(path4.dirname(fileURLToPath(import.meta.url)), "client.js");
    const onIndexInject = (table) => {
      try {
        if (!Array.isArray(table)) return;
        const alreadyInjected = table.some(
          (row) => row?.kind === "script" && typeof row?.text === "string" && row.text.includes("@local/my-dsh-plugins")
        );
        if (alreadyInjected) return;
        if (fs4.existsSync(clientBundlePath)) {
          const clientCode = fs4.readFileSync(clientBundlePath, "utf8");
          table.push({
            kind: "script",
            placement: "body",
            text: clientCode
          });
        }
      } catch (err) {
        logger.warn("\u6CE8\u5165\u8BBE\u7F6E UI \u5BA2\u6237\u7AEF\u811A\u672C\u5931\u8D25:", err);
      }
    };
    if (typeof ctx?.effect === "function") {
      ctx.effect(() => {
        const unlisten = ctx.on("webserver/index-inject", onIndexInject);
        return () => {
          unlisten?.();
        };
      });
    } else {
      ctx.on?.("webserver/index-inject", onIndexInject);
    }
  } catch (error) {
    logger.warn("\u6CE8\u518C Web API \u4E0E\u811A\u672C\u6CE8\u5165\u5F02\u5E38:", error);
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
