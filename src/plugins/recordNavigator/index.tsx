/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
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
        rememberCurrent();
        timer = setInterval(rememberCurrent, 1000);
    },

    stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }
});
