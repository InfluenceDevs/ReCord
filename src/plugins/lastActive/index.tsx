/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Menu, NavigationRouter, RestAPI, Toasts, UserStore } from "@webpack/common";

const EQUICORD_ICON = "https://github.com/Equicord/Equibored/blob/main/icons/equicord/icon.png?raw=1";

async function findLastMessageFromUser(guildId: string, channelId: string, userId: string) {
    try {
        const res = await RestAPI.get({
            url: `/guilds/${guildId}/messages/search?author_id=${userId}&channel_id=${channelId}&sort_by=timestamp&sort_order=desc&offset=0`
        });

        const allMessages = Array.isArray(res?.body?.messages)
            ? res.body.messages.flat().filter(Boolean)
            : [];

        const newestMessage = allMessages.find((msg: any) => msg?.id);
        if (newestMessage) return newestMessage.id as string;

        Toasts.show({
            type: Toasts.Type.FAILURE,
            message: "No recent messages found for this user in this channel.",
            id: Toasts.genId()
        });
    } catch (error) {
        console.error("[LastActive] Failed to find last message", error);
        Toasts.show({
            type: Toasts.Type.FAILURE,
            message: "Failed to search recent messages.",
            id: Toasts.genId()
        });
    }

    return null;
}

async function jumpToLastActive(channel: any, targetUserId?: string) {
    if (!channel?.id) {
        Toasts.show({
            type: Toasts.Type.FAILURE,
            message: "Channel information not available.",
            id: Toasts.genId()
        });
        return;
    }

    const guildId = channel.guild_id;
    if (!guildId) {
        Toasts.show({
            type: Toasts.Type.FAILURE,
            message: "This action currently works in server channels.",
            id: Toasts.genId()
        });
        return;
    }

    const userId = targetUserId ?? UserStore.getCurrentUser()?.id;
    if (!userId) return;

    const messageId = await findLastMessageFromUser(guildId, channel.id, userId);
    if (!messageId) return;

    NavigationRouter.transitionTo(`/channels/${guildId}/${channel.id}/${messageId}`);
}

const ChannelContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }) => {
    children.push(
        <Menu.MenuItem
            id="record-last-active-self"
            label="Your Last Message"
            icon={LastActiveIcon}
            action={() => void jumpToLastActive(channel)}
        />
    );
};

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user, channel }) => {
    if (!channel || !user?.id) return;

    children.push(
        <Menu.MenuItem
            id="record-last-active-user"
            label="User's Last Message"
            icon={UserLastActiveIcon}
            action={() => void jumpToLastActive(channel, user.id)}
        />
    );
};

function UserLastActiveIcon() {
    return (
        <svg
            viewBox="0 0 52 52"
            width="20"
            height="20"
            fill="currentColor"
        >
            <g>
                <path d="M11.4,21.6L24.9,7.9c0.6-0.6,1.6-0.6,2.2,0l13.5,13.7c0.6,0.6,0.6,1.6,0,2.2L38.4,26c-0.6,0.6-1.6,0.6-2.2,0l-9.1-9.4c-0.6-0.6-1.6-0.6-2.2,0l-9.1,9.3c-0.6,0.6-1.6,0.6-2.2,0l-2.2-2.2C10.9,23.1,10.9,22.2,11.4,21.6z" />
                <path d="M11.4,39.7L24.9,26c0.6-0.6,1.6-0.6,2.2,0l13.5,13.7c0.6,0.6,0.6,1.6,0,2.2l-2.2,2.2c-0.6,0.6-1.6,0.6-2.2,0l-9.1-9.4c-0.6-0.6-1.6-0.6-2.2,0L15.8,44c-0.6,0.6-1.6,0.6-2.2,0l-2.2-2.2C10.9,41.2,10.9,40.2,11.4,39.7z" />
            </g>
        </svg>
    );
}

function LastActiveIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path fillRule="evenodd" d="M12 2C17.5228 2 22 6.4772 22 12C22 17.5228 17.5228 22 12 22C6.4772 22 2 17.5228 2 12C2 6.4772 6.4772 2 12 2ZM12 4C7.5817 4 4 7.5817 4 12C4 16.4183 7.5817 20 12 20C16.4183 20 20 16.4183 20 12C20 7.5817 16.4183 4 12 4ZM12 6C12.5523 6 13 6.4477 13 7V11.5858L14.7071 13.2929C15.0976 13.6834 15.0976 14.3166 14.7071 14.7071C14.3166 15.0976 13.6834 15.0976 13.2929 14.7071L11.2929 12.7071C11.1054 12.5196 11 12.2652 11 12V7C11 6.4477 11.4477 6 12 6Z" />
        </svg>
    );
}

export default definePlugin({
    name: "LastActive",
    description: "Jump to your or another user's last message in the current server channel",
    tags: ["Chat", "Utility", "Equicord"],
    authors: [Devs.Rloxx],
    icon: EQUICORD_ICON,

    contextMenus: {
        "channel-context": ChannelContextMenuPatch,
        "thread-context": ChannelContextMenuPatch,
        "user-context": UserContextMenuPatch
    }
});
