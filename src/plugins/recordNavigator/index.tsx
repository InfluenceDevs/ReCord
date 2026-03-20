/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import { createAndAppendStyle } from "@utils/css";
import { Logger } from "@utils/Logger";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelRouter, ChannelStore, Forms, GuildStore, NavigationRouter, React, SelectedChannelStore, SelectedGuildStore, Text } from "@webpack/common";

const logger = new Logger("ReCordNavigator");

type NavEntry = {
    guildId: string | null;
    channelId: string | null;
    title: string;
    subtitle: string;
};

const HISTORY_KEY = "record_nav_history";
const PINNED_KEY = "record_nav_pinned";

const settings = definePluginSettings({
    showInChatBar: {
        type: OptionType.BOOLEAN,
        description: "Show navigator button in the chat bar",
        default: true
    },
    showTopTabsStrip: {
        type: OptionType.BOOLEAN,
        description: "Show a top tabs strip like a browser",
        default: true
    },
    hideInFullscreen: {
        type: OptionType.BOOLEAN,
        description: "Hide top tabs strip while in fullscreen",
        default: true
    },
    maxTabs: {
        type: OptionType.SLIDER,
        description: "Maximum number of recent navigation tabs",
        markers: [5, 10, 15, 20, 25],
        default: 12,
        stickToMarkers: true
    }
});

let history: NavEntry[] = [];
let pinnedKeys = new Set<string>();
let timer: ReturnType<typeof setInterval> | null = null;
let stripTimer: ReturnType<typeof setInterval> | null = null;
let stripStyle: HTMLStyleElement | null = null;
let stripHost: HTMLDivElement | null = null;

function entryKey(entry: NavEntry) {
    return `${entry.guildId ?? "dm"}:${entry.channelId ?? "root"}`;
}

function loadPersistedState() {
    try {
        const rawHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
        if (Array.isArray(rawHistory)) {
            history = rawHistory.filter((entry): entry is NavEntry =>
                entry && typeof entry === "object"
                && "title" in entry
                && "subtitle" in entry
            );
        }
    } catch {
        history = [];
    }

    try {
        const rawPinned = JSON.parse(localStorage.getItem(PINNED_KEY) || "[]");
        pinnedKeys = new Set(Array.isArray(rawPinned) ? rawPinned.filter(Boolean) : []);
    } catch {
        pinnedKeys = new Set();
    }
}

function persistState() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, settings.store.maxTabs)));
    localStorage.setItem(PINNED_KEY, JSON.stringify([...pinnedKeys]));
}

