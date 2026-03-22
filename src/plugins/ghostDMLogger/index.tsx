/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelType } from "@vencord/discord-types/enums";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { ChannelStore, MessageStore, React, SelectedChannelStore } from "@webpack/common";

import { captureMessages, ensureConversationSnapshot, ensureConversationSnapshotById, getAllGhostConversations, GhostConversationArchive, markConversationGhost, restoreConversationActive, syncPrivateChannelState } from "./storage";

const Influence = { name: "Influence", id: 0n };
const GHOST_DM_PREFIX = "991337";

const SelectedChannelActionCreators = findByPropsLazy("selectPrivateChannel");
const PrivateChannelSortStore = findStoreLazy("PrivateChannelSortStore") as { getPrivateChannelIds(): string[]; };

let ghostConversations: GhostConversationArchive[] = [];
const liveCache: Map<string, GhostConversationArchive> = new Map();
let originalGetSortedPrivateChannels: ((...args: any[]) => any[]) | null = null;
let originalGetChannel: ((...args: any[]) => any) | null = null;
let originalGetMutablePrivateChannels: ((...args: any[]) => Record<string, any>) | null = null;
let originalSelectPrivateChannel: ((...args: any[]) => any) | null = null;
let originalGetMessages: ((...args: any[]) => any) | null = null;
let originalGetMessage: ((...args: any[]) => any) | null = null;
let originalHasPresent: ((...args: any[]) => boolean) | null = null;
let originalIsReady: ((...args: any[]) => boolean) | null = null;
let originalIsLoadingMessages: ((...args: any[]) => boolean) | null = null;
let originalWhenReady: ((...args: any[]) => void) | null = null;
let originalGetPrivateChannelIds: (() => string[]) | null = null;
let ghostStyle: HTMLStyleElement | null = null;

export const settings = definePluginSettings({
    captureEnabled: {
        type: OptionType.BOOLEAN,
        description: "Capture messages from DMs and group chats while they are still accessible.",
        default: true,
    },
    cacheMedia: {
        type: OptionType.BOOLEAN,
        description: "Cache attachment bodies locally when they are small enough to preserve previews after deletion.",
        default: true,
    },
    cacheEmbeds: {
        type: OptionType.BOOLEAN,
        description: "Cache inline embed images locally when possible.",
        default: true,
    },
    maxCachedAssetSizeMb: {
        type: OptionType.SLIDER,
        description: "Maximum size for a cached attachment or image asset.",
        default: 8,
        markers: [1, 2, 4, 8, 12, 16, 24],
        stickToMarkers: true,
    },
    maxMessagesPerChat: {
        type: OptionType.SLIDER,
        description: "Maximum archived messages kept per chat before older entries are trimmed.",
        default: 400,
        markers: [100, 200, 400, 800, 1200, 2000],
    },
    maxChats: {
        type: OptionType.SLIDER,
        description: "Maximum number of tracked DM and group chat archives to retain.",
        default: 80,
        markers: [20, 40, 80, 120, 200],
        stickToMarkers: true,
    },
});

function getCaptureOptions() {
    return {
        cacheMedia: settings.store.cacheMedia,
        cacheEmbeds: settings.store.cacheEmbeds,
        maxCachedAssetSizeMb: settings.store.maxCachedAssetSizeMb,
        maxMessagesPerChat: settings.store.maxMessagesPerChat,
        maxChats: settings.store.maxChats,
    };
}

function toGhostDmId(channelId: string) {
    return `${GHOST_DM_PREFIX}${channelId}`;
}

function fromGhostDmId(ghostId: string) {
    return ghostId.startsWith(GHOST_DM_PREFIX) ? ghostId.slice(GHOST_DM_PREFIX.length) : null;
}

function isGhostDmId(channelId: string | null | undefined): channelId is string {
    return !!channelId && channelId.startsWith(GHOST_DM_PREFIX);
}

function getGhostConversation(channelId: string | null | undefined) {
    const sourceId = fromGhostDmId(String(channelId ?? ""));
    if (!sourceId) return null;
    return ghostConversations.find(entry => entry.channelId === sourceId) ?? null;
}

