// src/index.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// src/config.ts
function resolveConfig(raw) {
  if (typeof raw !== "object" || raw === null) {
    return { enabled: true };
  }
  const conf = raw;
  return {
    enabled: conf.enabled ?? true
  };
}

// src/index.ts
var name = "subagent-model-indicator";
var inject = [];
function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig);
  if (!config.enabled) return;
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const clientBundlePath = fs.existsSync(path.join(currentDir, "client.js")) ? path.join(currentDir, "client.js") : path.join(currentDir, "..", "client.js");
  const onIndexInject = (table) => {
    try {
      if (!Array.isArray(table)) return;
      const alreadyInjected = table.some(
        (row) => row?.kind === "script" && typeof row?.text === "string" && row.text.includes("@local/dsh-subagent-model-indicator")
      );
      if (alreadyInjected) return;
      if (fs.existsSync(clientBundlePath)) {
        const clientCode = fs.readFileSync(clientBundlePath, "utf8");
        table.push({
          kind: "script",
          placement: "body",
          text: clientCode
        });
      }
    } catch (err) {
      ctx.logger?.warn?.("[dsh-subagent-model-indicator] \u6CE8\u5165\u524D\u7AEF\u811A\u672C\u5931\u8D25:", err);
    }
  };
  const cleanup = () => {
  };
  try {
    if (typeof ctx?.effect === "function") {
      ctx.effect(() => {
        const unlisten = ctx.on("webserver/index-inject", onIndexInject);
        return () => {
          unlisten?.();
          cleanup();
        };
      });
    } else if (typeof ctx?.on === "function") {
      ctx.on("webserver/index-inject", onIndexInject);
      ctx.on("dispose", cleanup);
    }
  } catch {
    try {
      ctx.on?.("webserver/index-inject", onIndexInject);
    } catch {
    }
  }
}
export {
  apply,
  inject,
  name
};