function ensureStripStyle() {
    if (stripStyle) return;

    stripStyle = createAndAppendStyle("record-navigator-strip-style", managedStyleRootNode);
    stripStyle.textContent = `
        .record-nav-strip {
            position: fixed;
            top: 12px;
            left: 50%;
            transform: translateX(-50%);
            width: min(780px, calc(100vw - 28px));
            min-height: 44px;
            z-index: 60;
            display: flex;
            gap: 8px;
            align-items: center;
            padding: 6px 8px;
            overflow-x: auto;
            background: color-mix(in srgb, var(--background-floating) 96%, transparent);
            border: 1px solid var(--border-subtle);
            border-radius: 14px;
            box-shadow: var(--elevation-low, 0 8px 18px rgba(0, 0, 0, 0.24));
        }

        .record-nav-strip::-webkit-scrollbar {
            height: 0;
        }

        .record-nav-section-title {
            color: var(--text-muted);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: .04em;
            text-transform: uppercase;
            padding: 0 4px 0 2px;
            flex: 0 0 auto;
        }

        .record-nav-now {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
            flex: 0 1 220px;
            padding: 0 8px 0 4px;
            border-right: 1px solid var(--border-subtle);
        }

        .record-nav-now-dot {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: var(--green-360, #23a559);
            flex: 0 0 auto;
        }

        .record-nav-now-text {
            min-width: 0;
            display: grid;
            gap: 1px;
        }

        .record-nav-now-title,
        .record-nav-item-title {
            color: var(--header-primary);
            font-size: 12px;
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .record-nav-now-subtitle,
        .record-nav-item-subtitle {
            color: var(--text-muted);
            font-size: 10px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .record-nav-list {
            display: flex;
            gap: 6px;
            min-width: 0;
            flex: 1 1 auto;
            overflow-x: auto;
        }

        .record-nav-list::-webkit-scrollbar {
            height: 0;
        }

        .record-nav-item {
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
            max-width: 190px;
            padding: 6px 8px;
            border-radius: 10px;
            border: 1px solid transparent;
            background: transparent;
            cursor: pointer;
            transition: background-color .12s ease, border-color .12s ease;
        }

        .record-nav-item:hover {
            background: var(--background-modifier-hover);
            border-color: var(--border-subtle);
        }

        .record-nav-item.record-nav-item-active {
            background: var(--background-modifier-selected);
            border-color: var(--border-subtle);
        }

        .record-nav-item.record-nav-item-pinned .record-nav-item-pin {
            opacity: 1;
        }

        .record-nav-item-main {
            min-width: 0;
            display: grid;
            gap: 1px;
            flex: 1 1 auto;
        }

        .record-nav-item-pin,
        .record-nav-item-close,
        .record-nav-action {
            border: none;
            background: transparent;
            color: var(--interactive-normal);
            cursor: pointer;
            border-radius: 8px;
            padding: 3px 5px;
            font-size: 11px;
            flex: 0 0 auto;
        }

        .record-nav-item-pin {
            opacity: .55;
        }

        .record-nav-item:hover .record-nav-item-pin,
        .record-nav-item:hover .record-nav-item-close {
            opacity: 1;
        }

        .record-nav-item-close {
            opacity: 0;
        }

        .record-nav-item-pin:hover,
        .record-nav-item-close:hover,
        .record-nav-action:hover {
            background: var(--background-modifier-hover);
            color: var(--interactive-hover);
        }

        .record-nav-actions {
            display: flex;
            align-items: center;
            gap: 4px;
            flex: 0 0 auto;
            border-left: 1px solid var(--border-subtle);
            padding-left: 8px;
        }

        .record-nav-empty {
            display: flex;
            align-items: center;
            color: var(--text-muted);
            font-size: 11px;
            padding: 0 4px;
            min-height: 30px;
        }

        .record-nav-muted {
            color: var(--text-muted);
            padding: 0 8px;
            font-size: 11px;
        }

        .record-nav-action-primary {
            color: var(--header-primary);
            font-weight: 600;
        }

        .record-nav-item-accent {
            width: 6px;
            height: 6px;
            border-radius: 999px;
            background: var(--interactive-normal);
            flex: 0 0 auto;
            opacity: .85;
        }

        .record-nav-item-active .record-nav-item-accent {
            background: var(--green-360, #23a559);
        }

        .record-nav-chip {
            overflow: hidden;
        }
    `;
}

function ensureStripHost() {
    if (stripHost?.isConnected) return stripHost;

    const appMount = document.querySelector("#app-mount");
    if (!appMount) return null;

    stripHost = document.createElement("div");
    stripHost.className = "record-nav-strip";
    appMount.append(stripHost);
    return stripHost;
}

function removeEntry(entry: NavEntry) {
    const key = entryKey(entry);
    history = history.filter(item => entryKey(item) !== key);
    pinnedKeys.delete(key);
    persistState();
}

function togglePinned(entry: NavEntry) {
    const key = entryKey(entry);
    if (pinnedKeys.has(key)) pinnedKeys.delete(key);
    else pinnedKeys.add(key);
    persistState();
}

function clearUnpinnedEntries() {
    history = history.filter(item => pinnedKeys.has(entryKey(item)));
    persistState();
}

