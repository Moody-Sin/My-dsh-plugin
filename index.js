// src/index.ts
import fs3 from "node:fs";
import path3 from "node:path";
import { fileURLToPath } from "node:url";

// src/config.ts
import fs from "node:fs";
import path from "node:path";
var BASE_CONFIG_FILENAME = "plugins.config.json";
var LOCAL_CONFIG_FILENAME = "plugins.config.local.json";
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
function readJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
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
function scanPlugins(rootDir) {
  let entries;
  try {
    entries = fs2.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const plugins = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
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
function resolveProjectRoot() {
  const currentDir = path3.dirname(fileURLToPath(import.meta.url));
  const candidates = [currentDir, path3.dirname(currentDir)];
  for (const candidate of candidates) {
    if (fs3.existsSync(path3.join(candidate, "package.json"))) return candidate;
  }
  return process.cwd();
}
async function apply(ctx, config) {
  const rootDir = resolveProjectRoot();
  const fileConfig = loadUmbrellaConfig(rootDir);
  const mergedConfig = deepMerge(config || {}, fileConfig);
  const scanned = scanPlugins(rootDir);
  if (scanned.length === 0) {
    console.warn(
      `[my-dsh-plugins] \u672A\u5728\u6839\u76EE\u5F55 ${rootDir} \u4E0B\u626B\u63CF\u5230\u4EFB\u4F55 dsh-* \u5B50\u63D2\u4EF6\uFF0C\u8BF7\u68C0\u67E5\u662F\u5426\u5DF2\u5B89\u88C5\u5B50\u63D2\u4EF6\uFF0C\u6216\u9879\u76EE\u6839\u76EE\u5F55\u5B9A\u4F4D\u662F\u5426\u6709\u8BEF\u3002`
    );
    return;
  }
  for (const plugin of scanned) {
    const conf = getPluginConfig(mergedConfig, plugin.pluginKey);
    if (!conf.enabled) continue;
    try {
      const mod = await import(plugin.entryUrl);
      const pluginDef = mod.default ?? mod;
      if (ctx.registry?.has?.(pluginDef)) continue;
      const fiber = await ctx.plugin(pluginDef, conf.config);
      if (fiber?.state !== void 0 && fiber.state !== 2) {
        console.warn(
          `[my-dsh-plugins] \u5B50\u63D2\u4EF6 ${plugin.pluginKey} \u88C5\u8F7D\u540E\u672A\u8FDB\u5165 ACTIVE \u72B6\u6001\uFF08state=${fiber.state}\uFF09\uFF0C\u53EF\u80FD\u5728\u7B49\u5F85\u4F9D\u8D56\u6CE8\u5165\uFF0C\u63D2\u4EF6\u5C1A\u672A\u771F\u6B63\u751F\u6548\u3002`
        );
      }
    } catch (err) {
      console.warn(`[my-dsh-plugins] \u5B50\u63D2\u4EF6 ${plugin.pluginKey} \u521D\u59CB\u5316\u5931\u8D25:`, err);
    }
  }
}
export {
  Config,
  apply,
  name,
  resolveProjectRoot
};
