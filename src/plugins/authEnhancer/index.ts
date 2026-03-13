/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByProps, findByPropsLazy } from "@webpack";
import { showToast, Toasts } from "@webpack/common";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";

const logger = new Logger("AuthEnhancer");
const DOWNLOAD_HISTORY_KEY = "record_download_history";
const RECORD_ICON = "vencord://assets/icon.png";
const RECORD_DARK_BANNER = "vencord://assets/dark-theme-logo.png";
const RECORD_LIGHT_BANNER = "vencord://assets/light-theme-logo.png";

const AccountSwitcherStore = findByPropsLazy("canAddAccount", "getAccounts");

type DownloadEntry = {
    ts: number;
    url: string;
    fileName: string;
    source: "anchor" | "external";
};

let openExternalOriginal: ((url: string) => unknown) | null = null;
let uncapInterval: number | null = null;
let injectInterval: number | null = null;

function parseFileName(url: string) {
    try {
        const parsed = new URL(url);
        return decodeURIComponent(parsed.pathname.split("/").pop() || "file");
    } catch {
        return "file";
    }
}

function isDownloadUrl(url: string) {
    return /cdn\.discord(app)?\.com\/attachments\//i.test(url)
        || /\/attachments\//i.test(url)
        || /voice-message/i.test(url);
}

function readHistory() {
    try {
        return JSON.parse(localStorage.getItem(DOWNLOAD_HISTORY_KEY) || "[]") as DownloadEntry[];
    } catch {
        return [];
    }
}

function pushHistory(entry: DownloadEntry) {
    const list = readHistory();
    list.unshift(entry);
    if (list.length > 300) list.length = 300;
    localStorage.setItem(DOWNLOAD_HISTORY_KEY, JSON.stringify(list));
}

function trackDownload(url: string, source: DownloadEntry["source"]) {
    if (!isDownloadUrl(url)) return;
    pushHistory({
        ts: Date.now(),
        url,
        fileName: parseFileName(url),
        source
    });
}

function onDocumentClick(e: MouseEvent) {
    const anchor = (e.target as HTMLElement | null)?.closest?.("a") as HTMLAnchorElement | null;
    if (!anchor?.href) return;

    const isDownloadLike = !!anchor.download
        || /download/i.test(anchor.getAttribute("aria-label") || "")
        || /download/i.test(anchor.textContent || "")
        || isDownloadUrl(anchor.href);

    if (isDownloadLike) {
        trackDownload(anchor.href, "anchor");
    }
}

function applyUncapPatches() {
    try {
        const constants = findByProps("MAX_ACCOUNTS") as Record<string, unknown> | undefined;
        if (constants && typeof constants.MAX_ACCOUNTS === "number" && (constants.MAX_ACCOUNTS as number) < 100) {
            constants.MAX_ACCOUNTS = 100;
        }

        const switcher = AccountSwitcherStore as Record<string, unknown> | undefined;
        if (switcher && typeof switcher.canAddAccount === "function") {
            switcher.canAddAccount = () => true;
        }

        const accountApi = findByProps("canAddAccount", "switchAccount") as Record<string, unknown> | undefined;
        if (accountApi && typeof accountApi.canAddAccount === "function") {
            accountApi.canAddAccount = () => true;
        }
    } catch (err) {
        logger.error("Failed to patch account switching limits", err);
    }
}

function injectTokenLogin() {
    if (location.pathname !== "/login") return;
    if (document.getElementById("record-token-login")) return;

    const card = document.createElement("div");
    card.id = "record-token-login";
    card.style.position = "fixed";
    card.style.right = "18px";
    card.style.bottom = "18px";
    card.style.width = "380px";
    card.style.zIndex = "10000";
    card.style.background = "var(--background-secondary)";
    card.style.border = "1px solid var(--border-subtle)";
    card.style.borderRadius = "12px";
    card.style.padding = "12px";
    card.style.boxShadow = "0 8px 24px rgba(0,0,0,.35)";

    const isDark = document.body.classList.contains("theme-dark");

    const banner = document.createElement("img");
    banner.src = isDark ? RECORD_DARK_BANNER : RECORD_LIGHT_BANNER;
    banner.alt = "ReCord";
    banner.style.width = "100%";
    banner.style.height = "42px";
    banner.style.objectFit = "cover";
    banner.style.borderRadius = "8px";
    banner.style.marginBottom = "8px";

    const title = document.createElement("div");
    title.style.display = "flex";
    title.style.alignItems = "center";
    title.style.gap = "8px";
    title.style.fontWeight = "700";
    title.style.marginBottom = "6px";

    const icon = document.createElement("img");
    icon.src = RECORD_ICON;
    icon.alt = "icon";
    icon.style.width = "18px";
    icon.style.height = "18px";
    icon.style.borderRadius = "4px";

    const titleText = document.createElement("span");
    titleText.textContent = "Token Login";
    title.append(icon, titleText);

    const hint = document.createElement("div");
    hint.textContent = "Paste a token to log in instantly.";
    hint.style.color = "var(--text-muted)";
    hint.style.fontSize = "12px";
    hint.style.marginBottom = "8px";

    const input = document.createElement("input");
    input.type = "password";
    input.placeholder = "Discord token";
    input.style.width = "100%";
    input.style.boxSizing = "border-box";
    input.style.padding = "8px 10px";
    input.style.border = "1px solid var(--border-subtle)";
    input.style.borderRadius = "8px";
    input.style.marginBottom = "8px";
    input.style.background = "var(--background-tertiary)";
    input.style.color = "var(--text-normal)";

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "8px";

    const btn = document.createElement("button");
    btn.textContent = "Login with Token";
    btn.style.flex = "1";
    btn.style.padding = "8px 10px";
    btn.style.border = "none";
    btn.style.borderRadius = "8px";
    btn.style.background = "var(--brand-500, #5865f2)";
    btn.style.color = "white";
    btn.style.cursor = "pointer";

    const show = document.createElement("button");
    show.textContent = "Show";
    show.style.padding = "8px 10px";
    show.style.border = "1px solid var(--border-subtle)";
    show.style.borderRadius = "8px";
    show.style.background = "var(--background-tertiary)";
    show.style.color = "var(--text-normal)";
    show.style.cursor = "pointer";

    show.onclick = () => {
        input.type = input.type === "password" ? "text" : "password";
        show.textContent = input.type === "password" ? "Show" : "Hide";
    };

    btn.onclick = () => {
        const raw = input.value.trim();
        if (!raw) {
            showToast("Please paste a token", Toasts.Type.FAILURE);
            return;
        }

        const token = raw.replace(/^"|"$/g, "");
        localStorage.setItem("token", JSON.stringify(token));
        showToast("Token set. Reloading...", Toasts.Type.SUCCESS);

        setTimeout(() => {
            location.href = "/channels/@me";
            location.reload();
        }, 250);
    };

    row.append(btn, show);
    card.append(banner, title, hint, input, row);
    document.body.append(card);
}

