/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { ChannelType } from "@vencord/discord-types/enums";
import { ChannelStore, UserStore } from "@webpack/common";

const INDEX_KEY = "ghost_dm_logger_index_v1";
const CHANNEL_KEY_PREFIX = "ghost_dm_logger_channel_v1_";
export const GHOST_DM_UPDATE_EVENT = "record-ghost-dm-updated";

const writeQueues = new Map<string, Promise<void>>();

export type GhostConversationKind = "dm" | "group";
export type GhostConversationState = "active" | "ghost";

export interface GhostParticipantSnapshot {
    id: string;
    username: string;
    globalName?: string;
    avatarUrl?: string;
}

export interface GhostAssetSnapshot {
    id: string;
    fileName: string;
    url: string;
    proxyUrl?: string;
    contentType?: string;
    size?: number;
    width?: number;
    height?: number;
    cachedDataUrl?: string;
}

export interface GhostEmbedSnapshot {
    type?: string;
    url?: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    cachedImageDataUrl?: string;
}

export interface GhostReferenceSnapshot {
    messageId: string;
    content?: string;
    authorName?: string;
}

export interface GhostMessageSnapshot {
    id: string;
    channelId: string;
    timestamp: number;
    editedTimestamp?: number;
    messageType?: number;
    flags?: number;
    content: string;
    author: GhostParticipantSnapshot;
    attachments: GhostAssetSnapshot[];
    embeds: GhostEmbedSnapshot[];
    reference?: GhostReferenceSnapshot;
}

export interface GhostConversationArchive {
    channelId: string;
    kind: GhostConversationKind;
    state: GhostConversationState;
    title: string;
    subtitle: string;
    iconUrl?: string;
    participants: GhostParticipantSnapshot[];
    messageCount: number;
    lastMessageAt?: number;
    lastMessagePreview?: string;
    lastMessageAuthor?: string;
    lastSeenAt: number;
    archivedAt?: number;
    loggingPaused?: boolean;
    lossReason?: string;
    messages: GhostMessageSnapshot[];
}

export interface GhostCaptureOptions {
    cacheMedia: boolean;
    cacheEmbeds: boolean;
    maxCachedAssetSizeMb: number;
    maxMessagesPerChat: number;
    maxChats: number;
}

function emitUpdate() {
    window.dispatchEvent(new CustomEvent(GHOST_DM_UPDATE_EVENT));
}

function makeChannelKey(channelId: string) {
    return `${CHANNEL_KEY_PREFIX}${channelId}`;
}

async function getIndex(): Promise<string[]> {
    const value = await DataStore.get<string[]>(INDEX_KEY);
    return Array.isArray(value) ? value : [];
}

async function setIndex(channelIds: string[]) {
    await DataStore.set(INDEX_KEY, Array.from(new Set(channelIds)));
}

function enqueueWrite(channelId: string, task: () => Promise<void>) {
    const queued = (writeQueues.get(channelId) ?? Promise.resolve())
        .then(task, task)
        .finally(() => {
            if (writeQueues.get(channelId) === queued) {
                writeQueues.delete(channelId);
            }
        });

    writeQueues.set(channelId, queued);
    return queued;
}

function getPrivateKind(channel: any): GhostConversationKind | null {
    if (!channel) return null;
    if (channel.type === ChannelType.DM) return "dm";
    if (channel.type === ChannelType.GROUP_DM) return "group";
    return null;
}

function getAvatarUrl(entity: any) {
    if (!entity) return undefined;
    if (typeof entity.getAvatarURL === "function") {
        try {
            return entity.getAvatarURL(null, 128, true);
        } catch {
            // noop
        }
    }

    if (entity.avatar && entity.id) {
        return `https://cdn.discordapp.com/avatars/${entity.id}/${entity.avatar}.png?size=128`;
    }

    return undefined;
}

function snapshotUser(user: any): GhostParticipantSnapshot {
    return {
        id: String(user?.id ?? "unknown"),
        username: user?.username ?? user?.globalName ?? "Unknown User",
        globalName: user?.globalName ?? undefined,
        avatarUrl: getAvatarUrl(user),
    };
}

function getChannelParticipants(channel: any): GhostParticipantSnapshot[] {
    const rawRecipients = Array.isArray(channel?.rawRecipients)
        ? channel.rawRecipients
        : Array.isArray(channel?.recipients)
            ? channel.recipients.map((id: string) => UserStore.getUser(id)).filter(Boolean)
            : [];

    return rawRecipients.map(snapshotUser);
}

