/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByProps, findByPropsLazy } from "@webpack";
import { showToast, Toasts } from "@webpack/common";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";

const logger = new Logger("AuthEnhancer");
const DOWNLOAD_HISTORY_KEY = "record_download_history";
const RECORD_ICON = "vencord://assets/icon.png";
const RECORD_LIGHT_ICON = RECORD_ICON;
const RECORD_DARK_BANNER = "vencord://assets/dark-theme-logo.png";
const RECORD_LIGHT_BANNER = RECORD_DARK_BANNER;
const MAX_SWITCH_ACCOUNTS = 10;

const AccountSwitcherStore = findByPropsLazy("canAddAccount", "getAccounts");
const AccountSwitcherApi = findByPropsLazy("canAddAccount", "switchAccount");
const Influence = { name: "Influence", id: 0n };

type DownloadEntry = {
    ts: number;
    url: string;
    fileName: string;
    source: "anchor" | "external";
};

let openExternalOriginal: ((url: string) => unknown) | null = null;
let uncapInterval: number | null = null;
let injectInterval: number | null = null;
let switchAccountsHoverPanel: HTMLDivElement | null = null;
let switchAccountsHideTimeout: number | null = null;
let switchAccountsAnchor: HTMLElement | null = null;

function cleanupLegacyInjectedElements() {
    document.getElementById("record-switcher-token-login")?.remove();
    document.getElementById("record-loading-branding")?.remove();
    document.querySelectorAll(".record-inline-brand-icon,.record-surface-banner").forEach(el => el.remove());
}

function clearSwitchAccountsHideTimeout() {
    if (switchAccountsHideTimeout != null) {
        clearTimeout(switchAccountsHideTimeout);
        switchAccountsHideTimeout = null;
    }
}

function hideSwitchAccountsHoverPanel() {
    clearSwitchAccountsHideTimeout();
    switchAccountsHoverPanel?.remove();
    switchAccountsHoverPanel = null;
    switchAccountsAnchor = null;
}

function scheduleHideSwitchAccountsHoverPanel() {
    clearSwitchAccountsHideTimeout();
    switchAccountsHideTimeout = window.setTimeout(() => {
        hideSwitchAccountsHoverPanel();
    }, 140);
}

function submitTokenLogin(rawToken: string, redirectToChannels = false) {
    const token = rawToken.trim().replace(/^"|"$/g, "");
    if (!token) {
        showToast("Please paste a token", Toasts.Type.FAILURE);
        return false;
    }

    localStorage.setItem("token", JSON.stringify(token));
    showToast("Token set. Reloading...", Toasts.Type.SUCCESS);

    setTimeout(() => {
        if (redirectToChannels) {
            location.href = "/channels/@me";
        }
        location.reload();
    }, 250);

    return true;
}

function isSwitchAccountsMenuItem(element: HTMLElement | null) {
    if (!element) return false;

    const item = element.closest("[class*='menuItem_']") as HTMLElement | null;
    if (!item) return false;

    const label = (item.querySelector("[class*='menuItemLabelText']") as HTMLElement | null)?.textContent
        || item.textContent
        || "";
    const text = label.toLowerCase().replace(/\s+/g, " ").trim();
    return text === "switch accounts" || text === "switch account";
}

