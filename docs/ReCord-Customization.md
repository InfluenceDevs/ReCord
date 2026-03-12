# ReCord Customization

## Custom Plugins

ReCord supports custom source plugins through `src/userplugins`.

- Open the folder from ReCord Settings -> Quick Actions -> Open UserPlugins Folder.
- Add your plugin as `.ts`/`.tsx`.
- Use `definePlugin({...})` and export it as default.
- Rebuild ReCord with `pnpm build` or use `pnpm dev` while developing.

## BetterDiscord-Style CSS

ReCord keeps the original QuickCSS and theme import behavior from Vencord, so BetterDiscord CSS files are supported.

Options:

- Quick edits: ReCord Settings -> Edit QuickCSS.
- File-based themes: place `.css` files in your themes folder and enable them in Themes.
- Remote themes: paste theme URLs in theme links (`@light` / `@dark` prefixes are supported).

Starter QuickCSS snippet:

```css
/* ReCord blurple glass panel */
.sidebar-1tnWFu,
.panels-3wFtMD {
    background: linear-gradient(
        180deg,
        rgb(88 101 242 / 20%),
        rgb(88 101 242 / 8%)
    );
    backdrop-filter: blur(8px);
}
```

## Credits

- ReCord rebrand and fork setup: Rloxx
- Original base project: Vendicated and Vencord contributors
