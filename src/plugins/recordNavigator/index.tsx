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
let timer: ReturnType<typeof setInterval> | null = null;
let stripTimer: ReturnType<typeof setInterval> | null = null;
let stripStyle: HTMLStyleElement | null = null;
let stripHost: HTMLDivElement | null = null;

function ensureStripStyle() {
    if (stripStyle) return;

    stripStyle = createAndAppendStyle("record-navigator-strip-style", managedStyleRootNode);
    stripStyle.textContent = `
        .record-nav-strip {
            position: fixed;
            top: 0;
            left: 72px;
            right: 0;
            height: 36px;
            z-index: 1000;
            display: flex;
            gap: 6px;
            align-items: center;
            padding: 4px 10px;
            overflow-x: auto;
            background: linear-gradient(180deg, rgba(88,101,242,0.24), rgba(88,101,242,0.08));
            backdrop-filter: blur(10px);
            border-bottom: 1px solid rgba(88,101,242,0.35);
        }

        .record-nav-strip button {
            border: 1px solid rgba(88,101,242,0.4);
            background: rgba(20,20,28,0.55);
            color: var(--text-normal);
            border-radius: 8px;
            padding: 4px 8px;
            white-space: nowrap;
            cursor: pointer;
            font-size: 12px;
        }

        .record-nav-strip button:hover {
            background: rgba(88,101,242,0.28);
        }

        .record-nav-strip .record-nav-muted {
            opacity: 0.7;
            font-size: 11px;
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

    const homeBtn = document.createElement("button");
    homeBtn.textContent = "Home";
    homeBtn.onclick = () => NavigationRouter.transitionToGuild("@me");
    host.append(homeBtn);

    const items = history.slice(0, settings.store.maxTabs);
    if (!items.length) {
        const placeholder = document.createElement("span");
        placeholder.className = "record-nav-muted";
        placeholder.textContent = "Navigate to channels/DMs/servers to populate tabs";
        host.append(placeholder);
        return;
    }

    for (const item of items) {
        const btn = document.createElement("button");
        btn.title = item.subtitle;
        btn.textContent = item.title;
        btn.onclick = () => navigate(item);
        host.append(btn);
    }
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
