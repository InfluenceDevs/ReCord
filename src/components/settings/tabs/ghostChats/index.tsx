/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { FormSwitch } from "@components/FormSwitch";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Margins } from "@utils/margins";
import { Forms, Parser, React, Text } from "@webpack/common";

import { settings } from "@plugins/ghostDMLogger";
import {
    clearGhostConversations,
    deleteGhostConversation,
    getAllGhostConversations,
    GhostConversationArchive,
    GhostMessageSnapshot,
    GHOST_DM_UPDATE_EVENT,
    setConversationPaused,
    syncPrivateChannelState,
} from "@plugins/ghostDMLogger/storage";

function formatTimestamp(timestamp?: number) {
    if (!timestamp) return "Never";
    return new Date(timestamp).toLocaleString();
}

function getConversationStatus(conversation: GhostConversationArchive) {
    if (conversation.state === "ghost") return "Ghost copy";
    if (conversation.loggingPaused) return "Logging paused";
    return "Active capture";
}

function messagePreview(message: GhostMessageSnapshot) {
    if (message.content) return message.content;
    if (message.attachments.length) return `Attachment: ${message.attachments[0].fileName}`;
    if (message.embeds[0]?.title) return message.embeds[0].title;
    return "Empty message";
}

function renderParsedContent(message: GhostMessageSnapshot) {
    if (!message.content) return null;

    return Parser.parse(message.content, true, {
        channelId: message.channelId,
        messageId: message.id,
        allowLinks: true,
        allowHeading: true,
        allowList: true,
        allowEmojiLinks: true,
        viewingChannelId: message.channelId,
    });
}

function SummaryCard({ title, value, note }: { title: string; value: string; note: string; }) {
    return (
        <div
            style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: 14,
                padding: 14,
                background: "linear-gradient(180deg, rgba(88,101,242,0.12), rgba(17,24,39,0.08))",
                minWidth: 0,
            }}
        >
            <Text variant="text-xs/semibold" style={{ color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.6 }}>{title}</Text>
            <Text variant="heading-lg/semibold" style={{ marginTop: 6 }}>{value}</Text>
            <Text variant="text-sm/normal" style={{ color: "var(--text-muted)", marginTop: 6 }}>{note}</Text>
        </div>
    );
}

function Avatar({ conversation }: { conversation: GhostConversationArchive; }) {
    if (conversation.iconUrl) {
        return (
            <img
                src={conversation.iconUrl}
                alt=""
                style={{ width: 42, height: 42, borderRadius: 14, objectFit: "cover", flexShrink: 0 }}
            />
        );
    }

    return (
        <div
            style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                flexShrink: 0,
                display: "grid",
                placeItems: "center",
                background: "rgba(88,101,242,0.18)",
                color: "var(--text-brand)",
                fontWeight: 700,
            }}
        >
            {(conversation.title[0] || "?").toUpperCase()}
        </div>
    );
}

