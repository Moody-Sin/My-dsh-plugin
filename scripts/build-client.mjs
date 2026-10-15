import esbuild from 'esbuild';

esbuild.buildSync({
  entryPoints: ['src/client.tsx'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  external: ['react', 'react-dom'],
  banner: {
    js: `(function() {
  const PLUGIN_ID = "@local/my-dsh-plugins";
  const w = typeof window !== "undefined" ? window : globalThis;
  if (!w) return;
  if (w.__my_dsh_plugins_registered__) return;
  w.__my_dsh_plugins_registered__ = true;
  const ml = w.__ModuleLoader__;
  if (ml && typeof ml.load === "function") {
    const alreadyQueued =
      ml.mode === "queue" &&
      Array.isArray(ml.pendingQueue) &&
      ml.pendingQueue.some((reg) => reg.id === PLUGIN_ID);
    if (!alreadyQueued) {
      ml.load({
        id: PLUGIN_ID,
        factory: (require) => {
          var module = { exports: {} };
          var exports = module.exports;`,
  },
  footer: {
    js: `          return module.exports;
        }
      });
    }
  }
})();`,
  },
  outfile: 'client.js',
});
