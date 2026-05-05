/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { findLazy } from "@webpack";
import { Alerts, ChannelStore, Constants, FluxDispatcher, Menu, PermissionsBits, PermissionStore, React, RestAPI, showToast, Toasts, UserStore } from "@webpack/common";

const logger = new Logger("RecordPurger");

const HIDDEN_MESSAGES_KEY = "record_hidden_messages";

type HiddenMessages = Record<string, Record<string, true>>;
type PurgeAction = "delete" | "hide" | "both";
type PrivateBulkAction = "close-dms" | "leave-groups" | "both";
type DmFilterMode = "allowlist" | "denylist";

const ChannelTypes = findLazy(m => m.GROUP_DM === 3 && m.DM === 1) as { DM: number; GROUP_DM: number; };

const settings = definePluginSettings({
    deleteDelay: {
        type: OptionType.SLIDER,
        description: "Delay between each action (ms). Lower is faster but more likely to hit rate limits.",
        default: 500,
        markers: [200, 350, 500, 750, 1000, 1500],
    },
    skipPinned: {
        type: OptionType.BOOLEAN,
        description: "Skip pinned messages when deleting/hiding",
        default: true,
    },
    enablePurgeAllOpenDms: {
        type: OptionType.BOOLEAN,
        description: "Enable menu action to purge messages across all open DMs.",
        default: true,
    },
    includeGroupDmsInPurge: {
        type: OptionType.BOOLEAN,
        description: "Include group DMs in the purge-all-open-DMs action.",
        default: false,
    },
    dmFilterMode: {
        type: OptionType.SELECT,
        description: "How DM filter lists are applied for purge-all-open-DMs.",
        options: [
            { label: "Allowlist (only listed)", value: "allowlist", default: true },
            { label: "Denylist (exclude listed)", value: "denylist" },
        ] as { label: string; value: DmFilterMode; default?: boolean; }[],
    },
    dmWhitelist: {
        type: OptionType.STRING,
        description: "Comma-separated DM channel IDs or user IDs to include.",
        default: "",
    },
    dmBlacklist: {
        type: OptionType.STRING,
        description: "Comma-separated DM channel IDs or user IDs to exclude.",
        default: "",
    },
});

let activeTask: { stop: () => void; } | null = null;

function loadHiddenMessages(): HiddenMessages {
    try { return JSON.parse(localStorage.getItem(HIDDEN_MESSAGES_KEY) ?? "{}"); } catch { return {}; }
}

function saveHiddenMessages(data: HiddenMessages) {
    try { localStorage.setItem(HIDDEN_MESSAGES_KEY, JSON.stringify(data)); } catch { /* noop */ }
}

function markMessageHidden(channelId: string, messageId: string) {
    const data = loadHiddenMessages();
    data[channelId] ??= {};
    data[channelId][messageId] = true;
    saveHiddenMessages(data);
}

function isMessageHidden(channelId: string, messageId: string) {
    return !!loadHiddenMessages()[channelId]?.[messageId];
}

function hideMessageLocally(channelId: string, messageId: string) {
    markMessageHidden(channelId, messageId);
    FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", channelId, id: messageId, mlDeleted: true });
}

