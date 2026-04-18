/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { app, net, protocol } from "electron";
import { join } from "path";
import { pathToFileURL } from "url";

import { initCsp } from "./csp";
import { ensureSafePath } from "./ipcMain";
import { RendererSettings } from "./settings";
import { IS_VANILLA, THEMES_DIR } from "./utils/constants";
import { installExt } from "./utils/extensions";

if (IS_VESKTOP || !IS_VANILLA) {
    app.whenReady().then(() => {
        const userDataDir = process.env.RECORD_USER_DATA_DIR ?? process.env.VENCORD_USER_DATA_DIR ?? join(__dirname, "..");
        const assetsDir = join(userDataDir, "Images");

        protocol.handle("vencord", ({ url: unsafeUrl }) => {
            try {
                let url = decodeURI(unsafeUrl).slice("vencord://".length).replace(/\?v=\d+$/, "");

                if (url.endsWith("/")) url = url.slice(0, -1);

                // Some callers use vencord://assets/x while others may use vencord:///assets/x.
                if (!url.startsWith("/")) url = `/${url}`;

                if (url.startsWith("/assets/")) {
                    const assetPath = url.slice("/assets/".length);
                    const safeUrl = ensureSafePath(assetsDir, assetPath);
                    if (!safeUrl) {
                        return new Response(null, {
                            status: 404
                        });
                    }

                    return net.fetch(pathToFileURL(safeUrl).toString());
                }

                if (url.startsWith("/themes/")) {
                    const theme = url.slice("/themes/".length);

                    const safeUrl = ensureSafePath(THEMES_DIR, theme);
                    if (!safeUrl) {
                        return new Response(null, {
                            status: 404
                        });
                    }

                    return net.fetch(pathToFileURL(safeUrl).toString());
                }

                // Source Maps! Maybe there's a better way but since the renderer is executed
                // from a string I don't think any other form of sourcemaps would work

                switch (url) {
                    case "renderer.js.map":
                    case "vencordDesktopRenderer.js.map":
                    case "preload.js.map":
                    case "vencordDesktopPreload.js.map":
                    case "patcher.js.map":
                    case "vencordDesktopMain.js.map":
                        return net.fetch(pathToFileURL(join(__dirname, url)).toString());
                    default:
                        return new Response(null, {
                            status: 404
                        });
                }
            } catch (err) {
                console.error("[ReCord] Failed to handle vencord:// request", unsafeUrl, err);
                return new Response(null, {
                    status: 500
                });
            }
        });

        try {
            if (RendererSettings.store.enableReactDevtools)
                installExt("fmkadmapgofadopljbjfkapdkoienihi")
                    .then(() => console.info("[ReCord] Installed React Developer Tools"))
                    .catch(err => console.error("[ReCord] Failed to install React Developer Tools", err));
        } catch { }


        initCsp();
    });
}

if (IS_DISCORD_DESKTOP) {
    require("./patcher");
}
