/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { FluxDispatcher, Menu, UserStore } from "@webpack/common";

type GuildPingMode = "off" | "everyone-only" | "all";

type GuildRule = {
    mode: GuildPingMode;
    allowDirectMentions: boolean;
    autoMarkRead: boolean;
};

type RulesMap = Record<string, GuildRule>;

const STORE_KEY = "record_ping_shield_rules";

function loadRules(): RulesMap {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}"); } catch { return {}; }
}

function saveRules(rules: RulesMap) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(rules)); } catch { /* noop */ }
}

function getRule(guildId: string): GuildRule {
    const rule = loadRules()[guildId];
    return {
        mode: rule?.mode ?? "off",
        allowDirectMentions: rule?.allowDirectMentions ?? true,
        autoMarkRead: rule?.autoMarkRead ?? true,
    };
}

function setRule(guildId: string, patch: Partial<GuildRule>) {
    const rules = loadRules();
    const current = getRule(guildId);
    rules[guildId] = { ...current, ...patch };
    saveRules(rules);
}

function isDirectMention(message: any, myId: string) {
    return Array.isArray(message?.mentions) && message.mentions.some((m: any) => m?.id === myId);
}

function isEveryoneLikeMention(message: any) {
    return !!message?.mention_everyone || (Array.isArray(message?.mention_roles) && message.mention_roles.length > 0);
}

function shouldSuppressPing(message: any, rule: GuildRule, myId: string) {
    if (rule.mode === "off") return false;

    const direct = isDirectMention(message, myId);
    const everyoneLike = isEveryoneLikeMention(message);

    if (rule.mode === "everyone-only") {
        return everyoneLike;
    }

    if (rule.mode === "all") {
        if (direct && rule.allowDirectMentions) return false;
        return direct || everyoneLike;
    }

    return false;
}

function ackMessage(channelId: string, messageId: string) {
    FluxDispatcher.dispatch({
        type: "BULK_ACK",
        context: "APP",
        channels: [{ channelId, messageId, readStateType: 0 }],
    });
}

const onMessageCreate = ({ message }: { message?: any; }) => {
    const guildId = message?.guild_id;
    if (!guildId || !message?.channel_id || !message?.id) return;

    const myId = UserStore.getCurrentUser()?.id;
    if (!myId) return;

    const rule = getRule(guildId);
    if (!shouldSuppressPing(message, rule, myId)) return;

    if (rule.autoMarkRead) {
        ackMessage(message.channel_id, message.id);
    }
};

const guildCtxPatch: NavContextMenuPatchCallback = (children, { guild }: { guild?: any; }) => {
    if (!guild?.id) return;

    const rule = getRule(guild.id);
    const group = findGroupChildrenByChildId("privacy", children) ?? children;

    group.push(
        <Menu.MenuItem
            id={`record-ping-shield-mode-${guild.id}`}
            label={`Ping Shield Mode: ${rule.mode === "everyone-only" ? "Everyone/Role" : rule.mode === "all" ? "All" : "Off"}`}
            action={() => {
                const nextMode: GuildPingMode = rule.mode === "off"
                    ? "everyone-only"
                    : rule.mode === "everyone-only"
                        ? "all"
                        : "off";
                setRule(guild.id, { mode: nextMode });
            }}
        />,
        <Menu.MenuItem
            id={`record-ping-shield-direct-${guild.id}`}
            label={`Direct @mentions: ${rule.allowDirectMentions ? "Allowed" : "Blocked"}`}
            disabled={rule.mode !== "all"}
            action={() => setRule(guild.id, { allowDirectMentions: !getRule(guild.id).allowDirectMentions })}
        />,
        <Menu.MenuItem
            id={`record-ping-shield-read-${guild.id}`}
            label={`Auto-mark as read: ${rule.autoMarkRead ? "On" : "Off"}`}
            action={() => setRule(guild.id, { autoMarkRead: !getRule(guild.id).autoMarkRead })}
        />
    );
};

export default definePlugin({
    name: "RecordPingShield",
    description: "Per-server ping suppression with @everyone-only mode and instant auto-read.",
    authors: [Devs.Rloxx],
    tags: ["ping", "mentions", "guild", "privacy"],

    contextMenus: {
        "guild-context": guildCtxPatch,
        "guild-header-popout": guildCtxPatch,
    },

    start() {
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate as any);
    },

    stop() {
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate as any);
    },
});
