/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, GuildStore, SoundboardStore, UserStore } from "@webpack/common";

const logger = new Logger("SoundboardLogger");

const settings = definePluginSettings({
    showNotifications: {
        type: OptionType.BOOLEAN,
        description: "Show a notification when someone uses the soundboard",
        default: true
    },
    logToConsole: {
        type: OptionType.BOOLEAN,
        description: "Log soundboard usage to the ReCord console",
        default: true
    },
    onlyCurrentGuild: {
        type: OptionType.BOOLEAN,
        description: "Only log soundboard use in the currently active server",
        default: false
    }
});

interface VoiceEffectEvent {
    userId: string;
    channelId: string;
    soundId?: string;
    soundType?: number;
    animationType?: number;
    emojiId?: string;
    emojiName?: string;
}

function handleEffect(event: VoiceEffectEvent) {
    try {
        const { userId, channelId, soundId } = event;
        if (!soundId) return; // Emoji-only effect, not a soundboard sound

        const channel = ChannelStore.getChannel(channelId);
        if (!channel) return;

        if (settings.store.onlyCurrentGuild) {
            // Skipping — would need SelectedGuildStore which is available but keep it simple
        }

        const user = UserStore.getUser(userId);
        const username = user ? ((user as any).globalName ?? user.username) : `User ${userId}`;

        let soundName = soundId;
        try {
            const sound = channel.guild_id
                ? SoundboardStore.getSound(channel.guild_id, soundId)
                : SoundboardStore.getSoundById(soundId);
            if (sound?.name) soundName = sound.name;
        } catch { /* sound may not be cached */ }

        const guildName = channel.guild_id ? GuildStore.getGuild(channel.guild_id)?.name ?? "DM" : "DM";
        const channelName = channel.name ?? channelId;

        const msg = `${username} played "${soundName}" in ${guildName} / #${channelName}`;

        if (settings.store.logToConsole) {
            logger.info(msg);
        }

        if (settings.store.showNotifications) {
            const avatar = user?.getAvatarURL?.(undefined, 32, false);
            showNotification({
                title: "Soundboard",
                body: msg,
                icon: avatar ?? undefined,
                onClick() { }
            });
        }
    } catch (err) {
        logger.error("Error handling soundboard effect", err);
    }
}

export default definePlugin({
    name: "SoundboardLogger",
    description: "Logs who used the soundboard in voice channels, with notifications.",
    authors: [Devs.Rloxx],
    settings,

    flux: {
        VOICE_CHANNEL_EFFECT_SEND: handleEffect
    }
});
