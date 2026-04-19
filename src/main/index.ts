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
import { appendFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { pathToFileURL } from "url";

import { initCsp } from "./csp";
import { ensureSafePath } from "./ipcMain";
import { RendererSettings } from "./settings";
import { IS_VANILLA, THEMES_DIR } from "./utils/constants";
import { installExt } from "./utils/extensions";

let hasInstalledCrashHandlers = false;

function resolveRuntimeDataDir() {
    return process.env.RECORD_USER_DATA_DIR
        ?? process.env.VENCORD_USER_DATA_DIR
        ?? (app.isReady() ? app.getPath("userData") : join(__dirname, ".."));
}

function writeCrashLog(source: string, error: unknown) {
    try {
        const now = new Date().toISOString();
        const details = error instanceof Error
            ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
            : typeof error === "string"
                ? error
                : JSON.stringify(error, null, 2);

        const logPath = join(resolveRuntimeDataDir(), "logs", "record-crash.log");
        mkdirSync(dirname(logPath), { recursive: true });
        appendFileSync(logPath, `[${now}] ${source}\n${details}\n\n`, "utf8");
    } catch {
        // Ignore logger failures to avoid interfering with app startup.
    }
}

function installCrashHandlers() {
    if (hasInstalledCrashHandlers) return;
    hasInstalledCrashHandlers = true;

    process.on("uncaughtException", error => {
        writeCrashLog("uncaughtException", error);
        console.error("[ReCord] uncaughtException", error);
    });

    process.on("unhandledRejection", reason => {
        writeCrashLog("unhandledRejection", reason);
        console.error("[ReCord] unhandledRejection", reason);
    });
}

if (IS_VESKTOP || !IS_VANILLA) {
    installCrashHandlers();

    app.whenReady().then(() => {
        const userDataDir = process.env.RECORD_USER_DATA_DIR ?? process.env.VENCORD_USER_DATA_DIR ?? join(__dirname, "..");
        const assetsDir = join(userDataDir, "Images");

        app.on("render-process-gone", (_event, webContents, details) => {
            writeCrashLog("render-process-gone", {
                reason: details.reason,
                exitCode: details.exitCode,
                webContentsId: webContents.id
            });
        });

        app.on("child-process-gone", (_event, details) => {
            writeCrashLog("child-process-gone", {
                type: details.type,
                reason: details.reason,
                exitCode: details.exitCode,
                serviceName: details.serviceName,
                name: details.name
            });
        });

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
