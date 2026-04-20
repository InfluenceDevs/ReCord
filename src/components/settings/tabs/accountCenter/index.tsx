/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Margins } from "@utils/margins";
import { findByProps } from "@webpack";
import { Forms, React, Text, UserStore } from "@webpack/common";

// â”€â”€â”€ Discord token / account utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function findByPropsSafe(...props: string[]) {
    try {
        return findByProps(...props) as Record<string, unknown> | undefined;
    } catch {
        return undefined;
    }
}

type NativeAccountEntry = {
    switchId: string;
    userId: string;
    nativeAccount: any;
};

function resolveAccountSwitcherStore() {
    return findByPropsSafe("canAddAccount", "getAccounts") as {
        getAccounts?: () => unknown;
        getCurrentAccount?: () => unknown;
    } | undefined;
}

function resolveAccountSwitcherApi() {
    return findByPropsSafe("canAddAccount", "switchAccount") as {
        switchAccount?: (accountId: string) => unknown;
    } | undefined;
}

function normalizeNativeAccount(account: any): NativeAccountEntry | null {
    const switchId = account?.id ?? account?.accountId;
    const userId = account?.userId ?? account?.id;

    if (!switchId || !userId) return null;
    if (!UserStore.getUser(String(userId))) return null;

    return {
        switchId: String(switchId),
        userId: String(userId),
        nativeAccount: account
    };
}

function getAccountsSafe() {
    const getAccounts = resolveAccountSwitcherStore()?.getAccounts;
    if (typeof getAccounts !== "function") return null;

    try {
        const next = getAccounts();
        if (!Array.isArray(next)) return [];
        return next.map(normalizeNativeAccount).filter(Boolean) as NativeAccountEntry[];
    } catch {
        return [];
    }
}

async function switchToAccount(account: NativeAccountEntry) {
    const api = resolveAccountSwitcherApi();
    if (typeof api?.switchAccount !== "function") return false;

    try {
        await Promise.resolve(api.switchAccount(account.switchId));
        return true;
    } catch {
        return false;
    }
}

/**
 * Log into a token by setting Discord's active token and reloading.
 * This repo already uses the same fallback in authEnhancer when native login helpers are unavailable.
 */
async function loginWithToken(token: string): Promise<string | null> {
    const cleanedToken = token.trim().replace(/^"|"$/g, "");
    if (!cleanedToken) return "Enter a token first.";

    try {
        getStorage()?.setItem("token", JSON.stringify(cleanedToken));
        window.setTimeout(() => {
            location.href = "/channels/@me";
            location.reload();
        }, 250);
        return null;
    } catch (e: any) {
        const msg: string = e?.message ?? String(e);
        if (/invalid/i.test(msg)) return "Invalid token. Double-check and try again.";
        return `Login failed: ${msg}`;
    }
}

function getStorage() {
    try { return globalThis.localStorage ?? null; } catch { return null; }
}

const SAVED_TOKENS_KEY = "record_saved_account_tokens";