function rememberActiveConversation(conversation: GhostConversationArchive | null | undefined) {
    if (!conversation) return;
    liveCache.set(conversation.channelId, conversation);
    ghostConversations = ghostConversations.filter(entry => entry.channelId !== conversation.channelId);
}

function promoteConversationToGhost(channelId: string, reason: string) {
    const cached = liveCache.get(channelId);
    if (!cached) return;

    const ghost: GhostConversationArchive = {
        ...cached,
        state: "ghost",
        archivedAt: Date.now(),
        lossReason: reason,
        lastSeenAt: Date.now(),
    };

    ghostConversations = [ghost, ...ghostConversations.filter(entry => entry.channelId !== channelId)];
    liveCache.delete(channelId);
}

async function snapshotConversationForId(channelId: string, reason?: string) {
    const snapshot = await ensureConversationSnapshotById(channelId);
    if (snapshot) {
        if (reason) {
            const ghost: GhostConversationArchive = {
                ...snapshot,
                state: "ghost",
                archivedAt: Date.now(),
                lossReason: reason,
                lastSeenAt: Date.now(),
            };
            ghostConversations = [ghost, ...ghostConversations.filter(entry => entry.channelId !== channelId)];
            liveCache.delete(channelId);
        } else {
            rememberActiveConversation(snapshot);
        }
    }
    return snapshot;
}

async function captureLoadedMessagesForChannel(channelId: string) {
    const loaded = (MessageStore as any).getMessages?.(channelId)?._array;
    if (!Array.isArray(loaded) || !loaded.length) return;
    await captureMessages(channelId, loaded, getCaptureOptions());
}

function makeGhostChannel(conversation: GhostConversationArchive) {
    const baseType = conversation.kind === "group" ? ChannelType.GROUP_DM : ChannelType.DM;
    const id = toGhostDmId(conversation.channelId);

    return {
        id,
        type: baseType,
        name: conversation.title,
        topic: conversation.lossReason || "Read-only archive",
        rawRecipients: conversation.participants.map(participant => ({
            id: participant.id,
            username: participant.username,
            globalName: participant.globalName,
            avatar: participant.avatarUrl,
        })),
        recipients: conversation.participants.map(participant => participant.id),
        lastMessageId: conversation.messages[conversation.messages.length - 1]?.id,
        isManaged: () => false,
        isGroupDM: () => baseType === ChannelType.GROUP_DM,
        isMultiUserDM: () => baseType === ChannelType.GROUP_DM,
        isPrivate: () => true,
        isArchivedGhost: () => true,
    };
}

function toDiscordMessage(conversation: GhostConversationArchive, raw: GhostConversationArchive["messages"][number]) {
    const attachmentPreview = raw.attachments.length
        ? raw.attachments.map(attachment => attachment.fileName).join(", ")
        : "";
    const embedPreview = raw.embeds[0]?.title || raw.embeds[0]?.description || "";
    const content = raw.content || attachmentPreview || embedPreview || "[attachment/embed]";

    return {
        id: raw.id,
        channel_id: toGhostDmId(conversation.channelId),
        content,
        state: "SENT",
        type: raw.messageType ?? 0,
        author: {
            id: raw.author.id,
            username: raw.author.username,
            globalName: raw.author.globalName,
            avatar: raw.author.avatarUrl?.match(/avatars\/[0-9]+\/([^.?/]+)/)?.[1],
            getAvatarURL: () => raw.author.avatarUrl,
        },
        attachments: raw.attachments.map(attachment => ({
            id: attachment.id,
            filename: attachment.fileName,
            url: attachment.cachedDataUrl || attachment.url,
            proxy_url: attachment.proxyUrl || attachment.url,
            content_type: attachment.contentType,
            size: attachment.size,
            width: attachment.width,
            height: attachment.height,
        })),
        embeds: raw.embeds.map(embed => ({
            type: embed.type,
            url: embed.url,
            title: embed.title,
            description: embed.description,
            image: embed.cachedImageDataUrl || embed.imageUrl ? { url: embed.cachedImageDataUrl || embed.imageUrl, proxyURL: embed.cachedImageDataUrl || embed.imageUrl } : void 0,
            thumbnail: embed.cachedImageDataUrl || embed.imageUrl ? { url: embed.cachedImageDataUrl || embed.imageUrl, proxyURL: embed.cachedImageDataUrl || embed.imageUrl } : void 0,
        })),
        message_reference: raw.reference ? {
            channel_id: toGhostDmId(conversation.channelId),
            message_id: raw.reference.messageId,
        } : void 0,
        timestamp: new Date(raw.timestamp).toISOString(),
        edited_timestamp: raw.editedTimestamp ? new Date(raw.editedTimestamp).toISOString() : null,
        mention_everyone: false,
        mention_roles: [],
        mentions: [],
        pinned: false,
        tts: false,
        flags: raw.flags ?? 0,
        addReaction() {
            return this;
        },
        removeReactionsForEmoji() {
            return this;
        },
        getReaction() {
            return void 0;
        },
    };
}