function injectSwitcherTokenLogin() {
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"], [aria-modal="true"]')) as HTMLElement[];
    for (const dialog of dialogs) {
        const text = dialog.textContent?.toLowerCase() || "";
        const isSwitcher = text.includes("switch account") || text.includes("switch accounts") || text.includes("add account");
        if (!isSwitcher) continue;
        if (dialog.querySelector("#record-switcher-token-login")) continue;

        const host = document.createElement("div");
        host.id = "record-switcher-token-login";
        host.style.marginTop = "10px";
        host.style.paddingTop = "10px";
        host.style.borderTop = "1px solid var(--border-subtle)";

        const isDark = document.body.classList.contains("theme-dark");

        const banner = document.createElement("img");
        banner.src = isDark ? RECORD_DARK_BANNER : RECORD_LIGHT_BANNER;
        banner.alt = "ReCord";
        banner.style.width = "100%";
        banner.style.height = "32px";
        banner.style.objectFit = "cover";
        banner.style.borderRadius = "8px";
        banner.style.marginBottom = "8px";

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.gap = "8px";

        const input = document.createElement("input");
        input.type = "password";
        input.placeholder = "Token";
        input.style.flex = "1";
        input.style.minWidth = "0";
        input.style.padding = "8px 10px";
        input.style.borderRadius = "8px";
        input.style.border = "1px solid var(--border-subtle)";
        input.style.background = "var(--background-tertiary)";
        input.style.color = "var(--text-normal)";

        const button = document.createElement("button");
        button.textContent = "Token Login";
        button.style.padding = "8px 10px";
        button.style.border = "none";
        button.style.borderRadius = "8px";
        button.style.background = "var(--brand-500, #5865f2)";
        button.style.color = "#fff";
        button.style.cursor = "pointer";

        button.onclick = () => {
            const token = input.value.trim().replace(/^"|"$/g, "");
            if (!token) {
                showToast("Please paste a token", Toasts.Type.FAILURE);
                return;
            }

            localStorage.setItem("token", JSON.stringify(token));
            showToast("Token set. Reloading...", Toasts.Type.SUCCESS);
            setTimeout(() => location.reload(), 200);
        };

        row.append(input, button);
        host.append(banner, row);
        dialog.append(host);
    }
}

function applyDiscordIconBranding() {
    const iconHrefs = [
        RECORD_ICON,
        RECORD_ICON
    ];

    const existing = Array.from(document.querySelectorAll("link[rel*='icon']")) as HTMLLinkElement[];
    if (!existing.length) {
        const link = document.createElement("link");
        link.rel = "icon";
        link.href = RECORD_ICON;
        document.head.appendChild(link);
        return;
    }

    for (const [i, el] of existing.entries()) {
        el.href = iconHrefs[i] ?? RECORD_ICON;
    }
}

export default definePlugin({
    name: "AuthEnhancer",
    description: "Adds token login on login screen, removes account switching limits, and tracks download history.",
    authors: [Devs.Rloxx],

    start() {
        applyUncapPatches();
        uncapInterval = window.setInterval(applyUncapPatches, 5000);

        applyDiscordIconBranding();
        injectTokenLogin();
        injectSwitcherTokenLogin();
        window.addEventListener("hashchange", injectTokenLogin);
        injectInterval = window.setInterval(() => {
            injectTokenLogin();
            injectSwitcherTokenLogin();
            applyDiscordIconBranding();
        }, 1200);

        document.addEventListener("click", onDocumentClick, true);

        const native = VencordNative?.native as { openExternal?: (url: string) => unknown; } | undefined;
        if (native?.openExternal && !openExternalOriginal) {
            openExternalOriginal = native.openExternal.bind(native);
            native.openExternal = (url: string) => {
                trackDownload(url, "external");
                return openExternalOriginal?.(url);
            };
        }
    },

    stop() {
        if (uncapInterval != null) {
            clearInterval(uncapInterval);
            uncapInterval = null;
        }

        if (injectInterval != null) {
            clearInterval(injectInterval);
            injectInterval = null;
        }

        window.removeEventListener("hashchange", injectTokenLogin);
        document.removeEventListener("click", onDocumentClick, true);

        const native = VencordNative?.native as { openExternal?: (url: string) => unknown; } | undefined;
        if (native && openExternalOriginal) {
            native.openExternal = openExternalOriginal;
            openExternalOriginal = null;
        }

        document.getElementById("record-token-login")?.remove();
        document.getElementById("record-switcher-token-login")?.remove();
    }
});