function applyHiddenToMessage(channelId: string, messageId: string) {
    if (!isMessageHidden(channelId, messageId)) return;
    FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", channelId, id: messageId, mlDeleted: true });
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchMessages(channelId: string, before?: string): Promise<any[]> {
    try {
        const query: Record<string, string> = { limit: "100" };
        if (before) query.before = before;
        const res = await RestAPI.get({
            url: Constants.Endpoints.MESSAGES(channelId),
            query,
        });
        return Array.isArray(res?.body) ? res.body : [];
    } catch (e) {
        logger.error("fetchMessages failed:", e);
        return [];
    }
}

async function deleteOneMessage(channelId: string, messageId: string): Promise<{ ok: boolean; retryAfterMs?: number; }> {
    try {
        await RestAPI.del({ url: `${Constants.Endpoints.MESSAGES(channelId)}/${messageId}` });
        return { ok: true };
    } catch (e: any) {
        if (e?.status === 429) {
            const retryAfter = (e?.body?.retry_after ?? 1) as number;
            return { ok: false, retryAfterMs: Math.ceil(retryAfter * 1000) + 200 };
        }
        return { ok: true };
    }
}

async function deleteWithRetry(channelId: string, messageId: string, stopped: () => boolean): Promise<boolean> {
    let result = await deleteOneMessage(channelId, messageId);
    while (!stopped() && !result.ok && result.retryAfterMs) {
        showToast(`Rate limited – waiting ${(result.retryAfterMs / 1000).toFixed(1)}s...`, Toasts.Type.MESSAGE);
        await sleep(result.retryAfterMs);
        result = await deleteOneMessage(channelId, messageId);
    }
    return !stopped();
}

function actionLabel(action: PurgeAction) {
    if (action === "delete") return "delete";
    if (action === "hide") return "hide";
    return "delete + hide";
}

function parseFilterList(raw: string) {
    return new Set(
        raw
            .split(",")
            .map(s => s.trim())
            .filter(Boolean)
    );
}

function getChannelRecipientIds(channel: any): string[] {
    const ids = channel?.rawRecipients?.map?.((r: any) => r?.id)
        ?? channel?.recipients
        ?? [];
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
}

function shouldIncludePrivateChannel(channel: any) {
    const mode = settings.store.dmFilterMode as DmFilterMode;
    const allow = parseFilterList(settings.store.dmWhitelist);
    const deny = parseFilterList(settings.store.dmBlacklist);

    const channelId = channel?.id;
    const recipientIds = getChannelRecipientIds(channel);
    const matches = (set: Set<string>) => {
        if (!set.size) return false;
        if (channelId && set.has(channelId)) return true;
        return recipientIds.some(id => set.has(id));
    };

    if (mode === "allowlist") {
        if (!allow.size) return true;
        return matches(allow);
    }

    if (!deny.size) return true;
    return !matches(deny);
}

async function processChannelMessages(channelId: string, onlyMine: boolean, action: PurgeAction, stopped: () => boolean, stats: { processed: number; }) {
    const myId = UserStore.getCurrentUser()?.id;
    let before: string | undefined;

    outer: while (!stopped()) {
        const messages = await fetchMessages(channelId, before);
        if (!messages.length) break;

        before = messages[messages.length - 1].id;

        for (const msg of messages) {
            if (stopped()) break outer;
            if (onlyMine && msg.author?.id !== myId) continue;
            if (settings.store.skipPinned && msg.pinned) continue;

            if (action === "delete" || action === "both") {
                const ok = await deleteWithRetry(channelId, msg.id, stopped);
                if (!ok) break outer;
            }

            if (!stopped() && (action === "hide" || action === "both")) {
                hideMessageLocally(channelId, msg.id);
            }

            if (!stopped()) {
                stats.processed++;
                if (stats.processed % 10 === 0) {
                    showToast(`Processed ${stats.processed} messages...`, Toasts.Type.MESSAGE);
                }
                await sleep(settings.store.deleteDelay);
            }
        }

        if (messages.length < 100) break;
        await sleep(300);
    }
}

async function startPurge(channelId: string, onlyMine: boolean, action: PurgeAction) {
    if (activeTask) {
        activeTask.stop();
        activeTask = null;
    }

    let stopped = false;
    activeTask = { stop: () => { stopped = true; } };

    const stats = { processed: 0 };

    showToast(`Starting ${actionLabel(action)} task...`, Toasts.Type.MESSAGE);

    try {
        await processChannelMessages(channelId, onlyMine, action, () => stopped, stats);
    } catch (err) {
        logger.error("Purge task error:", err);
    }

    activeTask = null;

    if (stopped) {
        showToast(`Task stopped after ${stats.processed} messages.`, Toasts.Type.MESSAGE);
    } else {
        showToast(`Done: ${stats.processed} messages processed.`, Toasts.Type.SUCCESS);
    }
}

async function startPurgeAllOpenDms(onlyMine: boolean, action: PurgeAction) {
    if (activeTask) {
        activeTask.stop();
        activeTask = null;
    }

    let stopped = false;
    activeTask = { stop: () => { stopped = true; } };

    const channels = ChannelStore.getSortedPrivateChannels();
    const selected = channels.filter(c => {
        if (c.type === ChannelTypes.DM) return true;
        if (settings.store.includeGroupDmsInPurge && c.type === ChannelTypes.GROUP_DM) return true;
        return false;
    }).filter(shouldIncludePrivateChannel);

    const stats = { processed: 0 };
    showToast(`Starting purge across ${selected.length} private channels...`, Toasts.Type.MESSAGE);

    try {
        for (const channel of selected) {
            if (stopped) break;
            await processChannelMessages(channel.id, onlyMine, action, () => stopped, stats);
            await sleep(200);
        }
    } catch (err) {
        logger.error("Purge all open DMs failed:", err);
    }

    activeTask = null;

    if (stopped) {
        showToast(`Task stopped after ${stats.processed} messages.`, Toasts.Type.MESSAGE);
    } else {
        showToast(`Done: ${stats.processed} messages processed across private channels.`, Toasts.Type.SUCCESS);
    }
}

async function deleteChannelWithRetry(channelId: string, stopped: () => boolean): Promise<boolean> {
    while (!stopped()) {
        try {
            await RestAPI.del({ url: `/channels/${channelId}` });
            return true;
        } catch (e: any) {
            if (e?.status === 429) {
                const retryAfterMs = Math.ceil(((e?.body?.retry_after ?? 1) as number) * 1000) + 200;
                await sleep(retryAfterMs);
                continue;
            }
            return true;
        }
    }

    return false;
}

async function startPrivateBulk(action: PrivateBulkAction) {
    if (activeTask) {
        activeTask.stop();
        activeTask = null;
    }

    let stopped = false;
    activeTask = { stop: () => { stopped = true; } };

    const channels = ChannelStore.getSortedPrivateChannels();
    const selected = channels.filter(c => {
        if (action === "close-dms") return c.type === ChannelTypes.DM;
        if (action === "leave-groups") return c.type === ChannelTypes.GROUP_DM;
        return c.type === ChannelTypes.DM || c.type === ChannelTypes.GROUP_DM;
    });

    let processed = 0;
    showToast(`Starting private channel cleanup (${selected.length} channels)...`, Toasts.Type.MESSAGE);

    try {
        for (const channel of selected) {
            if (stopped) break;
            const ok = await deleteChannelWithRetry(channel.id, () => stopped);
            if (!ok) break;
            processed++;
            if (processed % 10 === 0) showToast(`Processed ${processed} channels...`, Toasts.Type.MESSAGE);
            await sleep(settings.store.deleteDelay);
        }
    } catch (err) {
        logger.error("Private bulk action failed:", err);
    }

    activeTask = null;
    showToast(stopped ? `Stopped after ${processed} channels.` : `Done: ${processed} channels processed.`, stopped ? Toasts.Type.MESSAGE : Toasts.Type.SUCCESS);
}

function canDeleteAll(channel: any): boolean {
    return !!(channel && PermissionStore.can(PermissionsBits.MANAGE_MESSAGES, channel));
}

function isPrivateChannel(channel: any) {
    return channel?.type === ChannelTypes.DM || channel?.type === ChannelTypes.GROUP_DM;
}

function confirmPurge(channel: any, onlyMine: boolean, action: PurgeAction) {
    const scope = onlyMine ? "your" : "all";
    Alerts.show({
        title: "Purge / Hide Messages",
        body: `Run ${actionLabel(action)} on ${scope} messages in this channel?`,
        confirmText: "Run",
        cancelText: "Cancel",
        confirmColor: "vc-danger",
        onConfirm: () => startPurge(channel.id, onlyMine, action),
    });
}

function confirmPrivateBulk(action: PrivateBulkAction) {
    const label = action === "close-dms"
        ? "close all DMs"
        : action === "leave-groups"
            ? "leave all group DMs"
            : "close all DMs and leave all group DMs";

    Alerts.show({
        title: "Private Channels",
        body: `Are you sure you want to ${label}?`,
        confirmText: "Run",
        cancelText: "Cancel",
        confirmColor: "vc-danger",
        onConfirm: () => startPrivateBulk(action),
    });
}

function confirmPurgeAllOpenDms() {
    Alerts.show({
        title: "Purge All Open DMs",
        body: "Delete and locally hide your messages across all open DMs that pass whitelist/blacklist filters?",
        confirmText: "Run",
        cancelText: "Cancel",
        confirmColor: "vc-danger",
        onConfirm: () => startPurgeAllOpenDms(true, "both")
    });
}

function buildMenuItems(channel: any) {
    const items: React.ReactNode[] = [];
    const running = activeTask !== null;
    const privateChannel = isPrivateChannel(channel);

    if (running) {
        items.push(
            <Menu.MenuItem
                key="record-task-stop"
                id="record-task-stop"
                label="Stop Active Task"
                color="danger"
                action={() => {
                    activeTask?.stop();
                    activeTask = null;
                    showToast("Task stopped.", Toasts.Type.MESSAGE);
                }}
            />
        );

        return items;
    }

    const addScopeItems = (label: string, onlyMine: boolean, requireManageMessages: boolean) => {
        if (requireManageMessages && !(canDeleteAll(channel) || privateChannel)) return;

        items.push(
            <Menu.MenuItem key={`record-${label}-delete`} id={`record-${label}-delete`} label={`Purge ${label} (Delete)`} color="danger" action={() => confirmPurge(channel, onlyMine, "delete")} />,
            <Menu.MenuItem key={`record-${label}-hide`} id={`record-${label}-hide`} label={`Hide ${label}`} color="danger" action={() => confirmPurge(channel, onlyMine, "hide")} />,
            <Menu.MenuItem key={`record-${label}-both`} id={`record-${label}-both`} label={`Purge ${label} (Delete + Hide)`} color="danger" action={() => confirmPurge(channel, onlyMine, "both")} />,
        );
    };

    items.push(
        <Menu.MenuSeparator key="record-sep-my" />,
    );
    addScopeItems("My Messages", true, false);

    items.push(<Menu.MenuSeparator key="record-sep-all" />);
    addScopeItems("All Messages", false, true);

    if (privateChannel) {
        items.push(
            <Menu.MenuSeparator key="record-sep-private" />,
            settings.store.enablePurgeAllOpenDms && <Menu.MenuItem key="record-purge-all-open-dms" id="record-purge-all-open-dms" label="Purge All Open DMs (My Messages)" color="danger" action={confirmPurgeAllOpenDms} />,
            <Menu.MenuItem key="record-close-all-dms" id="record-close-all-dms" label="Close All DMs" color="danger" action={() => confirmPrivateBulk("close-dms")} />,
            <Menu.MenuItem key="record-leave-all-groups" id="record-leave-all-groups" label="Leave All Group DMs" color="danger" action={() => confirmPrivateBulk("leave-groups")} />,
            <Menu.MenuItem key="record-close-and-leave" id="record-close-and-leave" label="Close DMs + Leave Groups" color="danger" action={() => confirmPrivateBulk("both")} />,
        );
    }

    return items;
}

const patchChannelCtx: NavContextMenuPatchCallback = (children, { channel }) => {
    if (!channel?.id) return;
    const items = buildMenuItems(channel);
    if (!items.length) return;

    const group = findGroupChildrenByChildId("mark-channel-read", children) ?? children;
    group.push(<Menu.MenuGroup>{items}</Menu.MenuGroup>);
};

const patchUserCtx: NavContextMenuPatchCallback = (children, { channel }) => {
    const resolvedChannel = channel;
    if (!resolvedChannel?.id) return;
    const items = buildMenuItems(resolvedChannel);
    if (!items.length) return;

    children.push(<Menu.MenuGroup>{items}</Menu.MenuGroup>);
};

const onMessagesLoaded = ({ channelId, messages }: { channelId: string; messages?: Array<{ id: string }>; }) => {
    if (!messages?.length) return;
    for (const message of messages) applyHiddenToMessage(channelId, message.id);
};

const onMessageCreate = ({ channelId, message }: { channelId: string; message?: { id: string }; }) => {
    if (!message?.id) return;
    applyHiddenToMessage(channelId, message.id);
};

export default definePlugin({
    name: "RecordPurger",
    description: "Bulk purge/hide messages, close all DMs, and leave all group DMs with rate-limit handling.",
    authors: [Devs.Rloxx],
    tags: ["purge", "hide", "messages", "dm", "group"],

    settings,

    contextMenus: {
        "channel-context": patchChannelCtx,
        "thread-context": patchChannelCtx,
        "gdm-context": patchChannelCtx,
        "user-context": patchUserCtx,
    },

    start() {
        FluxDispatcher.subscribe("LOAD_MESSAGES_SUCCESS", onMessagesLoaded);
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
    },

    stop() {
        if (activeTask) {
            activeTask.stop();
            activeTask = null;
        }

        FluxDispatcher.unsubscribe("LOAD_MESSAGES_SUCCESS", onMessagesLoaded);
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
    },
});