function createGhostMessages(conversation: GhostConversationArchive) {
    const array = conversation.messages.map(message => toDiscordMessage(conversation, message));
    const map = Object.fromEntries(array.map(message => [message.id, message]));

    return {
        channelId: toGhostDmId(conversation.channelId),
        ready: true,
        cached: true,
        jumpType: "INSTANT",
        jumpTargetId: null,
        jumpTargetOffset: 0,
        jumpSequenceId: 0,
        jumped: false,
        jumpedToPresent: true,
        jumpFlash: false,
        jumpReturnTargetId: null,
        focusTargetId: null,
        focusSequenceId: 0,
        initialScrollSequenceId: 0,
        hasMoreBefore: false,
        hasMoreAfter: false,
        loadingMore: false,
        revealedMessageId: null,
        hasFetched: true,
        error: false,
        oldestUnreadMessageId: null,
        _array: array,
        _map: map,
        _before: { _messages: [], _map: {}, _wasAtEdge: true, _isCacheBefore: true },
        _after: { _messages: [], _map: {}, _wasAtEdge: true, _isCacheBefore: false },
        get(messageId: string) {
            return map[messageId];
        },
        has(messageId: string) {
            return messageId in map;
        },
        first() {
            return array[0];
        },
        last() {
            return array[array.length - 1];
        },
        at(index: number) {
            return array.at(index);
        },
        forEach(callback: (message: any, index: number) => void) {
            array.forEach(callback);
        },
        map<T>(callback: (message: any, index: number) => T) {
            return array.map(callback);
        },
        filter(callback: (message: any, index: number) => boolean) {
            return array.filter(callback);
        },
        toArray() {
            return [...array];
        },
        receiveMessage(message: any) {
            return this;
        },
    };
}

function ensureGhostStyle() {
    if (ghostStyle) return;

    ghostStyle = document.createElement("style");
    ghostStyle.id = "record-ghost-dm-style";
    ghostStyle.textContent = `
        [data-list-item-id*="${GHOST_DM_PREFIX}"],
        a[href*="${GHOST_DM_PREFIX}"] {
            filter: grayscale(1);
            opacity: 0.74;
        }
    `;
    document.head.appendChild(ghostStyle);
}

function teardownGhostStyle() {
    ghostStyle?.remove();
    ghostStyle = null;
}