function createSwitchAccountsHoverPanel(target: HTMLElement) {
    hideSwitchAccountsHoverPanel();

    const assets = getBrandingAssets(target);
    const panel = document.createElement("div");
    panel.id = "record-switch-accounts-hover-panel";
    panel.style.position = "absolute";
    panel.style.top = "-6px";
    panel.style.left = "calc(100% + 8px)";
    panel.style.zIndex = "10001";
    panel.style.width = "286px";
    panel.style.padding = "10px 10px 9px";
    panel.style.border = "1px solid var(--border-subtle)";
    panel.style.borderRadius = "10px";
    panel.style.background = "var(--background-floating)";
    panel.style.color = "var(--header-primary)";
    panel.style.boxShadow = "var(--elevation-high, 0 10px 22px rgba(0,0,0,.35))";
    panel.style.backdropFilter = "saturate(120%) blur(2px)";

    const banner = document.createElement("img");
    banner.src = assets.banner;
    banner.alt = "ReCord";
    banner.style.width = "100%";
    banner.style.height = "26px";
    banner.style.objectFit = "contain";
    banner.style.background = "var(--background-secondary)";
    banner.style.border = "1px solid var(--border-subtle)";
    banner.style.borderRadius = "7px";
    banner.style.marginBottom = "8px";

    const titleRow = document.createElement("div");
    titleRow.style.display = "flex";
    titleRow.style.alignItems = "center";
    titleRow.style.gap = "8px";
    titleRow.style.marginBottom = "4px";

    const icon = document.createElement("img");
    icon.src = assets.icon;
    icon.alt = "ReCord";
    icon.style.width = "15px";
    icon.style.height = "15px";
    icon.style.borderRadius = "4px";

    const title = document.createElement("div");
    title.textContent = "Token Login";
    title.style.fontWeight = "700";
    title.style.fontSize = "13px";
    title.style.color = "var(--header-primary)";

    titleRow.append(icon, title);

    const hint = document.createElement("div");
    hint.textContent = "Quick login for switch account";
    hint.style.color = "var(--text-muted)";
    hint.style.fontSize = "11px";
    hint.style.marginBottom = "8px";

    const input = document.createElement("input");
    input.type = "password";
    input.placeholder = "Discord token";
    input.style.width = "100%";
    input.style.boxSizing = "border-box";
    input.style.padding = "8px 10px";
    input.style.border = "1px solid var(--border-subtle)";
    input.style.borderRadius = "8px";
    input.style.marginBottom = "7px";
    input.style.background = "var(--input-background, var(--background-tertiary))";
    input.style.color = "var(--header-primary)";
    input.style.fontSize = "12px";

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "8px";

    const loginButton = document.createElement("button");
    loginButton.textContent = "Login";
    loginButton.style.flex = "1";
    loginButton.style.padding = "7px 10px";
    loginButton.style.border = "1px solid var(--border-subtle)";
    loginButton.style.borderRadius = "7px";
    loginButton.style.background = "var(--button-secondary-background)";
    loginButton.style.color = "var(--header-primary)";
    loginButton.style.cursor = "pointer";
    loginButton.style.fontSize = "12px";

    const showButton = document.createElement("button");
    showButton.textContent = "Show";
    showButton.style.padding = "7px 10px";
    showButton.style.border = "1px solid var(--border-subtle)";
    showButton.style.borderRadius = "7px";
    showButton.style.background = "var(--button-secondary-background)";
    showButton.style.color = "var(--header-primary)";
    showButton.style.cursor = "pointer";
    showButton.style.fontSize = "12px";

    showButton.onclick = () => {
        input.type = input.type === "password" ? "text" : "password";
        showButton.textContent = input.type === "password" ? "Show" : "Hide";
    };

    const submit = () => {
        if (submitTokenLogin(input.value)) {
            hideSwitchAccountsHoverPanel();
        }
    };

    loginButton.onclick = submit;
    input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            submit();
        }
    });

    row.append(loginButton, showButton);
    panel.append(banner, titleRow, hint, input, row);

    panel.addEventListener("mouseenter", clearSwitchAccountsHideTimeout);
    panel.addEventListener("mouseleave", scheduleHideSwitchAccountsHoverPanel);

    target.style.position = "relative";
    target.append(panel);
    switchAccountsHoverPanel = panel;
    switchAccountsAnchor = target;

    const rect = panel.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
        panel.style.left = "auto";
        panel.style.right = "calc(100% + 8px)";
    }
}

function onDocumentMouseOver(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    const item = target?.closest("[class*='menuItem_']") as HTMLElement | null;

    if (!item || !isSwitchAccountsMenuItem(item)) return;
    if (switchAccountsAnchor === item && switchAccountsHoverPanel) {
        clearSwitchAccountsHideTimeout();
        return;
    }

    createSwitchAccountsHoverPanel(item);
}

function onDocumentMouseOut(event: MouseEvent) {
    if (!switchAccountsAnchor) return;

    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (!switchAccountsAnchor.contains(target) && !switchAccountsHoverPanel?.contains(target)) return;

    const related = event.relatedTarget as Node | null;
    if (related && (switchAccountsAnchor.contains(related) || switchAccountsHoverPanel?.contains(related))) return;

    scheduleHideSwitchAccountsHoverPanel();
}

function onDocumentClickHideSwitchAccountsPanel(event: MouseEvent) {
    const target = event.target as Node | null;
    if (switchAccountsHoverPanel?.contains(target)) return;
    if (switchAccountsAnchor?.contains(target)) return;
    hideSwitchAccountsHoverPanel();
}

function isDarkTheme(target?: HTMLElement | null) {
    const scope = target || document.body;
    const hasDarkScope = !!scope.closest?.(".theme-dark, .theme-darker");
    return hasDarkScope || document.body.classList.contains("theme-dark") || document.body.classList.contains("theme-darker");
}