function renderStrip() {
    if (!settings.store.showTopTabsStrip) {
        stripHost?.remove();
        stripHost = null;
        return;
    }

    if (settings.store.hideInFullscreen && document.querySelector('[data-fullscreen="true"]')) {
        stripHost?.remove();
        stripHost = null;
        return;
    }

    const host = ensureStripHost();
    if (!host) return;

    host.replaceChildren();
    const current = getCurrentEntry();

    const title = document.createElement("div");
    title.className = "record-nav-section-title";
    title.textContent = "Navigator";
    host.append(title);

    const now = document.createElement("button");
    now.className = "record-nav-now";
    now.type = "button";
    now.title = current?.subtitle ?? "Direct Messages";
    now.onclick = () => {
        if (current) navigate(current);
        else NavigationRouter.transitionToGuild("@me");
    };

    const nowDot = document.createElement("span");
    nowDot.className = "record-nav-now-dot";
    const nowText = document.createElement("span");
    nowText.className = "record-nav-now-text";
    const nowTitle = document.createElement("span");
    nowTitle.className = "record-nav-now-title";
    nowTitle.textContent = current?.title ?? "Home";
    const nowSubtitle = document.createElement("span");
    nowSubtitle.className = "record-nav-now-subtitle";
    nowSubtitle.textContent = current?.subtitle ?? "Direct Messages";
    nowText.append(nowTitle, nowSubtitle);
    now.append(nowDot, nowText);
    host.append(now);

    const list = document.createElement("div");
    list.className = "record-nav-list";
    host.append(list);

    const ordered = history
        .slice(0, settings.store.maxTabs)
        .sort((a, b) => Number(pinnedKeys.has(entryKey(b))) - Number(pinnedKeys.has(entryKey(a))));

    if (!ordered.length) {
        const placeholder = document.createElement("div");
        placeholder.className = "record-nav-empty";
        placeholder.textContent = "Recent channels and DMs appear here";
        list.append(placeholder);
    } else {
        for (const item of ordered) {
            const key = entryKey(item);
            const isActive = !!current && current.channelId === item.channelId && current.guildId === item.guildId;
            const isPinned = pinnedKeys.has(key);

            const entry = document.createElement("div");
            entry.className = `record-nav-item${isActive ? " record-nav-item-active" : ""}${isPinned ? " record-nav-item-pinned" : ""}`;
            entry.title = `${item.title}\n${item.subtitle}`;

            const accent = document.createElement("span");
            accent.className = "record-nav-item-accent";

            const main = document.createElement("button");
            main.type = "button";
            main.className = "record-nav-item-main";
            main.style.border = "none";
            main.style.background = "transparent";
            main.style.padding = "0";
            main.style.minWidth = "0";
            main.style.cursor = "pointer";

            const itemTitle = document.createElement("span");
            itemTitle.className = "record-nav-item-title";
            itemTitle.textContent = item.title;
            const itemSubtitle = document.createElement("span");
            itemSubtitle.className = "record-nav-item-subtitle";
            itemSubtitle.textContent = item.subtitle;
            main.append(itemTitle, itemSubtitle);
            main.onclick = () => navigate(item);

            const pin = document.createElement("button");
            pin.type = "button";
            pin.className = "record-nav-item-pin";
            pin.textContent = isPinned ? "Pin" : "Pin";
            pin.title = isPinned ? "Unpin tab" : "Pin tab";
            pin.onclick = event => {
                event.stopPropagation();
                togglePinned(item);
                renderStrip();
            };

            const close = document.createElement("button");
            close.type = "button";
            close.className = "record-nav-item-close";
            close.textContent = "×";
            close.title = "Remove tab";
            close.onclick = event => {
                event.stopPropagation();
                removeEntry(item);
                renderStrip();
            };

            entry.append(accent, main, pin, close);
            list.append(entry);
        }
    }

    const actions = document.createElement("div");
    actions.className = "record-nav-actions";

    const openAll = document.createElement("button");
    openAll.type = "button";
    openAll.className = "record-nav-action record-nav-action-primary";
    openAll.textContent = "Open";
    openAll.title = "Open full navigator";
    openAll.onclick = openNavigatorModal;

    const pinCurrent = document.createElement("button");
    pinCurrent.type = "button";
    pinCurrent.className = "record-nav-action";
    pinCurrent.textContent = "Pin current";
    pinCurrent.disabled = !current;
    pinCurrent.title = "Pin current tab";
    pinCurrent.onclick = () => {
        if (!current) return;
        history = [current, ...history.filter(item => entryKey(item) !== entryKey(current))].slice(0, settings.store.maxTabs);
        pinnedKeys.add(entryKey(current));
        persistState();
        renderStrip();
    };

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "record-nav-action";
    clear.textContent = "Clear";
    clear.title = "Clear unpinned tabs";
    clear.onclick = () => {
        clearUnpinnedEntries();
        renderStrip();
    };

    actions.append(openAll, pinCurrent, clear);
    host.append(actions);
}