function patchGhostMessageStore() {
    if (originalGetMessages || originalGetMessage || originalHasPresent || originalIsReady || originalIsLoadingMessages || originalWhenReady) return;

    originalGetMessages = (MessageStore as any).getMessages?.bind(MessageStore) ?? null;
    originalGetMessage = (MessageStore as any).getMessage?.bind(MessageStore) ?? null;
    originalHasPresent = (MessageStore as any).hasPresent?.bind(MessageStore) ?? null;
    originalIsReady = (MessageStore as any).isReady?.bind(MessageStore) ?? null;
    originalIsLoadingMessages = (MessageStore as any).isLoadingMessages?.bind(MessageStore) ?? null;
    originalWhenReady = (MessageStore as any).whenReady?.bind(MessageStore) ?? null;

    if (originalGetMessages) {
        (MessageStore as any).getMessages = (channelId: string, ...args: any[]) => {
            const conversation = getGhostConversation(channelId);
            if (conversation) return createGhostMessages(conversation);
            return originalGetMessages?.(channelId, ...args);
        };
    }

    if (originalGetMessage) {
        (MessageStore as any).getMessage = (channelId: string, messageId: string, ...args: any[]) => {
            const conversation = getGhostConversation(channelId);
            if (conversation) {
                return createGhostMessages(conversation).get(messageId);
            }
            return originalGetMessage?.(channelId, messageId, ...args);
        };
    }

    if (originalHasPresent) {
        (MessageStore as any).hasPresent = (channelId: string, ...args: any[]) => {
            if (getGhostConversation(channelId)) return true;
            return originalHasPresent?.(channelId, ...args) ?? false;
        };
    }

    if (originalIsReady) {
        (MessageStore as any).isReady = (channelId: string, ...args: any[]) => {
            if (getGhostConversation(channelId)) return true;
            return originalIsReady?.(channelId, ...args) ?? false;
        };
    }

    if (originalIsLoadingMessages) {
        (MessageStore as any).isLoadingMessages = (channelId: string, ...args: any[]) => {
            if (getGhostConversation(channelId)) return false;
            return originalIsLoadingMessages?.(channelId, ...args) ?? false;
        };
    }

    if (originalWhenReady) {
        (MessageStore as any).whenReady = (channelId: string, callback: () => void, ...args: any[]) => {
            if (getGhostConversation(channelId)) {
                callback();
                return;
            }

            return originalWhenReady?.(channelId, callback, ...args);
        };
    }
}

function unpatchGhostMessageStore() {
    if (originalGetMessages) {
        (MessageStore as any).getMessages = originalGetMessages;
        originalGetMessages = null;
    }

    if (originalGetMessage) {
        (MessageStore as any).getMessage = originalGetMessage;
        originalGetMessage = null;
    }

    if (originalHasPresent) {
        (MessageStore as any).hasPresent = originalHasPresent;
        originalHasPresent = null;
    }

    if (originalIsReady) {
        (MessageStore as any).isReady = originalIsReady;
        originalIsReady = null;
    }

    if (originalIsLoadingMessages) {
        (MessageStore as any).isLoadingMessages = originalIsLoadingMessages;
        originalIsLoadingMessages = null;
    }

    if (originalWhenReady) {
        (MessageStore as any).whenReady = originalWhenReady;
        originalWhenReady = null;
    }
}

async function refreshGhostConversations() {
    const all = await getAllGhostConversations();
    ghostConversations = all.filter(c => c.state === "ghost");
    for (const c of all) {
        if (c.state === "active") liveCache.set(c.channelId, c);
        else liveCache.delete(c.channelId);
    }
}

