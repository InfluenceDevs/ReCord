/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { DeleteIcon, PencilIcon } from "@components/Icons";
import { updateMessage } from "@api/MessageUpdater";
import { Devs } from "@utils/constants";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import type { Message, User } from "@vencord/discord-types";
import { Button, FluxDispatcher, Forms, Menu, React, TextInput, UserStore } from "@webpack/common";

// ─── storage ─────────────────────────────────────────────────────────────────

const MSG_KEY = "record_local_message_overrides";
const USER_KEY = "record_local_user_overrides";

type MsgOverrides = Record<string, { content: string }>;
type UserOverrides = Record<string, { name?: string }>;

function loadMsgOverrides(): MsgOverrides {
    try { return JSON.parse(localStorage.getItem(MSG_KEY) ?? "{}"); } catch { return {}; }
}
function saveMsgOverrides(data: MsgOverrides) {
    try { localStorage.setItem(MSG_KEY, JSON.stringify(data)); } catch { /* noop */ }
}

// In-memory cache for user overrides (avoid JSON.parse on every getUser call)
let userOverridesCache: UserOverrides | null = null;

function getUserOverrides(): UserOverrides {
    if (!userOverridesCache) userOverridesCache = loadRawUserOverrides();
    return userOverridesCache;
}
function loadRawUserOverrides(): UserOverrides {
    try { return JSON.parse(localStorage.getItem(USER_KEY) ?? "{}"); } catch { return {}; }
}
function saveUserOverrides(data: UserOverrides) {
    userOverridesCache = data;
    try { localStorage.setItem(USER_KEY, JSON.stringify(data)); } catch { /* noop */ }
}

// ─── modal components ─────────────────────────────────────────────────────────

function EditMessageModal({ channelId, messageId, currentContent, onClose, transitionState }: {
    channelId: string;
    messageId: string;
    currentContent: string;
    onClose(): void;
    transitionState: any;
}) {
    const [value, setValue] = React.useState(currentContent);

    const save = React.useCallback(() => {
        const overrides = loadMsgOverrides();
        overrides[`${channelId}:${messageId}`] = { content: value };
        saveMsgOverrides(overrides);
        updateMessage(channelId, messageId, { content: value });
        onClose();
    }, [channelId, messageId, value, onClose]);

    return (
        <ModalRoot onClose={onClose} transitionState={transitionState}>
            <ModalHeader>
                <Forms.FormTitle tag="h4">Edit Message (local view only)</Forms.FormTitle>
                <ModalCloseButton onClick={onClose} />
            </ModalHeader>
            <ModalContent>
                <Forms.FormText style={{ marginBottom: 10, color: "var(--text-muted)" }}>
                    This change is visible only to you and does not affect the real message.
                </Forms.FormText>
                <textarea
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    rows={5}
                    style={{
                        width: "100%",
                        resize: "vertical",
                        fontFamily: "var(--font-primary)",
                        fontSize: 14,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--border-subtle)",
                        background: "var(--background-secondary)",
                        color: "var(--text-normal)",
                        outline: "none",
                        boxSizing: "border-box"
                    }}
                />
            </ModalContent>
            <ModalFooter>
                <Button onClick={save}>Save</Button>
                <Button variant="secondary" onClick={onClose} style={{ marginLeft: 8 }}>Cancel</Button>
            </ModalFooter>
        </ModalRoot>
    );
}

function OverrideNameModal({ userId, currentName, onClose, transitionState }: {
    userId: string;
    currentName: string;
    onClose(): void;
    transitionState: any;
}) {
    const overrides = getUserOverrides();
    const [value, setValue] = React.useState(overrides[userId]?.name ?? "");

    const save = React.useCallback(() => {
        const data = loadRawUserOverrides();
        if (value.trim()) {
            data[userId] = { ...data[userId], name: value.trim() };
        } else {
            delete data[userId];
        }
        saveUserOverrides(data);
        onClose();
    }, [userId, value, onClose]);

    return (
        <ModalRoot onClose={onClose} transitionState={transitionState}>
            <ModalHeader>
                <Forms.FormTitle tag="h4">Override Display Name (local only)</Forms.FormTitle>
                <ModalCloseButton onClick={onClose} />
            </ModalHeader>
            <ModalContent>
                <Forms.FormText style={{ marginBottom: 10, color: "var(--text-muted)" }}>
                    Visible only to you. Leave blank to clear the override.
                </Forms.FormText>
                <TextInput
                    value={value}
                    onChange={setValue}
                    placeholder={currentName || "Custom display name…"}
                    style={{ width: "100%" }}
                />
            </ModalContent>
            <ModalFooter>
                <Button onClick={save}>Save</Button>
                <Button variant="secondary" onClick={onClose} style={{ marginLeft: 8 }}>Cancel</Button>
            </ModalFooter>
        </ModalRoot>
    );
}

