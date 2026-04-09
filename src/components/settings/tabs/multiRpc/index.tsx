/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isPluginEnabled } from "@api/PluginManager";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { RPCSettings } from "@plugins/customRPC/RpcSettings";
import { Forms } from "@webpack/common";

function MultiRpcTab() {
    const enabled = isPluginEnabled("CustomRPC");

    return (
        <SettingsTab>
            <Forms.FormTitle tag="h2">Multi RPC</Forms.FormTitle>
            <Forms.FormText style={{ color: "var(--text-muted)", marginBottom: 12 }}>
                Configure multiple rich presence profiles and rotate between them when CustomRPC is enabled.
            </Forms.FormText>

            {!enabled && (
                <Forms.FormText style={{ color: "var(--text-danger)" }}>
                    CustomRPC is currently disabled. Enable it in Plugins first.
                </Forms.FormText>
            )}

            {enabled && <RPCSettings />}
        </SettingsTab>
    );
}

export default wrapTab(MultiRpcTab, "Multi RPC");