function patchGhostCopiesInDmList() {
    if (originalGetSortedPrivateChannels || originalGetChannel || originalSelectPrivateChannel) return;

    if (typeof PrivateChannelSortStore?.getPrivateChannelIds === "function") {
        originalGetPrivateChannelIds = PrivateChannelSortStore.getPrivateChannelIds.bind(PrivateChannelSortStore);
        PrivateChannelSortStore.getPrivateChannelIds = () => {
            const ids = originalGetPrivateChannelIds?.() ?? [];
            const ghostIds = ghostConversations.map(conversation => toGhostDmId(conversation.channelId));
            const combined = [...ids, ...ghostIds.filter(id => !ids.includes(id))];

            combined.sort((leftId, rightId) => {
                const leftConversation = getGhostConversation(leftId);
                const rightConversation = getGhostConversation(rightId);
                const leftChannel = ChannelStore.getChannel(leftId);
                const rightChannel = ChannelStore.getChannel(rightId);
                const leftTs = Number(leftConversation?.lastMessageAt ?? leftChannel?.lastMessageId ?? 0);
                const rightTs = Number(rightConversation?.lastMessageAt ?? rightChannel?.lastMessageId ?? 0);
                return rightTs - leftTs;
            });

            return combined;
        };
    }

    if (typeof (ChannelStore as any).getSortedPrivateChannels === "function") {
        originalGetSortedPrivateChannels = (ChannelStore as any).getSortedPrivateChannels.bind(ChannelStore);
        (ChannelStore as any).getSortedPrivateChannels = (...args: any[]) => {
            const list: any[] = originalGetSortedPrivateChannels?.(...args) ?? [];
            if (!ghostConversations.length) return list;
            const ghostEntries = ghostConversations.map(makeGhostChannel);
            const combined = [...list, ...ghostEntries];
            combined.sort((a, b) => {
                try {
                    const aid = BigInt(a.lastMessageId ?? "0");
                    const bid = BigInt(b.lastMessageId ?? "0");
                    return aid > bid ? -1 : aid < bid ? 1 : 0;
                } catch {
                    return 0;
                }
            });
            return combined;
        };
    }

    if (typeof (ChannelStore as any).getMutablePrivateChannels === "function") {
        originalGetMutablePrivateChannels = (ChannelStore as any).getMutablePrivateChannels.bind(ChannelStore);
        (ChannelStore as any).getMutablePrivateChannels = (...args: any[]) => {
            const map = { ...(originalGetMutablePrivateChannels?.(...args) ?? {}) };
            for (const conversation of ghostConversations) {
                map[toGhostDmId(conversation.channelId)] = makeGhostChannel(conversation);
            }
            return map;
        };
    }

    if (typeof (ChannelStore as any).getChannel === "function") {
        originalGetChannel = (ChannelStore as any).getChannel.bind(ChannelStore);
        (ChannelStore as any).getChannel = (id: string, ...args: any[]) => {
            const original = originalGetChannel?.(id, ...args);
            if (original) return original;

            const sourceId = fromGhostDmId(String(id));
            if (!sourceId) return original;

            const conversation = ghostConversations.find(entry => entry.channelId === sourceId);
            return conversation ? makeGhostChannel(conversation) : original;
        };
    }

    if (typeof (SelectedChannelActionCreators as any)?.selectPrivateChannel === "function") {
        originalSelectPrivateChannel = (SelectedChannelActionCreators as any).selectPrivateChannel.bind(SelectedChannelActionCreators);
        (SelectedChannelActionCreators as any).selectPrivateChannel = (id: string, ...args: any[]) => {
            return originalSelectPrivateChannel?.(id, ...args);
        };
    }
}

function unpatchGhostCopiesInDmList() {
    if (originalGetPrivateChannelIds) {
        PrivateChannelSortStore.getPrivateChannelIds = originalGetPrivateChannelIds;
        originalGetPrivateChannelIds = null;
    }

    if (originalGetSortedPrivateChannels) {
        (ChannelStore as any).getSortedPrivateChannels = originalGetSortedPrivateChannels;
        originalGetSortedPrivateChannels = null;
    }

    if (originalGetChannel) {
        (ChannelStore as any).getChannel = originalGetChannel;
        originalGetChannel = null;
    }

    if (originalGetMutablePrivateChannels) {
        (ChannelStore as any).getMutablePrivateChannels = originalGetMutablePrivateChannels;
        originalGetMutablePrivateChannels = null;
    }

    if (originalSelectPrivateChannel) {
        (SelectedChannelActionCreators as any).selectPrivateChannel = originalSelectPrivateChannel;
        originalSelectPrivateChannel = null;
    }
}

const onMessagesLoaded = async ({ channelId, messages }: { channelId?: string; messages?: any[]; }) => {
    if (!settings.store.captureEnabled || !channelId || !Array.isArray(messages) || !messages.length) return;
    await captureMessages(String(channelId), messages, getCaptureOptions());
    const snapshot = await ensureConversationSnapshotById(String(channelId));
    rememberActiveConversation(snapshot);
};

const onMessageCreate = async ({ message }: { message?: any; }) => {
    const channelId = message?.channel_id;
    if (!settings.store.captureEnabled || !channelId || !message) return;
    await captureMessages(String(channelId), [message], getCaptureOptions());
    const snapshot = await ensureConversationSnapshotById(String(channelId));
    rememberActiveConversation(snapshot);
};

function extractChannelId(payload: any) {
    return String(payload?.channelId ?? payload?.id ?? payload?.channel?.id ?? "");
}

const onChannelDelete = (payload: any) => {
    const channelId = extractChannelId(payload);
    if (!channelId) return;

    void captureLoadedMessagesForChannel(channelId);
    void snapshotConversationForId(channelId, "Channel deleted or closed");
    promoteConversationToGhost(channelId, "Channel deleted or closed");
    void markConversationGhost(channelId, "Channel deleted or closed");
};