function getConversationTitle(kind: GhostConversationKind, participants: GhostParticipantSnapshot[], channel: any) {
    if (kind === "group") {
        return channel?.name || participants.map(p => p.globalName || p.username).join(", ") || "Group DM";
    }

    return participants[0]?.globalName || participants[0]?.username || channel?.name || "Direct Message";
}

function getConversationSubtitle(kind: GhostConversationKind, participants: GhostParticipantSnapshot[]) {
    if (kind === "group") {
        return `${participants.length} participants`;
    }

    const user = participants[0];
    return user?.username && user?.globalName && user.username !== user.globalName
        ? `@${user.username}`
        : "Direct message";
}

function getConversationIconUrl(kind: GhostConversationKind, participants: GhostParticipantSnapshot[], channel: any) {
    if (kind === "group") {
        if (channel?.icon) {
            return `https://cdn.discordapp.com/channel-icons/${channel.id}/${channel.icon}.png?size=128`;
        }

        return participants[0]?.avatarUrl;
    }

    return participants[0]?.avatarUrl;
}

function buildConversationSnapshot(channel: any, existing?: GhostConversationArchive): GhostConversationArchive | null {
    const kind = getPrivateKind(channel);
    if (!kind) return null;

    const participants = getChannelParticipants(channel);
    const title = getConversationTitle(kind, participants, channel);

    return {
        channelId: String(channel.id),
        kind,
        state: "active",
        title,
        subtitle: getConversationSubtitle(kind, participants),
        iconUrl: getConversationIconUrl(kind, participants, channel),
        participants,
        messageCount: existing?.messageCount ?? 0,
        lastMessageAt: existing?.lastMessageAt,
        lastMessagePreview: existing?.lastMessagePreview,
        lastMessageAuthor: existing?.lastMessageAuthor,
        lastSeenAt: Date.now(),
        archivedAt: undefined,
        loggingPaused: existing?.loggingPaused ?? false,
        lossReason: undefined,
        messages: existing?.messages ?? [],
    };
}

function makeReferenceSnapshot(referenceMessage: any): GhostReferenceSnapshot | undefined {
    if (!referenceMessage?.id) return undefined;

    return {
        messageId: String(referenceMessage.id),
        content: referenceMessage.content || undefined,
        authorName: referenceMessage.author?.globalName || referenceMessage.author?.username || undefined,
    };
}

function simplifyEmbeds(message: any) {
    const embeds = Array.isArray(message?.embeds) ? message.embeds : [];
    return embeds.map((embed: any): GhostEmbedSnapshot => ({
        type: embed?.type,
        url: embed?.url,
        title: embed?.title,
        description: embed?.description,
        imageUrl: embed?.image?.proxyURL || embed?.image?.url || embed?.thumbnail?.proxyURL || embed?.thumbnail?.url,
    }));
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function cacheUrl(url: string | undefined, maxBytes: number) {
    if (!url) return undefined;

    try {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) return undefined;

        const blob = await response.blob();
        if (blob.size > maxBytes) return undefined;
        return await blobToDataUrl(blob);
    } catch {
        return undefined;
    }
}

async function snapshotAttachment(attachment: any, options: GhostCaptureOptions): Promise<GhostAssetSnapshot> {
    const maxBytes = options.maxCachedAssetSizeMb * 1024 * 1024;
    const asset: GhostAssetSnapshot = {
        id: String(attachment?.id ?? attachment?.url ?? Math.random()),
        fileName: attachment?.filename ?? "attachment",
        url: attachment?.url ?? "",
        proxyUrl: attachment?.proxy_url,
        contentType: attachment?.content_type,
        size: attachment?.size,
        width: attachment?.width,
        height: attachment?.height,
    };

    if (options.cacheMedia) {
        asset.cachedDataUrl = await cacheUrl(asset.proxyUrl || asset.url, maxBytes);
    }

    return asset;
}

async function snapshotEmbed(embed: GhostEmbedSnapshot, options: GhostCaptureOptions): Promise<GhostEmbedSnapshot> {
    if (!options.cacheEmbeds || !embed.imageUrl) return embed;

    const maxBytes = options.maxCachedAssetSizeMb * 1024 * 1024;
    return {
        ...embed,
        cachedImageDataUrl: await cacheUrl(embed.imageUrl, maxBytes),
    };
}

