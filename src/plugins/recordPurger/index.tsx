/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { Alerts, Constants, Menu, PermissionsBits, PermissionStore, RestAPI, showToast, Toasts, UserStore } from "@webpack/common";

const logger = new Logger("RecordPurger");

const settings = definePluginSettings({
    deleteDelay: {
        type: OptionType.SLIDER,
        description: "Delay between each delete (ms). Lower = faster but more likely to get rate-limited.",
        default: 500,
        markers: [200, 350, 500, 750, 1000, 1500],
    },
    skipPinned: {
        type: OptionType.BOOLEAN,
        description: "Skip pinned messages when purging",
        default: true,
    },
});

// ─── State ────────────────────────────────────────────────────────────────────

let activePurge: { stop: () => void; } | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
        // 403 / 404 — skip silently
        return { ok: true };
    }
}

// ─── Core purger ──────────────────────────────────────────────────────────────

async function startPurge(channelId: string, onlyMine: boolean) {
    if (activePurge) {
        activePurge.stop();
        activePurge = null;
    }

    let stopped = false;
    activePurge = { stop: () => { stopped = true; } };

    const myId = UserStore.getCurrentUser()?.id;
    let deleted = 0;
    let before: string | undefined;

    const toast = (msg: string, type = Toasts.Type.MESSAGE) => {
        showToast(msg, type);
    };

    toast("Purger started – hold on...");

    try {
        outer: while (!stopped) {
            const messages = await fetchMessages(channelId, before);
            if (!messages.length) break;

            before = messages[messages.length - 1].id;

            for (const msg of messages) {
                if (stopped) break outer;
                if (onlyMine && msg.author?.id !== myId) continue;
                if (settings.store.skipPinned && msg.pinned) continue;

                // Attempt delete with automatic retry on 429
                let result = await deleteOneMessage(channelId, msg.id);
                while (!stopped && !result.ok && result.retryAfterMs) {
                    toast(`Rate limited – waiting ${(result.retryAfterMs / 1000).toFixed(1)}s...`);
                    await sleep(result.retryAfterMs);
                    result = await deleteOneMessage(channelId, msg.id);
                }

                if (!stopped) {
                    deleted++;
                    if (deleted % 10 === 0) toast(`Deleted ${deleted} messages so far...`);
                    await sleep(settings.store.deleteDelay);
                }
            }

            // If we got fewer than 100 messages – no more pages
            if (messages.length < 100) break;

            // Small pause between batch fetches
            await sleep(300);
        }
    } catch (err) {
        logger.error("Purge error:", err);
    }

    activePurge = null;

    if (stopped) {
        toast(`Purge stopped after deleting ${deleted} messages.`, Toasts.Type.MESSAGE);
    } else {
        toast(`Purge complete! Deleted ${deleted} messages.`, Toasts.Type.SUCCESS);
    }
}

// ─── Context menu helpers ─────────────────────────────────────────────────────

function canDeleteAll(channel: any): boolean {
    return !!(channel && PermissionStore.can(PermissionsBits.MANAGE_MESSAGES, channel));
}

function buildMenuItems(channel: any) {
    const items: JSX.Element[] = [];
    const isRunning = activePurge !== null;

    if (isRunning) {
        items.push(
            <Menu.MenuItem
                key="record-purger-stop"
                id="record-purger-stop"
                label="⏹  Stop Purge"
                color="danger"
                action={() => {
                    activePurge?.stop();
                    activePurge = null;
                    showToast("Purge stopped.", Toasts.Type.MESSAGE);
                }}
            />
        );
        return items;
    }

    items.push(
        <Menu.MenuItem
            key="record-purger-mine"
            id="record-purger-mine"
            label="🗑  Purge My Messages"
            color="danger"
            action={() => confirmPurge(channel, true)}
        />
    );

    if (canDeleteAll(channel)) {
        items.push(
            <Menu.MenuItem
                key="record-purger-all"
                id="record-purger-all"
                label="🗑  Purge ALL Messages"
                color="danger"
                action={() => confirmPurge(channel, false)}
            />
        );
    }

    return items;
}

function confirmPurge(channel: any, onlyMine: boolean) {
    const scope = onlyMine ? "your" : "ALL";
    Alerts.show({
        title: "Purge Messages",
        body: `Delete ${scope} messages in this channel? This is irreversible and may take a while.`,
        confirmText: "Purge",
        cancelText: "Cancel",
        confirmColor: "vc-danger",
        onConfirm: () => startPurge(channel.id, onlyMine),
    });
}

// ─── Context menu patches ─────────────────────────────────────────────────────

const patchChannelCtx: NavContextMenuPatchCallback = (children, { channel }) => {
    if (!channel?.id) return;
    const items = buildMenuItems(channel);
    if (!items.length) return;

    const group = findGroupChildrenByChildId("mark-channel-read", children) ?? children;
    group.push(
        <Menu.MenuGroup>
            {items}
        </Menu.MenuGroup>
    );
};

const patchUserCtx: NavContextMenuPatchCallback = (children, { channel }) => {
    if (!channel?.id) return;
    const items = buildMenuItems(channel);
    if (!items.length) return;

    children.push(
        <Menu.MenuGroup>
            {items}
        </Menu.MenuGroup>
    );
};

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "RecordPurger",
    description: "Bulk-delete messages in any channel with automatic rate-limit handling and progress reporting.",
    authors: [Devs.Rloxx],
    tags: ["purge", "delete", "messages", "bulk"],

    settings,

    contextMenus: {
        "channel-context": patchChannelCtx,
        "thread-context": patchChannelCtx,
        "gdm-context": patchChannelCtx,
        "user-context": patchUserCtx,
    },

    stop() {
        if (activePurge) {
            activePurge.stop();
            activePurge = null;
        }
    },
});
