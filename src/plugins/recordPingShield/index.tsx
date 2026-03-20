/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
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
const Influence = { name: "Influence", id: 0n };

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

async function ackMessage(channelId: string, messageId: string) {
    await FluxDispatcher.dispatch({
        type: "BULK_ACK",
        context: "APP",
        channels: [{ channelId, messageId, readStateType: 0 }],
    });
}

const onMessageCreate = async ({ message }: { message?: any; }) => {
    const guildId = message?.guild_id;
    if (!guildId || !message?.channel_id || !message?.id) return;

    const myId = UserStore.getCurrentUser()?.id;
    if (!myId) return;

    const rule = getRule(guildId);
    if (!shouldSuppressPing(message, rule, myId)) return;

    if (rule.autoMarkRead) {
        await ackMessage(message.channel_id, message.id);
    }
};

const guildCtxPatch: NavContextMenuPatchCallback = (children, { guild }: { guild?: any; }) => {
    if (!guild?.id) return;

    const rule = getRule(guild.id);

    const group = findGroupChildrenByChildId("privacy", children) ?? children;
    group.push(
        <Menu.MenuItem
            id="record-ping-shield"
            label="Ping Shield"
        >
            <Menu.MenuRadioItem
                id="record-ping-shield-off"
                group="record-ping-mode"
                label="Off"
                checked={rule.mode === "off"}
                action={() => setRule(guild.id, { mode: "off" })}
            />
            <Menu.MenuRadioItem
                id="record-ping-shield-everyone"
                group="record-ping-mode"
                label="Disable @everyone / @here / role pings"
                checked={rule.mode === "everyone-only"}
                action={() => setRule(guild.id, { mode: "everyone-only" })}
            />
            <Menu.MenuRadioItem
                id="record-ping-shield-all"
                group="record-ping-mode"
                label="Disable all pings"
                checked={rule.mode === "all"}
                action={() => setRule(guild.id, { mode: "all" })}
            />

            <Menu.MenuSeparator />

            <Menu.MenuCheckboxItem
                id="record-ping-shield-allow-direct"
                label="Allow direct @mentions"
                checked={rule.allowDirectMentions}
                disabled={rule.mode !== "all"}
                action={() => setRule(guild.id, { allowDirectMentions: !rule.allowDirectMentions })}
            />

            <Menu.MenuCheckboxItem
                id="record-ping-shield-auto-read"
                label="Auto-mark pinged messages as read"
                checked={rule.autoMarkRead}
                action={() => setRule(guild.id, { autoMarkRead: !rule.autoMarkRead })}
            />
        </Menu.MenuItem>
    );
};

export default definePlugin({
    name: "RecordPingShield",
    description: "Per-server ping suppression with @everyone-only mode and instant auto-read.",
    authors: [Influence],
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