async function snapshotMessage(rawMessage: any, options: GhostCaptureOptions): Promise<GhostMessageSnapshot | null> {
    if (!rawMessage?.id || !rawMessage?.channel_id || !rawMessage?.author) return null;

    const attachments = await Promise.all(
        (Array.isArray(rawMessage.attachments) ? rawMessage.attachments : []).map((attachment: any) => snapshotAttachment(attachment, options))
    );
    const embeds = await Promise.all(simplifyEmbeds(rawMessage).map(embed => snapshotEmbed(embed, options)));

    return {
        id: String(rawMessage.id),
        channelId: String(rawMessage.channel_id),
        timestamp: new Date(rawMessage.timestamp ?? Date.now()).getTime(),
        editedTimestamp: rawMessage.edited_timestamp ? new Date(rawMessage.edited_timestamp).getTime() : undefined,
        messageType: typeof rawMessage.type === "number" ? rawMessage.type : 0,
        flags: typeof rawMessage.flags === "number" ? rawMessage.flags : 0,
        content: rawMessage.content ?? "",
        author: snapshotUser(rawMessage.author),
        attachments,
        embeds,
        reference: makeReferenceSnapshot(rawMessage.referenced_message),
    };
}

function trimMessages(messages: GhostMessageSnapshot[], maxMessagesPerChat: number) {
    if (messages.length <= maxMessagesPerChat) return messages;
    return messages.slice(messages.length - maxMessagesPerChat);
}

async function enforceChatLimit(maxChats: number) {
    const conversations = await getAllGhostConversations();
    if (conversations.length <= maxChats) return;

    const removable = [...conversations]
        .sort((left, right) => (left.lastSeenAt || 0) - (right.lastSeenAt || 0))
        .slice(0, conversations.length - maxChats);

    if (!removable.length) return;

    const nextIndex = (await getIndex()).filter(id => !removable.some(conversation => conversation.channelId === id));
    await DataStore.delMany(removable.map(conversation => makeChannelKey(conversation.channelId)));
    await setIndex(nextIndex);
}

export async function getGhostConversation(channelId: string) {
    return await DataStore.get<GhostConversationArchive>(makeChannelKey(channelId));
}

export async function getAllGhostConversations() {
    const channelIds = await getIndex();
    const entries = await DataStore.getMany<GhostConversationArchive>(channelIds.map(makeChannelKey));

    return entries
        .filter((entry): entry is GhostConversationArchive => Boolean(entry?.channelId))
        .sort((left, right) => {
            const rightTs = right.archivedAt || right.lastMessageAt || right.lastSeenAt || 0;
            const leftTs = left.archivedAt || left.lastMessageAt || left.lastSeenAt || 0;
            return rightTs - leftTs;
        });
}

export async function ensureConversationSnapshot(channel: any) {
    const channelId = String(channel?.id ?? "");
    if (!channelId) return null;

    let created: GhostConversationArchive | null = null;

    await enqueueWrite(channelId, async () => {
        const existing = await getGhostConversation(channelId);
        const snapshot = buildConversationSnapshot(channel, existing);
        if (!snapshot) return;

        await DataStore.set(makeChannelKey(snapshot.channelId), snapshot);
        await setIndex([...(await getIndex()), snapshot.channelId]);
        created = snapshot;
    });

    emitUpdate();
    return created;
}

export async function ensureConversationSnapshotById(channelId: string) {
    const id = String(channelId ?? "");
    if (!id) return null;

    const channel = ChannelStore.getChannel(id)
        ?? ChannelStore.getSortedPrivateChannels().find(channel => String(channel.id) === id);
    if (!channel) return null;

    return await ensureConversationSnapshot(channel);
}

export async function syncPrivateChannelState() {
    const activeChannels = ChannelStore.getSortedPrivateChannels()
        .map(channel => ChannelStore.getChannel(channel.id) ?? channel)
        .filter(Boolean);

    for (const channel of activeChannels) {
        await enqueueWrite(String(channel.id), async () => {
            const existing = await getGhostConversation(String(channel.id));
            const snapshot = buildConversationSnapshot(channel, existing);
            if (!snapshot) return;

            await DataStore.set(makeChannelKey(snapshot.channelId), snapshot);
            await setIndex([...(await getIndex()), snapshot.channelId]);
        });
    }

    const activeIds = new Set(activeChannels.map(channel => String(channel.id)));
    const stored = await getAllGhostConversations();

    for (const conversation of stored) {
        if (!activeIds.has(conversation.channelId) && conversation.state !== "ghost") {
            await markConversationGhost(conversation.channelId, "Access lost");
        }
    }

    emitUpdate();
}

