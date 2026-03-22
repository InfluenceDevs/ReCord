/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Margins } from "@utils/margins";
import { findByPropsLazy } from "@webpack";
import { Forms, React, Text, UserStore, useStateFromStores } from "@webpack/common";

const AccountSwitcherStore = findByPropsLazy("canAddAccount", "getAccounts");
const AccountSwitcherApi = findByPropsLazy("canAddAccount", "switchAccount");

function getAccountsSafe() {
    const getAccounts = (AccountSwitcherStore as any)?.getAccounts;
    if (typeof getAccounts !== "function") return null;

    try {
        const next = getAccounts();
        return Array.isArray(next) ? next : [];
    } catch {
        return [];
    }
}

async function switchToAccount(account: any) {
    const api = AccountSwitcherApi as any;
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
    const [status, setStatus] = React.useState("");
    const [isSwitching, setIsSwitching] = React.useState(false);

    const accounts = useStateFromStores([AccountSwitcherStore as any], () => getAccountsSafe());
    const apiReady = accounts !== null;
    const accountList = accounts ?? [];

    const currentId = UserStore.getCurrentUser()?.id;

    const refresh = React.useCallback(() => {
        // Trigger a re-render for stores that do not always emit changes reliably.
        setStatus(status => status);
    }, []);

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
            <Forms.FormTitle tag="h2">Account Center</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom16} style={{ color: "var(--text-muted)", maxWidth: 860 }}>
                Connected accounts from Discord's switcher. Click an account to switch instantly.
            </Forms.FormText>

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <Button size="small" onClick={refresh}>Refresh</Button>
            </div>

            {!apiReady && (
                <Text variant="text-sm/normal" style={{ color: "#ed4245", marginBottom: 10 }}>
                    Discord account-switcher API was not found in this build. Restart Discord and try again.
                </Text>
            )}

            {!!status && (
                <Text variant="text-sm/normal" style={{ color: "#ed4245", marginBottom: 10 }}>
                    {status}
                </Text>
            )}

            {accountList.length === 0 && (
                <Text variant="text-sm/normal" style={{ color: "var(--text-muted)" }}>
                    No connected accounts found. Add accounts from Discord's native account switcher first.
                </Text>
            )}

            <div style={{ display: "grid", gap: 8 }}>
                {accountList.map((account, idx) => {
                    const userId = account?.userId ?? account?.id;
                    const user = userId ? UserStore.getUser(userId) : null;
                    const title = user?.globalName || user?.username || account?.name || `Account ${idx + 1}`;
                    const subtitle = user?.username ? `@${user.username}` : "Connected account";
                    const isCurrent = !!(currentId && userId && String(currentId) === String(userId));

                    return (
                        <div
                            key={`${userId ?? idx}`}
                            style={{
                                border: "1px solid var(--border-subtle)",
                                borderRadius: 12,
                                padding: "10px 12px",
                                background: isCurrent ? "rgba(88,101,242,0.16)" : "var(--background-secondary)",
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