// ─── context menu patches ─────────────────────────────────────────────────────

const patchMsgCtx: NavContextMenuPatchCallback = (children, { message }: { message: Message }) => {
    if (!message?.id) return;

    const channelId = message.channel_id;
    const messageId = message.id;
    const key = `${channelId}:${messageId}`;
    const hasOverride = !!loadMsgOverrides()[key];

    children.push(
        <Menu.MenuSeparator key="record-sep-msg" />,
        <Menu.MenuItem
            key="record-edit-local"
            id="record-edit-local"
            label="Edit Locally"
            icon={PencilIcon}
            action={() => {
                const overrides = loadMsgOverrides();
                const currentContent = overrides[key]?.content ?? (message.content as string) ?? "";
                openModal(props => (
                    <EditMessageModal
                        channelId={channelId}
                        messageId={messageId}
                        currentContent={currentContent}
                        {...props}
                    />
                ));
            }}
        />,
        ...(hasOverride ? [
            <Menu.MenuItem
                key="record-clear-local-edit"
                id="record-clear-local-edit"
                label="Clear Local Edit"
                icon={DeleteIcon}
                action={() => {
                    const data = loadMsgOverrides();
                    delete data[key];
                    saveMsgOverrides(data);
                    // Re-render message with its original content from Discord's cache
                    updateMessage(channelId, messageId);
                }}
            />
        ] : [])
    );
};

const patchUserCtx: NavContextMenuPatchCallback = (children, { user }: { user: User }) => {
    if (!user?.id) return;

    const overrides = getUserOverrides();
    const hasOverride = !!overrides[user.id];

    children.push(
        <Menu.MenuSeparator key="record-sep-user" />,
        <Menu.MenuItem
            key="record-override-name"
            id="record-override-name"
            label="Override Display Name"
            icon={PencilIcon}
            action={() => {
                openModal(props => (
                    <OverrideNameModal
                        userId={user.id}
                        currentName={(user as any).globalName ?? user.username ?? ""}
                        {...props}
                    />
                ));
            }}
        />,
        ...(hasOverride ? [
            <Menu.MenuItem
                key="record-clear-name-override"
                id="record-clear-name-override"
                label="Clear Name Override"
                icon={DeleteIcon}
                action={() => {
                    const data = loadRawUserOverrides();
                    delete data[user.id];
                    saveUserOverrides(data);
                }}
            />
        ] : [])
    );
};

// ─── flux: re-apply message overrides when Discord loads messages ──────────────

function applyMsgOverrides(channelId: string, messages: Array<{ id: string }>) {
    if (!messages?.length) return;
    const overrides = loadMsgOverrides();
    for (const msg of messages) {
        const key = `${channelId}:${msg.id}`;
        if (overrides[key]) {
            updateMessage(channelId, msg.id, { content: overrides[key].content });
        }
    }
}

const onMessagesLoaded = ({ channelId, messages }: { channelId: string; messages: Array<{ id: string }> }) => {
    applyMsgOverrides(channelId, messages ?? []);
};

const onMessageCreate = ({ channelId, message }: { channelId: string; message: { id: string } }) => {
    if (message) applyMsgOverrides(channelId, [message]);
};

// ─── UserStore monkey-patch ───────────────────────────────────────────────────

let origGetUser: ((id: string) => any) | null = null;

function patchUserStore() {
    origGetUser = (UserStore as any).getUser.bind(UserStore);
    (UserStore as any).getUser = (id: string) => {
        const user = origGetUser!(id);
        if (!user) return user;
        const ov = getUserOverrides()[id];
        if (!ov?.name) return user;
        return new Proxy(user, {
            get(target, prop) {
                if ((prop === "globalName" || prop === "username") && ov.name) return ov.name;
                const val = (target as any)[prop];
                return typeof val === "function" ? val.bind(target) : val;
            }
        });
    };
}

function unpatchUserStore() {
    if (origGetUser) {
        (UserStore as any).getUser = origGetUser;
        origGetUser = null;
    }
}

// ─── plugin ───────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "RecordClientOverrides",
    description: "Locally edit messages and override user display names — changes are visible only to you, never sent to Discord.",
    authors: [Devs.Rloxx],

    contextMenus: {
        "message": patchMsgCtx,
        "user-context": patchUserCtx,
    },

    start() {
        userOverridesCache = null; // reset cache on (re)start
        patchUserStore();
        FluxDispatcher.subscribe("LOAD_MESSAGES_SUCCESS", onMessagesLoaded);
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
    },

    stop() {
        unpatchUserStore();
        FluxDispatcher.unsubscribe("LOAD_MESSAGES_SUCCESS", onMessagesLoaded);
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
    },
});