const onChannelCreate = (payload: any) => {
    const channelId = extractChannelId(payload);
    if (!channelId) return;

    const channel = payload?.channel;
    if (channel) {
        void ensureConversationSnapshot(channel).then(rememberActiveConversation);
    } else {
        void snapshotConversationForId(channelId);
    }

    void captureLoadedMessagesForChannel(channelId);
    void restoreConversationActive(channelId);
};

const onRecipientAdd = (payload: any) => {
    const channelId = extractChannelId(payload);
    if (!channelId) return;

    if (payload?.channel) {
        void ensureConversationSnapshot(payload.channel).then(rememberActiveConversation);
    } else {
        void snapshotConversationForId(channelId);
    }

    void captureLoadedMessagesForChannel(channelId);
};

const onRecipientRemove = (payload: any) => {
    const channelId = extractChannelId(payload);
    if (!channelId) return;

    void captureLoadedMessagesForChannel(channelId);
    void snapshotConversationForId(channelId, "Removed from group chat");
    promoteConversationToGhost(channelId, "Removed from group chat");
    void markConversationGhost(channelId, "Removed from group chat");
};

let syncInterval: number | null = null;
let fastCaptureInterval: number | null = null;
let fastCaptureInFlight = false;
const lastFastCaptureAt = new Map<string, number>();

async function runFastCaptureProbe() {
    if (!settings.store.captureEnabled || fastCaptureInFlight) return;

    fastCaptureInFlight = true;
    try {
        const now = Date.now();
        const ids = new Set<string>();
        const selected = String(SelectedChannelStore.getChannelId?.() ?? "");

        if (selected) ids.add(selected);

        for (const channel of ChannelStore.getSortedPrivateChannels()) {
            const id = String(channel?.id ?? "");
            if (id) ids.add(id);
        }

        for (const channelId of ids) {
            if (isGhostDmId(channelId)) continue;

            const lastProbe = lastFastCaptureAt.get(channelId) ?? 0;
            if (now - lastProbe < 1250) continue;
            lastFastCaptureAt.set(channelId, now);

            const snapshot = await ensureConversationSnapshotById(channelId);
            rememberActiveConversation(snapshot);
            await captureLoadedMessagesForChannel(channelId);
        }
    } finally {
        fastCaptureInFlight = false;
    }
}

export default definePlugin({
    name: "GhostDMLogger",
    description: "Passively archives DM and group chat history into local ghost copies when access disappears.",
    authors: [Influence],
    tags: ["dm", "archive", "privacy", "record"],
    settings,

    flux: {
        LOAD_MESSAGES_SUCCESS: onMessagesLoaded,
        MESSAGE_CREATE: onMessageCreate,
        CHANNEL_DELETE: onChannelDelete,
        CHANNEL_CREATE: onChannelCreate,
        CHANNEL_RECIPIENT_ADD: onRecipientAdd,
        CHANNEL_RECIPIENT_REMOVE: onRecipientRemove,
        PRIVATE_CHANNEL_RECIPIENTS_REMOVE_USER: onRecipientRemove,
        CONNECTION_OPEN: () => {
            void syncPrivateChannelState();
            void runFastCaptureProbe();
        },
    },

    async start() {
        await syncPrivateChannelState();
        await refreshGhostConversations();
        patchGhostCopiesInDmList();
        patchGhostMessageStore();
        ensureGhostStyle();

        await runFastCaptureProbe();

        syncInterval = window.setInterval(() => {
            void syncPrivateChannelState();
            void refreshGhostConversations();
        }, 15000);

        fastCaptureInterval = window.setInterval(() => {
            void runFastCaptureProbe();
        }, 1200);
    },

    stop() {
        if (syncInterval != null) {
            window.clearInterval(syncInterval);
            syncInterval = null;
        }

        if (fastCaptureInterval != null) {
            window.clearInterval(fastCaptureInterval);
            fastCaptureInterval = null;
        }

        fastCaptureInFlight = false;
        lastFastCaptureAt.clear();

        unpatchGhostCopiesInDmList();
        unpatchGhostMessageStore();
        teardownGhostStyle();
    },
});
