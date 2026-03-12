/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { Devs } from "@utils/constants";
import { createAndAppendStyle } from "@utils/css";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { Alerts, showToast, Toasts } from "@webpack/common";

const logger = new Logger("BetterDiscordCompat");
const Native = VencordNative.pluginHelpers.BetterDiscordCompat as PluginNative<typeof import("./native")>;

type LoadedPlugin = {
    fileName: string;
    pluginName: string;
    instance: any;
};

const loadedPlugins = new Map<string, LoadedPlugin>();
const injectedCss = new Map<string, HTMLStyleElement>();

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable BetterDiscord plugin compatibility layer",
        default: false
    },
    autoLoad: {
        type: OptionType.BOOLEAN,
        description: "Auto-load plugins from ReCord bdplugins folder on startup",
        default: true
    },
    showLoadToasts: {
        type: OptionType.BOOLEAN,
        description: "Show toast notifications while loading BetterDiscord plugins",
        default: true
    }
});

function toast(msg: string, type = Toasts.Type.MESSAGE) {
    if (!settings.store.showLoadToasts) return;
    showToast(msg, type);
}

function makeBdApi(pluginName: string) {
    return {
        showToast(content: string, opts?: { type?: "info" | "success" | "error"; }) {
            const type = opts?.type === "error"
                ? Toasts.Type.FAILURE
                : opts?.type === "success"
                    ? Toasts.Type.SUCCESS
                    : Toasts.Type.MESSAGE;

            showToast(content, type);
        },

        alert(title: string, content: string) {
            Alerts.show({ title, body: content, confirmText: "OK", cancelText: null as any });
        },

        injectCSS(id: string, css: string) {
            const key = `${pluginName}:${id}`;
            let style = injectedCss.get(key);
            if (!style) {
                style = createAndAppendStyle(`bd-css-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`, managedStyleRootNode);
                injectedCss.set(key, style);
            }
            style.textContent = css;
        },

        clearCSS(id: string) {
            const key = `${pluginName}:${id}`;
            const style = injectedCss.get(key);
            style?.remove();
            injectedCss.delete(key);
        },

        saveData(key: string, value: any) {
            localStorage.setItem(`ReCord.BD.${pluginName}.${key}`, JSON.stringify(value));
        },

        loadData(key: string) {
            const raw = localStorage.getItem(`ReCord.BD.${pluginName}.${key}`);
            if (!raw) return null;

            try {
                return JSON.parse(raw);
            } catch {
                return raw;
            }
        },

        deleteData(key: string) {
            localStorage.removeItem(`ReCord.BD.${pluginName}.${key}`);
        }
    };
}

function stopLoadedPlugins() {
    for (const loaded of loadedPlugins.values()) {
        try {
            loaded.instance?.stop?.();
        } catch (err) {
            logger.error(`Failed to stop BD plugin ${loaded.pluginName}`, err);
        }
    }

    loadedPlugins.clear();

    for (const style of injectedCss.values()) {
        style.remove();
    }
    injectedCss.clear();
}

async function loadSinglePlugin(fileName: string) {
    const source = await Native.readPluginFile(fileName);
    if (!source) return;

    try {
        const module = { exports: {} as any };
        const { exports } = module;
        const pluginName = fileName.replace(/\.plugin\.js$/i, "").replace(/\.js$/i, "");
        const BdApi = makeBdApi(pluginName);

        (window as any).BdApi = BdApi;

        const fn = new Function("module", "exports", "BdApi", "window", `${source}\n;return module.exports;`);
        const pluginExport = fn(module, exports, BdApi, window) ?? module.exports;

        let instance: any = pluginExport;
        if (typeof pluginExport === "function") {
            try {
                instance = new pluginExport();
            } catch {
                instance = pluginExport;
            }
        }

        if (instance?.start) {
            await instance.start();
        }

        loadedPlugins.set(fileName, { fileName, pluginName, instance });
        toast(`Loaded BD plugin: ${pluginName}`);
        logger.info(`Loaded BetterDiscord plugin ${pluginName}`);
    } catch (err) {
        logger.error(`Failed to load BD plugin file ${fileName}`, err);
        toast(`Failed to load BD plugin: ${fileName}`, Toasts.Type.FAILURE);
    }
}

async function loadAllPlugins() {
    stopLoadedPlugins();

    if (!settings.store.enabled || IS_WEB) return;

    const files = await Native.listPluginFiles();
    for (const file of files) {
        await loadSinglePlugin(file);
    }

    if (!files.length && settings.store.showLoadToasts) {
        showToast("No BD plugins found. Put .plugin.js files into the bdplugins folder.", Toasts.Type.MESSAGE);
    }
}

export default definePlugin({
    name: "BetterDiscordCompat",
    description: "Experimental BetterDiscord plugin compatibility layer (limited API subset)",
    authors: [Devs.Ven],
    settings,

    async start() {
        if (IS_WEB) return;
        if (settings.store.enabled && settings.store.autoLoad) {
            await loadAllPlugins();
        }
    },

    stop() {
        stopLoadedPlugins();
    },

    async reloadPlugins() {
        await loadAllPlugins();
    },

    getLoadedPluginNames() {
        return Array.from(loadedPlugins.values()).map(p => p.pluginName);
    },

    async getInstalledPluginFiles() {
        return Native.listPluginFiles();
    },

    flux: {
        SETTINGS_UPDATE: async () => {
            if (IS_WEB) return;
            if (settings.store.enabled && settings.store.autoLoad) {
                await loadAllPlugins();
            } else {
                stopLoadedPlugins();
            }
        }
    }
});
