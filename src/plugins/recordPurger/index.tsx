/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { Alerts, ChannelStore, Constants, FluxDispatcher, Menu, PermissionsBits, PermissionStore, RestAPI, showToast, Toasts, UserStore } from "@webpack/common";
import { findLazy } from "@webpack";

const logger = new Logger("RecordPurger");
const Influence = { name: "Influence", id: 0n };

const HIDDEN_MESSAGES_KEY = "record_hidden_messages";
const PURGE_MODE_KEY = "record_purger_mode";

type HiddenMessages = Record<string, Record<string, true>>;
type PurgeAction = "delete" | "hide" | "both";
type PrivateBulkAction = "close-dms" | "leave-groups" | "both";

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
});

let activeTask: { stop: () => void; } | null = null;

function loadHiddenMessages(): HiddenMessages {
    try { return JSON.parse(localStorage.getItem(HIDDEN_MESSAGES_KEY) ?? "{}"); } catch { return {}; }
}

function getPurgeMode(): PurgeAction {
    const mode = localStorage.getItem(PURGE_MODE_KEY);
    return mode === "delete" || mode === "hide" || mode === "both" ? mode : "both";
}

function setPurgeMode(mode: PurgeAction) {
    localStorage.setItem(PURGE_MODE_KEY, mode);
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

async function startPurge(channelId: string, onlyMine: boolean, action: PurgeAction) {
    if (activeTask) {
        activeTask.stop();
        activeTask = null;
    }

    let stopped = false;
    activeTask = { stop: () => { stopped = true; } };

    const myId = UserStore.getCurrentUser()?.id;
    let processed = 0;
    let before: string | undefined;

    showToast(`Starting ${actionLabel(action)} task...`, Toasts.Type.MESSAGE);

    try {
        outer: while (!stopped) {
            const messages = await fetchMessages(channelId, before);
            if (!messages.length) break;

            before = messages[messages.length - 1].id;

            for (const msg of messages) {
                if (stopped) break outer;
                if (onlyMine && msg.author?.id !== myId) continue;
                if (settings.store.skipPinned && msg.pinned) continue;

                if (action === "delete" || action === "both") {
                    const ok = await deleteWithRetry(channelId, msg.id, () => stopped);
                    if (!ok) break outer;
                }

                if (!stopped && (action === "hide" || action === "both")) {
                    hideMessageLocally(channelId, msg.id);
                }

                if (!stopped) {
                    processed++;
                    if (processed % 10 === 0) {
                        showToast(`Processed ${processed} messages...`, Toasts.Type.MESSAGE);
                    }
                    await sleep(settings.store.deleteDelay);
                }
            }

            if (messages.length < 100) break;
            await sleep(300);
        }
    } catch (err) {
        logger.error("Purge task error:", err);
    }

    activeTask = null;

    if (stopped) {
        showToast(`Task stopped after ${processed} messages.`, Toasts.Type.MESSAGE);
    } else {
        showToast(`Done: ${processed} messages processed.`, Toasts.Type.SUCCESS);
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

function buildMenuItems(channel: any) {
    const items: JSX.Element[] = [];
    const running = activeTask !== null;
    const privateChannel = isPrivateChannel(channel);
    const mode = getPurgeMode();

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

    items.push(
        <Menu.MenuItem key="record-mode" id="record-mode" label={`Mode: ${actionLabel(mode)}`}>
            <Menu.MenuRadioItem id="record-mode-delete" group="record-purge-mode" label="Delete" checked={mode === "delete"} action={() => setPurgeMode("delete")} />
            <Menu.MenuRadioItem id="record-mode-hide" group="record-purge-mode" label="Hide" checked={mode === "hide"} action={() => setPurgeMode("hide")} />
            <Menu.MenuRadioItem id="record-mode-both" group="record-purge-mode" label="Delete + Hide" checked={mode === "both"} action={() => setPurgeMode("both")} />
        </Menu.MenuItem>,
        <Menu.MenuItem key="record-run-my" id="record-run-my" label="Run On My Messages" color="danger" action={() => confirmPurge(channel, true, getPurgeMode())} />,
    );

    if (canDeleteAll(channel) || privateChannel) {
        items.push(
            <Menu.MenuItem key="record-run-all" id="record-run-all" label="Run On All Messages" color="danger" action={() => confirmPurge(channel, false, getPurgeMode())} />,
        );
    }

    if (privateChannel) {
        items.push(
            <Menu.MenuSeparator key="record-sep-private" />,
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
    if (!channel?.id) return;
    const items = buildMenuItems(channel);
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
    authors: [Influence],
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
