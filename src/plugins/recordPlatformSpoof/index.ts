/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { findStoreLazy } from "@webpack";
import { PresenceStore, UserStore } from "@webpack/common";

const logger = new Logger("RecordPlatformSpoof");

// ─── Platform profiles ────────────────────────────────────────────────────────

interface PlatformProfile {
    os: string;
    browser: string;
    device: string;
    icon: string;
}

const PROFILES: Record<string, PlatformProfile> = {
    desktop: {
        os: "Windows",
        browser: "Discord Client",
        device: "Discord Client",
        icon: "🖥️",
    },
    ios: {
        os: "iOS",
        browser: "Discord iOS",
        device: "iOS Phone",
        icon: "🍎",
    },
    android: {
        os: "Android",
        browser: "Discord Android",
        device: "Android Phone",
        icon: "🤖",
    },
    web: {
        os: "Linux",
        browser: "Chrome",
        device: "",
        icon: "🌐",
    },
    vr: {
        os: "Android",
        browser: "Discord VR",
        device: "Discord VR",
        icon: "🥽",
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
            { label: "VR (Meta Quest / Discord VR)", value: "vr" },
        ],
    },
    showVoiceIcon: {
        type: OptionType.BOOLEAN,
        description: "Show platform icon next to your name in voice chat",
        default: true,
    },
    logIdentify: {
        type: OptionType.BOOLEAN,
        description: "Log patched IDENTIFY payloads to the console (for debugging)",
        default: false,
    },
});

// ─── WebSocket intercept ──────────────────────────────────────────────────────

let origSend: typeof WebSocket.prototype.send | null = null;
const origGetClientStatusByStore = new Map<any, (userId: string) => Record<string, string> | null | undefined>();
let origGetSessions: (() => Record<string, any>) | null = null;
const origGetStateByStore = new Map<any, () => any>();
const origIsMobileOnlineByStore = new Map<any, (userId: string) => boolean>();
let enforcePresenceInterval: ReturnType<typeof setInterval> | null = null;
const lazyPresenceStore = findStoreLazy("PresenceStore") as any;

function getPresenceStores() {
    return [...new Set([PresenceStore as any, lazyPresenceStore].filter(Boolean))];
}

function getActiveProfile() {
    const platform = String(settings.store.platform ?? "desktop");
    const profile = PROFILES[platform as keyof typeof PROFILES] ?? PROFILES.desktop;
    return { platform, profile };
}

function applySpoof(props: Record<string, any>) {
    const { platform, profile } = getActiveProfile();
    if (platform === "desktop") return props;

    const next = {
        ...props,
        os: profile.os,
        browser: profile.browser,
        device: profile.device,
        $os: profile.os,
        $browser: profile.browser,
        $device: profile.device
    };

    if (settings.store.logIdentify) {
        logger.info(`Patched IDENTIFY properties -> platform=${platform}`, next);
    }

    return next;
}

function patchSend() {
    if (origSend !== null) return; // already patched
    origSend = WebSocket.prototype.send;

    WebSocket.prototype.send = function(data) {
        if (typeof data === "string") {
            try {
                const parsed = JSON.parse(data) as any;
                // op 2 = IDENTIFY
                if (parsed?.op === 2 && parsed?.d?.properties) {
                    parsed.d.properties = applySpoof(parsed.d.properties as Record<string, string>);
                    data = JSON.stringify(parsed);
                }
            } catch {
                // not JSON – leave untouched (ETF binary etc.)
            }
        }
        return origSend!.call(this, data);
    };
}

function mapPlatformToStatusKey(platform: string) {
    switch (platform) {
        case "web":
            return "web";
        case "ios":
        case "android":
        case "vr":
            return "mobile";
        default:
            return "desktop";
    }
}

function shouldForceMobile(platform: string) {
    return platform === "ios" || platform === "android" || platform === "vr";
}

function forcePresenceStateNow() {
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    const { platform } = getActiveProfile();
    for (const store of getPresenceStores()) {
        if (typeof store?.getState !== "function") continue;

        const state = store.getState();
        if (!state?.clientStatuses || platform === "desktop") continue;

        const key = mapPlatformToStatusKey(platform);
        const existing = state.clientStatuses[currentUserId] ?? {};
        const effective = existing.desktop ?? existing.web ?? existing.mobile ?? "online";
        state.clientStatuses[currentUserId] = { [key]: effective };
    }
}

function patchClientStatus() {
    for (const store of getPresenceStores()) {
        if (origGetClientStatusByStore.has(store) || typeof store?.getClientStatus !== "function") continue;

        const original = store.getClientStatus.bind(store);
        origGetClientStatusByStore.set(store, original);

        store.getClientStatus = (userId: string) => {
            const status = original?.(userId);
            const currentUserId = UserStore.getCurrentUser()?.id;
            if (!currentUserId || userId !== currentUserId) return status;

            const { platform } = getActiveProfile();
            if (platform === "desktop") return status;

            const key = mapPlatformToStatusKey(platform);
            const effective = status?.desktop ?? status?.web ?? status?.mobile ?? "online";

            return { [key]: effective };
        };
    }
}

