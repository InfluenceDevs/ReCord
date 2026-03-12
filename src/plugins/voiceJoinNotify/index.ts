/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { AuthenticationStore, ChannelStore, GuildStore, RelationshipStore, UserStore, VoiceStateStore } from "@webpack/common";

const settings = definePluginSettings({
    notifyFriendsOnly: {
        type: OptionType.BOOLEAN,
        description: "Only notify for friends joining/leaving, not all users",
        default: true
    },
    notifyJoin: {
        type: OptionType.BOOLEAN,
        description: "Notify when someone joins your voice channel",
        default: true
    },
    notifyLeave: {
        type: OptionType.BOOLEAN,
        description: "Notify when someone leaves your voice channel",
        default: true
    },
    notifyMove: {
        type: OptionType.BOOLEAN,
        description: "Notify when someone moves to or from your voice channel",
        default: false
    }
});

interface VoiceStateUpdate {
    userId: string;
    channelId: string | null | undefined;
    oldChannelId?: string | null;
    guildId?: string | null;
}

interface VoiceStateUpdateEvent {
    voiceStates: VoiceStateUpdate[];
}

function getMyChannelId(): string | undefined {
    const myId = AuthenticationStore.getId();
    return VoiceStateStore.getVoiceStateForUser(myId)?.channelId ?? undefined;
}

function shouldNotifyUser(userId: string): boolean {
    const myId = AuthenticationStore.getId();
    if (userId === myId) return false;
    if (settings.store.notifyFriendsOnly && !RelationshipStore.isFriend(userId)) return false;
    return true;
}

function handleVoiceStateUpdates({ voiceStates }: VoiceStateUpdateEvent) {
    const myChannelId = getMyChannelId();
    if (!myChannelId) return; // I'm not in a VC, nothing to notify about

    for (const state of voiceStates) {
        const { userId, channelId, oldChannelId } = state;

        if (!shouldNotifyUser(userId)) continue;

        const user = UserStore.getUser(userId);
        if (!user) continue;

        const username = (user as any).globalName ?? user.username;
        const avatar = user.getAvatarURL?.(undefined, 32, false);

        const channelName = ChannelStore.getChannel(myChannelId)?.name ?? "your channel";
        const guildName = state.guildId ? (GuildStore.getGuild(state.guildId)?.name ?? "") : "";

        let title = "";
        let body = "";

        if (channelId === myChannelId && oldChannelId !== myChannelId) {
            // User joined my channel
            if (!settings.store.notifyJoin) continue;
            title = "Voice Join";
            body = `${username} joined ${channelName}${guildName ? ` (${guildName})` : ""}`;
        } else if (oldChannelId === myChannelId && channelId !== myChannelId) {
            // User left my channel
            if (!settings.store.notifyLeave) continue;
            title = "Voice Leave";
            body = `${username} left ${channelName}${guildName ? ` (${guildName})` : ""}`;
        } else if (settings.store.notifyMove && (channelId === myChannelId || oldChannelId === myChannelId)) {
            // User moved channels
            title = channelId === myChannelId ? "Voice Move (In)" : "Voice Move (Out)";
            body = `${username} ${channelId === myChannelId ? "moved to" : "moved from"} ${channelName}`;
        } else {
            continue;
        }

        showNotification({
            title,
            body,
            icon: avatar ?? undefined,
            onClick() { }
        });
    }
}

export default definePlugin({
    name: "VoiceJoinNotify",
    description: "Notifies you when users join or leave your current voice channel.",
    authors: [Devs.Rloxx],
    settings,

    flux: {
        VOICE_STATE_UPDATES: handleVoiceStateUpdates
    }
});