function loadSavedTokens(): { label: string; token: string }[] {
    try {
        const raw = getStorage()?.getItem(SAVED_TOKENS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveSavedTokens(list: { label: string; token: string }[]) {
    try { getStorage()?.setItem(SAVED_TOKENS_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AccountCenterTab() {
    const [accounts, setAccounts] = React.useState<NativeAccountEntry[]>(() => getAccountsSafe() ?? []);
    const [apiReady, setApiReady] = React.useState(() => getAccountsSafe() !== null);
    const [status, setStatus] = React.useState("");
    const [statusOk, setStatusOk] = React.useState(false);
    const [isSwitching, setIsSwitching] = React.useState(false);

    // Token add form
    const [showAddForm, setShowAddForm] = React.useState(false);
    const [tokenInput, setTokenInput] = React.useState("");
    const [labelInput, setLabelInput] = React.useState("");
    const [isLoggingIn, setIsLoggingIn] = React.useState(false);

    // Saved tokens
    const [savedTokens, setSavedTokens] = React.useState<{ label: string; token: string }[]>(() => loadSavedTokens());

    const currentUser = UserStore.getCurrentUser();
    const currentId = currentUser?.id;

    const refresh = React.useCallback(() => {
        const next = getAccountsSafe();
        setApiReady(next !== null);
        const discordOnly = next ?? [];

        if (currentUser && !discordOnly.some(account => account.userId === String(currentUser.id))) {
            discordOnly.unshift({
                switchId: String(currentUser.id),
                userId: String(currentUser.id),
                nativeAccount: null
            });
        }

        setAccounts(discordOnly);
    }, [currentUser]);

    React.useEffect(() => {
        refresh();
        const id = window.setInterval(refresh, 3000);
        return () => clearInterval(id);
    }, [refresh]);

    const onSwitch = React.useCallback(async (account: NativeAccountEntry) => {
        setStatus("");
        setIsSwitching(true);
        const ok = await switchToAccount(account);
        if (!ok) {
            setStatusOk(false);
            setStatus("Could not switch account. Try Discord's native switcher once, then retry.");
        }
        setIsSwitching(false);
    }, []);

    const onAddToken = React.useCallback(async () => {
        const token = tokenInput.trim();
        if (!token) { setStatus("Enter a token first."); setStatusOk(false); return; }

        setIsLoggingIn(true);
        setStatus("");
        const err = await loginWithToken(token);
        if (err) {
            setStatus(err);
            setStatusOk(false);
        } else {
            const label = labelInput.trim() || `Account ${savedTokens.length + 1}`;
            const updated = [...savedTokens, { label, token }];
            setSavedTokens(updated);
            saveSavedTokens(updated);
            setTokenInput("");
            setLabelInput("");
            setShowAddForm(false);
            setStatus("Logging into saved token and reloading...");
            setStatusOk(true);
        }
        setIsLoggingIn(false);
    }, [tokenInput, labelInput, savedTokens, refresh]);

    const onRemoveSaved = React.useCallback((idx: number) => {
        const updated = savedTokens.filter((_, i) => i !== idx);
        setSavedTokens(updated);
        saveSavedTokens(updated);
    }, [savedTokens]);

    const onLoginSaved = React.useCallback(async (token: string) => {
        setIsLoggingIn(true);
        setStatus("");
        const err = await loginWithToken(token);
        if (err) { setStatus(err); setStatusOk(false); }
        else { setStatus("Logging into saved token and reloading..."); setStatusOk(true); }
        setIsLoggingIn(false);
    }, []);

    return (
        <SettingsTab>
            <div className="vc-settings-hero">
                <Forms.FormTitle tag="h2">Account Center</Forms.FormTitle>
                <Forms.FormText className={Margins.bottom16} style={{ maxWidth: 860 }}>
                    Manage your Discord accounts. Use Discord's built-in account switcher for native multi-account sessions, or use token login to replace the active session.
                </Forms.FormText>

                <div className="vc-settings-pill-row">
                    <div className="vc-settings-pill"><strong>Connected</strong> {accounts.length}</div>
                    <div className="vc-settings-pill"><strong>Saved</strong> {savedTokens.length}</div>
                    <div className="vc-settings-pill"><strong>API</strong> {apiReady ? "Ready" : "Unavailable"}</div>
                </div>
            </div>

            <div className="vc-settings-actions">
                <Button size="small" onClick={refresh}>Refresh</Button>
                <Button size="small" variant={showAddForm ? "dangerPrimary" : "primary"} onClick={() => { setShowAddForm(p => !p); setStatus(""); }}>
                    {showAddForm ? "Cancel" : "Add Account"}
                </Button>
            </div>

            {/* â”€â”€ Status banner â”€â”€ */}
            {!!status && (
                <div style={{
                    background: statusOk
                        ? "color-mix(in srgb, var(--status-positive) 10%, transparent)"
                        : "color-mix(in srgb, var(--status-danger) 10%, transparent)",
                    border: `1px solid ${statusOk ? "var(--status-positive)" : "var(--status-danger)"}`,
                    borderRadius: 6,
                    padding: "8px 14px",
                    color: "var(--text-normal)",
                    fontSize: 13
                }}>
                    {status}
                </div>
            )}

            {/* â”€â”€ Add Account form â”€â”€ */}
            {showAddForm && (
                <section>
                    <Forms.FormTitle tag="h3" style={{ marginBottom: 4 }}>Token Login</Forms.FormTitle>
                    <Forms.FormText style={{ color: "var(--text-muted)", marginBottom: 16 }}>
                        Enter a Discord user token to replace the active session. Saved tokens stay local to this client.
                    </Forms.FormText>

                    <div style={{ marginBottom: 10 }}>
                        <Forms.FormTitle tag="h5" style={{ marginBottom: 4 }}>Account Label (optional)</Forms.FormTitle>
                        <input
                            type="text"
                            placeholder="e.g. My Alt Account"
                            value={labelInput}
                            onChange={e => setLabelInput(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "8px 12px",
                                borderRadius: 4,
                                border: "1px solid var(--input-border)",
                                background: "var(--input-background)",
                                color: "var(--text-normal)",
                                boxSizing: "border-box"
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: 14 }}>
                        <Forms.FormTitle tag="h5" style={{ marginBottom: 4 }}>Token</Forms.FormTitle>
                        <input
                            type="password"
                            placeholder="Paste your Discord token here"
                            value={tokenInput}
                            onChange={e => setTokenInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") void onAddToken(); }}
                            style={{
                                width: "100%",
                                padding: "8px 12px",
                                borderRadius: 4,
                                border: "1px solid var(--input-border)",
                                background: "var(--input-background)",
                                color: "var(--text-normal)",
                                boxSizing: "border-box"
                            }}
                        />
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                        <Button
                            size="small"
                            variant="primary"
                            disabled={isLoggingIn || !tokenInput.trim()}
                            onClick={() => void onAddToken()}
                        >
                            {isLoggingIn ? "Logging in..." : "Log In and Reload"}
                        </Button>
                    </div>

                    <Forms.FormText style={{ color: "var(--text-muted)", marginTop: 10, fontSize: 12 }}>
                        To get your token: Open Discord DevTools (Ctrl+Shift+I) â†’ Console â†’ type{" "}
                        <code style={{ background: "var(--background-secondary)", padding: "1px 4px", borderRadius: 3 }}>
                            copy(webpackChunkdiscord_app.push([[''],{"{}"}, e=&gt;e(e.n=Object.keys(e.m).find(m=&gt;e(m)?.default?.getToken))]?.default?.getToken()))
                        </code>{" "}
                        and your token is copied to clipboard.
                    </Forms.FormText>
                </section>
            )}

            {/* â”€â”€ Saved tokens â”€â”€ */}
            {savedTokens.length > 0 && (
                <section>
                    <Forms.FormTitle tag="h3" style={{ marginBottom: 4 }}>Saved Accounts</Forms.FormTitle>
                    <Forms.FormText style={{ color: "var(--text-muted)", marginBottom: 16 }}>
                        Saved token logins. These replace the active session and reload Discord.
                    </Forms.FormText>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {savedTokens.map((entry, idx) => (
                            <div key={idx} className="vc-settings-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                <div style={{ minWidth: 0 }}>
                                    <Forms.FormText style={{ fontWeight: 600 }}>{entry.label}</Forms.FormText>
                                    <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 12 }}>
                                        {"â€¢".repeat(20)} (stored locally)
                                    </Forms.FormText>
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                    <Button size="small" variant="primary" disabled={isLoggingIn} onClick={() => void onLoginSaved(entry.token)}>
                                        Log In
                                    </Button>
                                    <Button size="small" variant="dangerPrimary" onClick={() => onRemoveSaved(idx)}>
                                        Remove
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Discord Accounts */}
            <section>
                <Forms.FormTitle tag="h3" style={{ marginBottom: 4 }}>Discord Accounts</Forms.FormTitle>
                <Forms.FormText style={{ color: "var(--text-muted)", marginBottom: 16 }}>
                    Discord accounts you are logged in to. Switch between them or add more via token above.
                </Forms.FormText>

                {accounts.length === 0 && (
                    <div className="vc-settings-card">
                        <Text variant="text-sm/normal" style={{ color: "var(--text-muted)" }}>
                            No Discord accounts found. Try refreshing.
                        </Text>
                    </div>
                )}

                <div className="vc-settings-stat-grid">
                    {accounts.map((account, idx) => {
                        const { nativeAccount, userId } = account;
                        const user = UserStore.getUser(userId);
                        const title = user?.globalName || user?.username || nativeAccount?.name || `Account ${idx + 1}`;
                        const subtitle = user?.username ? `@${user.username}` : "Discord account";
                        const isCurrent = !!(currentId && String(currentId) === String(userId));


                        return (
                            <div
                                key={`${userId ?? idx}`}
                                className="vc-settings-card"
                                style={{
                                    background: isCurrent
                                        ? "color-mix(in srgb, var(--brand-500) 10%, var(--background-secondary-alt))"
                                        : undefined,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 12,
                                }}
                            >
                                <div style={{ minWidth: 0 }}>
                                    <Forms.FormText style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {title}
                                        {isCurrent && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-brand)", fontWeight: 400 }}>â— Current</span>}
                                    </Forms.FormText>
                                    <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 12 }}>
                                        {subtitle}{userId ? ` Â· ${userId}` : ""}
                                    </Forms.FormText>
                                </div>

                                <Button
                                    size="small"
                                    disabled={isCurrent || !apiReady || isSwitching || !account.nativeAccount}
                                    onClick={() => void onSwitch(account)}
                                >
                                    {isCurrent ? "Current" : isSwitching ? "Switching..." : "Switch"}
                                </Button>
                            </div>
                        );
                    })}
                </div>
            </section>
        </SettingsTab>
    );
}

export default wrapTab(AccountCenterTab, "Account Center");
