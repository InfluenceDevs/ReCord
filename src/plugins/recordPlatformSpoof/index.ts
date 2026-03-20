/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";

const logger = new Logger("RecordPlatformSpoof");
const Influence = { name: "Influence", id: 0n };

// ─── Platform profiles ────────────────────────────────────────────────────────

interface PlatformProfile {
    os: string;
    browser: string;
    device: string;
}

const PROFILES: Record<string, PlatformProfile> = {
    desktop: {
        os: "Windows",
        browser: "Discord Client",
        device: "Discord Client",
    },
    ios: {
        os: "iOS",
        browser: "Discord iOS",
        device: "iOS Phone",
    },
    android: {
        os: "Android",
        browser: "Discord Android",
        device: "Android Phone",
    },
    web: {
        os: "Linux",
        browser: "Chrome",
        device: "",
    },
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export const settings = definePluginSettings({
    platform: {
        type: OptionType.SELECT,
        description: "Platform to impersonate. Takes effect after reconnecting to Discord's gateway (open Settings → scroll down → Reset Connection, or restart Discord).",
        default: "desktop",
        options: [
            { label: "Desktop (default – no spoof)", value: "desktop" },
            { label: "Mobile – iOS", value: "ios" },
            { label: "Mobile – Android", value: "android" },
            { label: "Browser (Chrome / Linux)", value: "web" },
        ],
    },
    logIdentify: {
        type: OptionType.BOOLEAN,
        description: "Log patched IDENTIFY payloads to the console (for debugging)",
        default: false,
    },
});

// ─── WebSocket intercept ──────────────────────────────────────────────────────

let origSend: ((data: string | ArrayBufferLike | Blob | ArrayBufferView) => void) | null = null;

function patchSend() {
    if (origSend !== null) return; // already patched
    origSend = WebSocket.prototype.send;

    WebSocket.prototype.send = function(data) {
        if (typeof data === "string") {
            try {
                const parsed = JSON.parse(data) as any;
                // op 2 = IDENTIFY
                if (parsed?.op === 2 && parsed?.d?.properties) {
                    const platform = settings.store.platform;

                    if (platform !== "desktop") {
                        const profile = PROFILES[platform];
                        if (profile) {
                            const props = parsed.d.properties as Record<string, string>;

                            // Support both new (v10) and legacy property naming
                            props.os = profile.os;
                            props.browser = profile.browser;
                            props.device = profile.device;
                            props.$os = profile.os;
                            props.$browser = profile.browser;
                            props.$device = profile.device;

                            if (settings.store.logIdentify) {
                                logger.info(`Patched IDENTIFY → platform=${platform}`, parsed.d.properties);
                            }

                            data = JSON.stringify(parsed);
                        }
                    }
                }
            } catch {
                // not JSON – leave untouched (ETF binary etc.)
            }
        }
        return origSend!.call(this, data);
    };
}

function unpatchSend() {
    if (origSend === null) return;
    WebSocket.prototype.send = origSend;
    origSend = null;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "RecordPlatformSpoof",
    description: "Makes Discord think you are on a different platform (mobile iOS/Android or browser). Reconnect to Discord's gateway after changing the setting to apply.",
    authors: [Influence],
    tags: ["platform", "mobile", "spoof", "emulator"],

    settings,

    start() {
        patchSend();
        logger.info("WebSocket.send patched – platform:", settings.store.platform);
    },

    stop() {
        unpatchSend();
        logger.info("WebSocket.send unpatched");
    },
});
