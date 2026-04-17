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

function resolveAccountSwitcherStore() {
    try {
        return findByProps("canAddAccount", "getAccounts") as Record<string, unknown> | undefined;
    } catch {
        return undefined;
    }
}

function resolveAccountSwitcherApi() {
    try {
        return findByProps("canAddAccount", "switchAccount") as Record<string, unknown> | undefined;
    } catch {
        return undefined;
    }
}

function getAccountsSafe() {
    const getAccounts = resolveAccountSwitcherStore()?.getAccounts;
    if (typeof getAccounts !== "function") return null;

    try {
        const next = getAccounts();
        return Array.isArray(next) ? next : [];
    } catch {
        return [];
    }
}

async function switchToAccount(account: any) {
    const api = resolveAccountSwitcherApi() as any;
    const ids = [account?.id, account?.accountId, account?.userId, account?.uid].filter(Boolean);
    const methods = ["switchAccount", "switchToAccount", "setActiveAccount"];

    for (const method of methods) {
        if (typeof api?.[method] !== "function") continue;

        for (const id of ids) {
            try {
                await Promise.resolve(api[method](id));
                return true;
            } catch {
                // noop
            }
        }

        try {
            await Promise.resolve(api[method](account));
            return true;
        } catch {
            // noop
        }
    }

    return false;
}

function AccountCenterTab() {
    const [accounts, setAccounts] = React.useState<any[]>(() => getAccountsSafe() ?? []);
    const [apiReady, setApiReady] = React.useState(() => getAccountsSafe() !== null);
    const [status, setStatus] = React.useState("");
    const [isSwitching, setIsSwitching] = React.useState(false);
    const accountList = accounts;

    const currentId = UserStore.getCurrentUser()?.id;

    const refresh = React.useCallback(() => {
        const next = getAccountsSafe();
        setApiReady(next !== null);
        setAccounts(next ?? []);
    }, []);

    React.useEffect(() => {
        refresh();

        const id = window.setInterval(refresh, 3000);
        return () => clearInterval(id);
    }, [refresh]);

    const onSwitch = React.useCallback(async (account: any) => {
        setStatus("");
        setIsSwitching(true);

        const ok = await switchToAccount(account);
        if (!ok) {
            setStatus("Could not switch account with current Discord APIs. Try using Discord's native account switcher once, then retry.");
        }

        setIsSwitching(false);
    }, []);

    return (
        <SettingsTab>
            <div className="vc-settings-hero">
                <Forms.FormTitle tag="h2">Account Center</Forms.FormTitle>
                <Forms.FormText className={Margins.bottom16} style={{ maxWidth: 860 }}>
                    Connected accounts from Discord's switcher, cleaned up into a faster overview with instant switching and a clearer current-account state.
                </Forms.FormText>

                <div className="vc-settings-pill-row">
                    <div className="vc-settings-pill"><strong>Connected</strong> {accountList.length}</div>
                    <div className="vc-settings-pill"><strong>API</strong> {apiReady ? "Ready" : "Unavailable"}</div>
                    <div className="vc-settings-pill"><strong>Current</strong> {currentId ? "Detected" : "Unknown"}</div>
                </div>
            </div>

            <div className="vc-settings-actions">
                <Button size="small" onClick={refresh}>Refresh</Button>
            </div>

            {!apiReady && (
                <div className="vc-settings-card">
                    <Text variant="text-sm/normal" style={{ color: "#ed4245" }}>
                        Discord account-switcher API was not found in this build. Restart Discord and try again.
                    </Text>
                </div>
            )}

            {!!status && (
                <div className="vc-settings-card">
                    <Text variant="text-sm/normal" style={{ color: "#ed4245" }}>
                        {status}
                    </Text>
                </div>
            )}

            {accountList.length === 0 && (
                <div className="vc-settings-card">
                    <Text variant="text-sm/normal" style={{ color: "var(--text-muted)" }}>
                        No connected accounts found. Add accounts from Discord's native account switcher first.
                    </Text>
                </div>
            )}

            <div className="vc-settings-stat-grid">
                {accountList.map((account, idx) => {
                    const userId = account?.userId ?? account?.id;
                    const user = userId ? UserStore.getUser(userId) : null;
                    const title = user?.globalName || user?.username || account?.name || `Account ${idx + 1}`;
                    const subtitle = user?.username ? `@${user.username}` : "Connected account";
                    const isCurrent = !!(currentId && userId && String(currentId) === String(userId));

                    return (
                        <div
                            key={`${userId ?? idx}`}
                            className="vc-settings-card"
                            style={{
                                background: isCurrent
                                    ? "linear-gradient(165deg, rgb(88 101 242 / 18%), color-mix(in srgb, var(--background-secondary) 92%, transparent))"
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
                                </Forms.FormText>
                                <Forms.FormText style={{ color: "var(--text-muted)", fontSize: 12 }}>
                                    {subtitle}
                                    {userId ? ` · ${userId}` : ""}
                                    {isCurrent ? " · Current" : ""}
                                </Forms.FormText>
                            </div>

                            <Button
                                size="small"
                                disabled={isCurrent || !apiReady || isSwitching}
                                onClick={() => void onSwitch(account)}
                            >
                                {isCurrent ? "Current" : isSwitching ? "Switching..." : "Switch"}
                            </Button>
                        </div>
                    );
                })}
            </div>
        </SettingsTab>
    );
}

export default wrapTab(AccountCenterTab, "Account Center");