function getBrandingAssets(target?: HTMLElement | null) {
    return {
        icon: isDarkTheme(target) ? RECORD_ICON : RECORD_LIGHT_ICON,
        banner: isDarkTheme(target) ? RECORD_DARK_BANNER : RECORD_LIGHT_BANNER
    };
}

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
        if (constants && typeof constants.MAX_ACCOUNTS === "number" && (constants.MAX_ACCOUNTS as number) < MAX_SWITCH_ACCOUNTS) {
            constants.MAX_ACCOUNTS = MAX_SWITCH_ACCOUNTS;
        }

        const switcher = AccountSwitcherStore as Record<string, unknown> | undefined;
        if (switcher && typeof switcher.canAddAccount === "function") {
            switcher.canAddAccount = () => {
                const list = (switcher.getAccounts as any)?.() ?? [];
                return list.length < MAX_SWITCH_ACCOUNTS;
            };
        }

        const accountApi = findByProps("canAddAccount", "switchAccount") as Record<string, unknown> | undefined;
        if (accountApi && typeof accountApi.canAddAccount === "function") {
            accountApi.canAddAccount = () => {
                const list = (AccountSwitcherStore as any)?.getAccounts?.() ?? [];
                return list.length < MAX_SWITCH_ACCOUNTS;
            };
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
    card.style.borderRadius = "18px";
    card.style.padding = "14px";
    card.style.boxShadow = "0 18px 50px rgba(0,0,0,.38)";
    card.style.backdropFilter = "blur(10px) saturate(130%)";
    card.style.backgroundImage = "linear-gradient(180deg, color-mix(in srgb, var(--background-secondary) 92%, var(--brand-500) 8%), var(--background-secondary))";

    const assets = getBrandingAssets();

    const banner = document.createElement("img");
    banner.src = assets.banner;
    banner.alt = "ReCord";
    banner.style.width = "100%";
    banner.style.height = "46px";
    banner.style.objectFit = "contain";
    banner.style.borderRadius = "12px";
    banner.style.marginBottom = "10px";
    banner.style.background = "var(--background-tertiary)";
    banner.style.border = "1px solid var(--border-subtle)";

    const title = document.createElement("div");
    title.style.display = "flex";
    title.style.alignItems = "center";
    title.style.gap = "8px";
    title.style.fontWeight = "700";
    title.style.marginBottom = "6px";
    title.style.fontSize = "15px";

    const icon = document.createElement("img");
    icon.src = assets.icon;
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
    hint.style.lineHeight = "1.4";
    hint.style.marginBottom = "10px";

    const input = document.createElement("input");
    input.type = "password";
    input.placeholder = "Discord token";
    input.style.width = "100%";
    input.style.boxSizing = "border-box";
    input.style.padding = "10px 12px";
    input.style.border = "1px solid var(--border-subtle)";
    input.style.borderRadius = "10px";
    input.style.marginBottom = "10px";
    input.style.background = "var(--background-tertiary)";
    input.style.color = "var(--text-normal)";
    input.style.fontSize = "13px";

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "8px";

    const btn = document.createElement("button");
    btn.textContent = "Login with Token";
    btn.style.flex = "1";
    btn.style.padding = "10px 12px";
    btn.style.border = "1px solid var(--border-subtle)";
    btn.style.borderRadius = "10px";
    btn.style.background = "var(--brand-500)";
    btn.style.color = "var(--text-normal)";
    btn.style.cursor = "pointer";
    btn.style.fontWeight = "700";

    const show = document.createElement("button");
    show.textContent = "Show";
    show.style.padding = "10px 12px";
    show.style.border = "1px solid var(--border-subtle)";
    show.style.borderRadius = "10px";
    show.style.background = "var(--background-tertiary)";
    show.style.color = "var(--text-normal)";
    show.style.cursor = "pointer";

    show.onclick = () => {
        input.type = input.type === "password" ? "text" : "password";
        show.textContent = input.type === "password" ? "Show" : "Hide";
    };

    btn.onclick = () => submitTokenLogin(input.value, true);

    row.append(btn, show);
    card.append(banner, title, hint, input, row);
    document.body.append(card);
}