export async function captureMessages(channelId: string, rawMessages: any[], options: GhostCaptureOptions) {
    if (!rawMessages.length) return;

    await enqueueWrite(channelId, async () => {
        const existing = await getGhostConversation(channelId);
        if (existing?.loggingPaused) return;

        const channel = ChannelStore.getChannel(channelId) ?? ChannelStore.getSortedPrivateChannels().find(channel => String(channel.id) === channelId);
        const snapshot = buildConversationSnapshot(channel, existing) ?? existing;
        if (!snapshot) return;

        const knownIds = new Set(snapshot.messages.map(message => message.id));
        for (const rawMessage of rawMessages) {
            const message = await snapshotMessage(rawMessage, options);
            if (!message || knownIds.has(message.id)) continue;
            snapshot.messages.push(message);
            knownIds.add(message.id);
        }

        snapshot.messages.sort((left, right) => left.timestamp - right.timestamp);
        snapshot.messages = trimMessages(snapshot.messages, options.maxMessagesPerChat);
        snapshot.messageCount = snapshot.messages.length;

        const lastMessage = snapshot.messages[snapshot.messages.length - 1];
        snapshot.lastSeenAt = Date.now();
        snapshot.state = getPrivateKind(channel) ? "active" : snapshot.state;
        snapshot.archivedAt = snapshot.state === "ghost" ? snapshot.archivedAt : undefined;
        snapshot.lossReason = snapshot.state === "ghost" ? snapshot.lossReason : undefined;
        snapshot.lastMessageAt = lastMessage?.timestamp;
        snapshot.lastMessagePreview = lastMessage?.content || lastMessage?.attachments[0]?.fileName || lastMessage?.embeds[0]?.title || "Attachment";
        snapshot.lastMessageAuthor = lastMessage?.author.globalName || lastMessage?.author.username;

        await DataStore.set(makeChannelKey(channelId), snapshot);
        await setIndex([...(await getIndex()), channelId]);
        await enforceChatLimit(options.maxChats);
    });

    emitUpdate();
}

export async function markConversationGhost(channelId: string, reason = "Access lost") {
    await enqueueWrite(channelId, async () => {
        const existing = await getGhostConversation(channelId);
        if (!existing) return;

        if (existing.state === "ghost") return;

        existing.state = "ghost";
        existing.archivedAt = Date.now();
        existing.lossReason = reason;
        existing.lastSeenAt = Date.now();

        await DataStore.set(makeChannelKey(channelId), existing);
    });

    emitUpdate();
}

export async function restoreConversationActive(channelId: string) {
    await enqueueWrite(channelId, async () => {
        const existing = await getGhostConversation(channelId);
        if (!existing) return;

        const channel = ChannelStore.getChannel(channelId) ?? ChannelStore.getSortedPrivateChannels().find(channel => String(channel.id) === channelId);
        const snapshot = buildConversationSnapshot(channel, existing);
        if (!snapshot) return;

        await DataStore.set(makeChannelKey(channelId), snapshot);
    });

    emitUpdate();
}

export async function setConversationPaused(channelId: string, loggingPaused: boolean) {
    await enqueueWrite(channelId, async () => {
        const existing = await getGhostConversation(channelId);
        if (!existing) return;

        existing.loggingPaused = loggingPaused;
        existing.lastSeenAt = Date.now();
        await DataStore.set(makeChannelKey(channelId), existing);
    });

    emitUpdate();
}

export async function deleteGhostConversation(channelId: string) {
    await enqueueWrite(channelId, async () => {
        await DataStore.del(makeChannelKey(channelId));
        const nextIndex = (await getIndex()).filter(id => id !== channelId);
        await setIndex(nextIndex);
    });

    emitUpdate();
}

export async function clearGhostConversations() {
    const conversations = await getAllGhostConversations();
    await DataStore.delMany(conversations.map(conversation => makeChannelKey(conversation.channelId)));
    await setIndex([]);
    emitUpdate();
}
