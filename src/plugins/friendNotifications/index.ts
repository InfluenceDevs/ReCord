/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { PresenceStore, RelationshipStore, UserStore } from "@webpack/common";

const lastStatuses = new Map<string, string>();

const STATUS_LABELS: Record<string, string> = {
    online: "Online",
    idle: "Idle",
    dnd: "Do Not Disturb",
    offline: "Offline",
    invisible: "Offline",
    unknown: "Offline"
};

const settings = definePluginSettings({
    notifyOnline: {
        type: OptionType.BOOLEAN,
        description: "Notify when a friend comes online",
        default: true
    },
    notifyOffline: {
        type: OptionType.BOOLEAN,
        description: "Notify when a friend goes offline",
        default: false
    },
    notifyIdle: {
        type: OptionType.BOOLEAN,
        description: "Notify when a friend goes idle",
        default: false
    },
    notifyDnd: {
        type: OptionType.BOOLEAN,
        description: "Notify when a friend sets Do Not Disturb",
        default: false
    }
});

function normalizeStatus(status: string): string {
    if (status === "invisible") return "offline";
    return status || "offline";
}

function shouldNotify(from: string, to: string): boolean {
    if (to === "online" && settings.store.notifyOnline) return true;
    if (to === "offline" && settings.store.notifyOffline) return true;
    if (to === "idle" && settings.store.notifyIdle) return true;
    if (to === "dnd" && settings.store.notifyDnd) return true;
    return false;
}

function handlePresenceUpdate({ updates }: { updates: Array<{ user: { id: string; }; status: string; }>; }) {
    for (const update of updates) {
        const userId = update.user?.id;
        if (!userId) continue;

        // Only care about friends
        if (!RelationshipStore.isFriend(userId)) continue;

        const newStatus = normalizeStatus(update.status);
        const oldStatus = lastStatuses.get(userId) ?? "offline";

        if (newStatus === oldStatus) continue;
        lastStatuses.set(userId, newStatus);

        if (!shouldNotify(oldStatus, newStatus)) continue;

        const user = UserStore.getUser(userId);
        if (!user) continue;

        const username = (user as any).globalName ?? user.username;
        const avatar = user.getAvatarURL?.(undefined, 32, false);

        showNotification({
            title: "Friend Status",
            body: `${username} is now ${STATUS_LABELS[newStatus] ?? newStatus}`,
            icon: avatar ?? undefined,
            onClick() { }
        });
    }
}

export default definePlugin({
    name: "FriendNotifications",
    description: "Shows a notification when a friend's online status changes.",
    authors: [Devs.Rloxx],
    settings,

    flux: {
        PRESENCE_UPDATES: handlePresenceUpdate
    },

    start() {
        // Seed current statuses to avoid false notifications on startup
        const friends = RelationshipStore.getFriendIDs();
        for (const id of friends) {
            const status = normalizeStatus(PresenceStore.getStatus(id));
            lastStatuses.set(id, status);
        }
    },

    stop() {
        lastStatuses.clear();
    }
});