function AttachmentCard({ attachment }: { attachment: GhostMessageSnapshot["attachments"][number]; }) {
    const source = attachment.cachedDataUrl || attachment.proxyUrl || attachment.url;
    const isImage = attachment.contentType?.startsWith("image/") || Boolean(attachment.width && attachment.height);

    return (
        <div
            style={{
                marginTop: 10,
                border: "1px solid var(--border-subtle)",
                background: "var(--background-secondary)",
                borderRadius: 12,
                padding: 10,
            }}
        >
            <Text variant="text-sm/semibold">{attachment.fileName}</Text>
            <Text variant="text-xs/normal" style={{ color: "var(--text-muted)", marginTop: 4 }}>
                {attachment.contentType || "file"}{attachment.size ? ` · ${(attachment.size / 1024 / 1024).toFixed(2)} MB` : ""}
            </Text>

            {isImage && source && (
                <img
                    src={source}
                    alt={attachment.fileName}
                    style={{ marginTop: 10, maxWidth: "100%", borderRadius: 10, border: "1px solid var(--border-faint)" }}
                />
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {source && <Button size="small" onClick={() => window.open(source, "_blank", "noopener,noreferrer")}>Open</Button>}
                <Button size="small" variant="secondary" onClick={() => navigator.clipboard.writeText(attachment.url)}>Copy URL</Button>
            </div>
        </div>
    );
}

function EmbedCard({ embed }: { embed: GhostMessageSnapshot["embeds"][number]; }) {
    if (!embed.title && !embed.description && !embed.imageUrl && !embed.cachedImageDataUrl) return null;

    const image = embed.cachedImageDataUrl || embed.imageUrl;
    return (
        <div
            style={{
                marginTop: 10,
                borderLeft: "3px solid var(--brand-500)",
                background: "var(--background-secondary)",
                borderRadius: 12,
                padding: 12,
            }}
        >
            {embed.title && <Text variant="text-sm/semibold">{embed.title}</Text>}
            {embed.description && <Text variant="text-sm/normal" style={{ color: "var(--text-normal)", marginTop: 6 }}>{embed.description}</Text>}
            {image && <img src={image} alt="" style={{ marginTop: 10, maxWidth: "100%", borderRadius: 10 }} />}
            {embed.url && <Text variant="text-xs/normal" style={{ color: "var(--text-muted)", marginTop: 8, wordBreak: "break-all" }}>{embed.url}</Text>}
        </div>
    );
}

function GhostChatsTab() {
    const [conversations, setConversations] = React.useState<GhostConversationArchive[]>([]);
    const [selectedChannelId, setSelectedChannelId] = React.useState<string | null>(null);
    const [showActive, setShowActive] = React.useState(true);
    const [loading, setLoading] = React.useState(true);

    const refresh = React.useCallback(async () => {
        setLoading(true);
        await syncPrivateChannelState();
        const next = await getAllGhostConversations();
        setConversations(next);
        setSelectedChannelId(current => current && next.some(conversation => conversation.channelId === current)
            ? current
            : next[0]?.channelId ?? null);
        setLoading(false);
    }, []);

    React.useEffect(() => {
        refresh();

        const onUpdate = () => {
            refresh();
        };

        window.addEventListener(GHOST_DM_UPDATE_EVENT, onUpdate);
        const interval = window.setInterval(onUpdate, 5000);

        return () => {
            window.removeEventListener(GHOST_DM_UPDATE_EVENT, onUpdate);
            window.clearInterval(interval);
        };
    }, [refresh]);

    const visibleConversations = conversations.filter(conversation => showActive || conversation.state === "ghost");
    const selectedConversation = visibleConversations.find(conversation => conversation.channelId === selectedChannelId) || visibleConversations[0] || null;
    const totalMessages = conversations.reduce((sum, conversation) => sum + conversation.messageCount, 0);
    const ghostCount = conversations.filter(conversation => conversation.state === "ghost").length;
    const cachedAssetCount = conversations.reduce((sum, conversation) => sum + conversation.messages.reduce((messageSum, message) => messageSum + message.attachments.filter(attachment => attachment.cachedDataUrl).length + message.embeds.filter(embed => embed.cachedImageDataUrl).length, 0), 0);

    return (
        <SettingsTab>
            <Forms.FormTitle tag="h2">Ghost Chats</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom16} style={{ color: "var(--text-muted)", maxWidth: 860 }}>
                Local-only read-only archives for DMs and group chats. Messages are captured while the chat is accessible, then preserved here if the DM closes, the group removes you, or the channel disappears.
            </Forms.FormText>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
                <SummaryCard title="Ghost Copies" value={String(ghostCount)} note="Archived after access loss or deletion." />
                <SummaryCard title="Tracked Chats" value={String(conversations.length)} note={`Cap: ${settings.store.maxChats} chats`} />
                <SummaryCard title="Stored Messages" value={String(totalMessages)} note={`Cap: ${settings.store.maxMessagesPerChat} per chat`} />
                <SummaryCard title="Cached Media" value={String(cachedAssetCount)} note={`Asset cap: ${settings.store.maxCachedAssetSizeMb} MB each`} />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <Button size="small" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button>
                <Button
                    size="small"
                    variant="dangerSecondary"
                    onClick={() => {
                        if (!confirm("Delete every Ghost Chats archive stored locally?")) return;
                        clearGhostConversations().then(refresh);
                    }}
                >
                    Clear All Archives
                </Button>
            </div>

            <FormSwitch
                title="Show active tracked chats"
                description="Include still-accessible DMs and groups alongside ghost copies. Disable this to view only lost-access archives."
                value={showActive}
                onChange={setShowActive}
            />

            <Divider className={Margins.top16} />

            <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 340px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
                <div style={{ display: "grid", gap: 10, maxHeight: 720, overflowY: "auto", paddingRight: 4 }}>
                    {visibleConversations.length === 0 && (
                        <div style={{ padding: 16, borderRadius: 14, border: "1px dashed var(--border-subtle)", color: "var(--text-muted)" }}>
                            {loading ? "Loading archives…" : "No ghost chats yet. Open a DM or group chat to start capturing history, then it will surface here if access disappears."}
                        </div>
                    )}

                    {visibleConversations.map(conversation => {
                        const selected = selectedConversation?.channelId === conversation.channelId;
                        const isGhost = conversation.state === "ghost";

                        return (
                            <button
                                key={conversation.channelId}
                                type="button"
                                onClick={() => setSelectedChannelId(conversation.channelId)}
                                style={{
                                    textAlign: "left",
                                    padding: 12,
                                    borderRadius: 16,
                                    border: selected
                                        ? (isGhost ? "1px solid rgba(170,180,196,0.7)" : "1px solid var(--brand-500)")
                                        : "1px solid var(--border-subtle)",
                                    background: selected
                                        ? (isGhost ? "rgba(130,139,154,0.18)" : "rgba(88,101,242,0.16)")
                                        : (isGhost ? "rgba(130,139,154,0.10)" : "var(--background-secondary)"),
                                    cursor: "pointer",
                                }}
                            >
                                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                    <Avatar conversation={conversation} />
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <Text variant="text-sm/semibold" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isGhost ? "var(--text-muted)" : "var(--text-normal)" }}>{conversation.title}</Text>
                                        <Text variant="text-xs/normal" style={{ color: "var(--text-muted)" }}>{getConversationStatus(conversation)} · {conversation.subtitle}</Text>
                                        <Text variant="text-xs/normal" style={{ color: "var(--text-muted)", marginTop: 4, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {conversation.lastMessageAuthor ? `${conversation.lastMessageAuthor}: ` : ""}{conversation.lastMessagePreview || "No messages captured yet"}
                                        </Text>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div style={{ minHeight: 480, borderRadius: 18, border: "1px solid var(--border-subtle)", background: "var(--background-secondary)", overflow: "hidden" }}>
                    {!selectedConversation && (
                        <div style={{ padding: 18, color: "var(--text-muted)" }}>
                            Select a ghost chat to inspect its archived timeline.
                        </div>
                    )}

                    {selectedConversation && (
                        <>
                            <div style={{ padding: 18, borderBottom: "1px solid var(--border-subtle)", background: "linear-gradient(180deg, rgba(88,101,242,0.12), transparent)" }}>
                                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                    <Avatar conversation={selectedConversation} />
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <Text variant="heading-md/semibold">{selectedConversation.title}</Text>
                                        <Text variant="text-sm/normal" style={{ color: "var(--text-muted)" }}>
                                            {getConversationStatus(selectedConversation)} · {selectedConversation.kind === "group" ? "Group DM" : "DM"}
                                        </Text>
                                    </div>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 14 }}>
                                    <div>
                                        <Text variant="text-xs/semibold" style={{ color: "var(--text-muted)", textTransform: "uppercase" }}>Last Seen</Text>
                                        <Text variant="text-sm/normal">{formatTimestamp(selectedConversation.lastSeenAt)}</Text>
                                    </div>
                                    <div>
                                        <Text variant="text-xs/semibold" style={{ color: "var(--text-muted)", textTransform: "uppercase" }}>Archived</Text>
                                        <Text variant="text-sm/normal">{formatTimestamp(selectedConversation.archivedAt)}</Text>
                                    </div>
                                    <div>
                                        <Text variant="text-xs/semibold" style={{ color: "var(--text-muted)", textTransform: "uppercase" }}>Stored</Text>
                                        <Text variant="text-sm/normal">{selectedConversation.messageCount} messages</Text>
                                    </div>
                                    <div>
                                        <Text variant="text-xs/semibold" style={{ color: "var(--text-muted)", textTransform: "uppercase" }}>Reason</Text>
                                        <Text variant="text-sm/normal">{selectedConversation.lossReason || "Still accessible"}</Text>
                                    </div>
                                </div>

                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                                    <Button
                                        size="small"
                                        variant={selectedConversation.loggingPaused ? "primary" : "secondary"}
                                        onClick={() => setConversationPaused(selectedConversation.channelId, !selectedConversation.loggingPaused).then(refresh)}
                                    >
                                        {selectedConversation.loggingPaused ? "Resume Logging" : "Pause Logging"}
                                    </Button>
                                    <Button
                                        size="small"
                                        variant="dangerSecondary"
                                        onClick={() => {
                                            if (!confirm(`Delete the local archive for ${selectedConversation.title}?`)) return;
                                            deleteGhostConversation(selectedConversation.channelId).then(refresh);
                                        }}
                                    >
                                        Delete Archive
                                    </Button>
                                </div>
                            </div>

                            <div style={{ padding: 18, maxHeight: 760, overflowY: "auto", display: "grid", gap: 12 }}>
                                {selectedConversation.messages.length === 0 && (
                                    <div style={{ color: "var(--text-muted)" }}>No messages captured for this chat yet.</div>
                                )}

                                {selectedConversation.messages.map(message => (
                                    <div key={message.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: 14, padding: 14, background: "var(--background-primary)" }}>
                                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                            {message.author.avatarUrl ? (
                                                <img src={message.author.avatarUrl} alt="" style={{ width: 34, height: 34, borderRadius: 999, objectFit: "cover" }} />
                                            ) : (
                                                <div style={{ width: 34, height: 34, borderRadius: 999, display: "grid", placeItems: "center", background: "rgba(88,101,242,0.18)", color: "var(--text-brand)", fontWeight: 700 }}>
                                                    {(message.author.globalName || message.author.username || "?")[0]?.toUpperCase() || "?"}
                                                </div>
                                            )}
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <Text variant="text-sm/semibold">{message.author.globalName || message.author.username}</Text>
                                                <Text variant="text-xs/normal" style={{ color: "var(--text-muted)" }}>{formatTimestamp(message.timestamp)}</Text>
                                            </div>
                                        </div>

                                        {message.reference && (
                                            <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "var(--background-secondary)", color: "var(--text-muted)" }}>
                                                <Text variant="text-xs/semibold">Replying to {message.reference.authorName || "message"}</Text>
                                                {message.reference.content && <Text variant="text-sm/normal" style={{ marginTop: 4 }}>{message.reference.content}</Text>}
                                            </div>
                                        )}

                                        <div style={{ marginTop: 10 }}>
                                            {message.content ? renderParsedContent(message) : <Text variant="text-sm/normal" style={{ color: "var(--text-muted)" }}>{messagePreview(message)}</Text>}
                                        </div>

                                        {message.attachments.map(attachment => (
                                            <AttachmentCard key={attachment.id} attachment={attachment} />
                                        ))}
                                        {message.embeds.map((embed, index) => (
                                            <EmbedCard key={`${message.id}-embed-${index}`} embed={embed} />
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </SettingsTab>
    );
}

export default wrapTab(GhostChatsTab, "Ghost Chats");