function patchPresenceState() {
    for (const store of getPresenceStores()) {
        if (origGetStateByStore.has(store) || typeof store?.getState !== "function") continue;

        const original = store.getState.bind(store);
        origGetStateByStore.set(store, original);

        store.getState = () => {
            const state = original?.();
            const currentUserId = UserStore.getCurrentUser()?.id;
            if (!state || !currentUserId) return state;

            const { platform } = getActiveProfile();
            if (platform === "desktop" || !state.clientStatuses) return state;

            const key = mapPlatformToStatusKey(platform);
            const existing = state.clientStatuses[currentUserId] ?? {};
            const effective = existing.desktop ?? existing.web ?? existing.mobile ?? "online";

            state.clientStatuses[currentUserId] = { [key]: effective };
            return state;
        };
    }
}

function patchIsMobileOnline() {
    for (const store of getPresenceStores()) {
        if (origIsMobileOnlineByStore.has(store) || typeof store?.isMobileOnline !== "function") continue;

        const original = store.isMobileOnline.bind(store);
        origIsMobileOnlineByStore.set(store, original);

        store.isMobileOnline = (userId: string) => {
            const currentUserId = UserStore.getCurrentUser()?.id;
            const { platform } = getActiveProfile();

            if (currentUserId && userId === currentUserId && shouldForceMobile(platform)) {
                return true;
            }

            return original?.(userId) ?? false;
        };
    }
}

function mapPlatformToSessionClient(platform: string) {
    switch (platform) {
        case "ios":
        case "android":
            return "mobile";
        case "web":
            return "web";
        case "vr":
            return "vr";
        default:
            return "desktop";
    }
}

function patchSessions() {
    if (origGetSessions) return;

    const sessionsStore = findStoreLazy("SessionsStore") as any;
    if (typeof sessionsStore?.getSessions !== "function") return;

    origGetSessions = sessionsStore.getSessions.bind(sessionsStore);
    sessionsStore.getSessions = () => {
        const sessions = origGetSessions?.() ?? {};
        const { platform } = getActiveProfile();
        if (platform === "desktop") return sessions;

        const spoofClient = mapPlatformToSessionClient(platform);
        return Object.fromEntries(
            Object.entries(sessions).map(([id, session]: [string, any]) => {
                const clientInfo = session?.clientInfo ?? {};
                return [id, {
                    ...session,
                    clientInfo: {
                        ...clientInfo,
                        client: spoofClient
                    }
                }];
            })
        );
    };
}

function unpatchSend() {
    if (origSend === null) return;
    WebSocket.prototype.send = origSend;
    origSend = null;
}

function unpatchClientStatus() {
    for (const [store, original] of origGetClientStatusByStore.entries()) {
        store.getClientStatus = original;
    }
    origGetClientStatusByStore.clear();
}

function unpatchPresenceState() {
    for (const [store, original] of origGetStateByStore.entries()) {
        store.getState = original;
    }
    origGetStateByStore.clear();
}

function unpatchIsMobileOnline() {
    for (const [store, original] of origIsMobileOnlineByStore.entries()) {
        store.isMobileOnline = original;
    }
    origIsMobileOnlineByStore.clear();
}

function unpatchSessions() {
    if (!origGetSessions) return;

    const sessionsStore = findStoreLazy("SessionsStore") as any;
    if (sessionsStore) sessionsStore.getSessions = origGetSessions;
    origGetSessions = null;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "RecordPlatformSpoof",
    description: "Makes Discord think you are on a different platform (Mobile iOS/Android, Browser, or VR). Mobile spoof also affects voice channel presence indicators. Reconnect to Discord's gateway after changing the setting to apply (Settings → scroll down → Reset Connection, or restart Discord).",
    authors: [Devs.Rloxx],
    tags: ["platform", "mobile", "spoof", "emulator"],

    patches: [
        {
            // Patch identify payload at source so spoof also applies on ETF/binary gateway paths.
            find: 'type:"user",revision',
            replacement: {
                match: /properties:\{([^}]*)\}/,
                replace: "properties:$self.applySpoof({$1})"
            }
        }
    ],

    settings,

    start() {
        patchSend();
        patchClientStatus();
        patchPresenceState();
        patchIsMobileOnline();
        patchSessions();
        forcePresenceStateNow();
        enforcePresenceInterval = setInterval(forcePresenceStateNow, 2500);
        logger.info("WebSocket.send patched – platform:", settings.store.platform);
    },

    stop() {
        unpatchSend();
        unpatchClientStatus();
        unpatchPresenceState();
        unpatchIsMobileOnline();
        unpatchSessions();
        if (enforcePresenceInterval) {
            clearInterval(enforcePresenceInterval);
            enforcePresenceInterval = null;
        }
        logger.info("WebSocket.send unpatched");
    },

    applySpoof,
});