function getCurrentEntry(): NavEntry | null {
    const channelId = SelectedChannelStore.getChannelId() ?? null;
    const guildId = SelectedGuildStore.getGuildId() ?? null;

    if (!channelId && !guildId) return null;

    const channel = channelId ? ChannelStore.getChannel(channelId) : null;
    const guild = guildId ? GuildStore.getGuild(guildId) : null;

    const title = channel?.name
        ? `#${channel.name}`
        : guild?.name ?? "Direct Messages";

    const subtitle = guild?.name
        ? `Server: ${guild.name}`
        : "DM / Group DM";

    return { guildId, channelId, title, subtitle };
}

function rememberCurrent() {
    const entry = getCurrentEntry();
    if (!entry) return;

    const same = history[0]?.channelId === entry.channelId && history[0]?.guildId === entry.guildId;
    if (same) return;

    history = [entry, ...history.filter(h => !(h.channelId === entry.channelId && h.guildId === entry.guildId))]
        .slice(0, settings.store.maxTabs);
    persistState();
}

function navigate(entry: NavEntry) {
    try {
        if (entry.channelId) {
            ChannelRouter.transitionToChannel(entry.channelId);
            return;
        }

        NavigationRouter.transitionToGuild(entry.guildId ?? "@me");
    } catch (err) {
        logger.error("Failed to navigate to entry", entry, err);
    }
}

function NavigatorIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
            <line x1="9" y1="5" x2="9" y2="19" stroke="currentColor" strokeWidth="2" />
            <line x1="15" y1="5" x2="15" y2="19" stroke="currentColor" strokeWidth="2" />
        </svg>
    );
}

function NavigatorModal() {
    const [, forceUpdate] = React.useReducer(n => n + 1, 0);

    React.useEffect(() => {
        const id = setInterval(() => forceUpdate(), 800);
        return () => clearInterval(id);
    }, []);

    const items = history.slice(0, settings.store.maxTabs);

    return (
        <div style={{ display: "grid", gap: 10 }}>
            <Forms.FormText>
                Recent tabs for channels, DMs, and servers.
            </Forms.FormText>

            <div style={{ display: "grid", gap: 8, maxHeight: 420, overflow: "auto" }}>
                {items.length === 0 && <Text variant="text-sm/normal">No tabs yet. Navigate around first.</Text>}
                {items.map((item, idx) => (
                    <Button key={`${item.channelId}-${item.guildId}-${idx}`} variant="secondary" size="small" onClick={() => navigate(item)}>
                        <div style={{ display: "grid", textAlign: "left" }}>
                            <span style={{ fontWeight: 600 }}>{item.title}</span>
                            <span style={{ opacity: 0.75, fontSize: 12 }}>{item.subtitle}</span>
                        </div>
                    </Button>
                ))}
            </div>
        </div>
    );
}

function openNavigatorModal() {
    openModal(props => (
        <ModalRoot {...props} size={ModalSize.DYNAMIC}>
            <ModalHeader>
                <Text variant="heading-lg/semibold" style={{ flexGrow: 1 }}>ReCord Tabs Navigator</Text>
                <ModalCloseButton onClick={props.onClose} />
            </ModalHeader>
            <ModalContent>
                <NavigatorModal />
            </ModalContent>
        </ModalRoot>
    ));
}

export default definePlugin({
    name: "ReCordNavigator",
    description: "Browser-like tabs navigator for channels, DMs, and servers",
    authors: [Devs.Ven],
    settings,

    chatBarButton: {
        icon: NavigatorIcon,
        render: ({ isAnyChat }) => {
            if (!isAnyChat || !settings.store.showInChatBar) return null;

            return (
                <ChatBarButton tooltip="Open ReCord Tabs Navigator" onClick={openNavigatorModal}>
                    <NavigatorIcon />
                </ChatBarButton>
            );
        }
    },

    start() {
        loadPersistedState();
        ensureStripStyle();
        rememberCurrent();
        timer = setInterval(rememberCurrent, 1000);
        renderStrip();
        stripTimer = setInterval(renderStrip, 1000);
    },

    stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }

        if (stripTimer) {
            clearInterval(stripTimer);
            stripTimer = null;
        }

        stripHost?.remove();
        stripHost = null;
        stripStyle?.remove();
        stripStyle = null;
    }
});
