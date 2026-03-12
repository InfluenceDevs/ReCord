# ReCord UserPlugins

Drop custom plugin source files in this folder to include them in local ReCord builds.

Rules:

- Use `index.ts` or `index.tsx` inside a folder, or a direct `.ts/.tsx` file.
- Export a default `definePlugin({...})` plugin.
- Prefix helper files with `_` to skip automatic plugin loading.

Quick flow:

1. Create a plugin file/folder in `src/userplugins`.
2. Run `pnpm build` (or `pnpm dev` while developing).
3. Enable your plugin in ReCord Settings -> Plugins.
