/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { UserProfileStore, UserStore } from "@webpack/common";

const Influence = { name: "Influence", id: 0n };

let originalGetUserProfile: ((...args: any[]) => any) | null = null;

function isQuestBadge(badge: any) {
    const haystack = [badge?.id, badge?.description, badge?.tooltip, badge?.link, badge?.icon, badge?.iconSrc]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return haystack.includes("quest");
}

function filterQuestBadge(profile: any, requestedUserId?: string) {
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!profile || !Array.isArray(profile.badges) || !currentUserId || requestedUserId !== currentUserId) {
        return profile;
    }

    const filtered = profile.badges.filter((badge: any) => !isQuestBadge(badge));
    if (filtered.length === profile.badges.length) return profile;

    return {
        ...profile,
        badges: filtered,
    };
}

export default definePlugin({
    name: "RecordHideQuestBadge",
    description: "Removes the quest badge from your own Discord profile.",
    authors: [Influence],
    tags: ["profile", "badge", "quest"],

    start() {
        if (typeof (UserProfileStore as any).getUserProfile !== "function" || originalGetUserProfile) return;

        originalGetUserProfile = (UserProfileStore as any).getUserProfile.bind(UserProfileStore);
        (UserProfileStore as any).getUserProfile = (userId: string, ...args: any[]) => {
            const profile = originalGetUserProfile?.(userId, ...args);
            return filterQuestBadge(profile, String(userId ?? ""));
        };
    },

    stop() {
        if (!originalGetUserProfile) return;
        (UserProfileStore as any).getUserProfile = originalGetUserProfile;
        originalGetUserProfile = null;
    },
});