function injectManageAccountsTokenLogin() {
    const modals = Array.from(document.querySelectorAll('[data-mana-component="modal"]')) as HTMLElement[];

    for (const modal of modals) {
        const heading = modal.querySelector("h1") as HTMLElement | null;
        const title = heading?.textContent?.toLowerCase().trim() || "";
        if (title !== "manage accounts") continue;

        if (modal.querySelector("#record-manage-accounts-token-login")) continue;

        const footerStack = modal.querySelector("footer [class*='stack_']") as HTMLElement | null;
        if (!footerStack) continue;

        const assets = getBrandingAssets(modal);

        const block = document.createElement("div");
        block.id = "record-manage-accounts-token-login";
        block.style.width = "100%";
        block.style.border = "1px solid var(--border-subtle)";
        block.style.borderRadius = "14px";
        block.style.padding = "10px";
        block.style.background = "var(--background-secondary)";
        block.style.backgroundImage = "linear-gradient(180deg, color-mix(in srgb, var(--background-secondary) 90%, var(--brand-500) 10%), var(--background-secondary))";

        const banner = document.createElement("img");
        banner.src = assets.banner;
        banner.alt = "ReCord";
        banner.style.width = "100%";
        banner.style.height = "24px";
        banner.style.objectFit = "contain";
        banner.style.background = "var(--background-tertiary)";
        banner.style.border = "1px solid var(--border-subtle)";
        banner.style.borderRadius = "10px";
        banner.style.marginBottom = "8px";

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.gap = "8px";
        row.style.alignItems = "center";

        const icon = document.createElement("img");
        icon.src = assets.icon;
        icon.alt = "icon";
        icon.style.width = "14px";
        icon.style.height = "14px";
        icon.style.borderRadius = "4px";

        const input = document.createElement("input");
        input.type = "password";
        input.placeholder = "Token login";
        input.style.flex = "1";
        input.style.minWidth = "0";
        input.style.padding = "9px 11px";
        input.style.border = "1px solid var(--border-subtle)";
        input.style.borderRadius = "9px";
        input.style.background = "var(--background-tertiary)";
        input.style.color = "var(--header-primary)";

        const login = document.createElement("button");
        login.textContent = "Login";
        login.style.padding = "9px 11px";
        login.style.border = "1px solid var(--border-subtle)";
        login.style.borderRadius = "9px";
        login.style.background = "var(--brand-500)";
        login.style.color = "var(--header-primary)";
        login.style.cursor = "pointer";
        login.style.fontWeight = "700";

        login.onclick = () => submitTokenLogin(input.value, false);
        input.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                submitTokenLogin(input.value, false);
            }
        });

        row.append(icon, input, login);
        block.append(banner, row);
        footerStack.append(block);
    }
}

function applyDiscordIconBranding() {
    const { icon } = getBrandingAssets();

    const existing = Array.from(document.querySelectorAll("link[rel*='icon']")) as HTMLLinkElement[];
    if (!existing.length) {
        const link = document.createElement("link");
        link.rel = "icon";
        link.href = icon;
        document.head.appendChild(link);
        return;
    }

    for (const el of existing) {
        el.href = icon;
    }
}

export default definePlugin({
    name: "AuthEnhancer",
    description: "Improves account switching (up to 10) and tracks download history.",
    authors: [Influence],
    tags: ["account", "switcher", "download", "history", "record"],
    dependencies: [],

    start() {
        applyUncapPatches();
        uncapInterval = window.setInterval(applyUncapPatches, 5000);

        cleanupLegacyInjectedElements();
        applyDiscordIconBranding();
        injectTokenLogin();
        injectManageAccountsTokenLogin();
        injectInterval = window.setInterval(() => {
            cleanupLegacyInjectedElements();
            applyDiscordIconBranding();
            injectTokenLogin();
            injectManageAccountsTokenLogin();
        }, 2000);

        document.addEventListener("click", onDocumentClick, true);
        document.addEventListener("mouseover", onDocumentMouseOver, true);
        document.addEventListener("mouseout", onDocumentMouseOut, true);
        document.addEventListener("click", onDocumentClickHideSwitchAccountsPanel, true);

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

        document.removeEventListener("click", onDocumentClick, true);
        document.removeEventListener("mouseover", onDocumentMouseOver, true);
        document.removeEventListener("mouseout", onDocumentMouseOut, true);
        document.removeEventListener("click", onDocumentClickHideSwitchAccountsPanel, true);

        const native = VencordNative?.native as { openExternal?: (url: string) => unknown; } | undefined;
        if (native && openExternalOriginal) {
            native.openExternal = openExternalOriginal;
            openExternalOriginal = null;
        }

        document.getElementById("record-token-login")?.remove();
        document.getElementById("record-manage-accounts-token-login")?.remove();
        hideSwitchAccountsHoverPanel();
        cleanupLegacyInjectedElements();
    }
});
