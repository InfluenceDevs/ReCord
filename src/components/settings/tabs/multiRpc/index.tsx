/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isPluginEnabled } from "@api/PluginManager";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { settings as customRpcSettings } from "@plugins/customRPC";
import { RPCSettings } from "@plugins/customRPC/RpcSettings";
import { Forms, React } from "@webpack/common";

function countProfiles(rawProfiles?: string) {
    try {
        const parsed = JSON.parse(rawProfiles || "[]");
        return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
        return 0;
    }
}

function CustomRpcTab() {
    const enabled = isPluginEnabled("CustomRPC");
    const rpcSettings = customRpcSettings.use();
    const profileCount = React.useMemo(() => countProfiles(rpcSettings.multiRpcProfiles), [rpcSettings.multiRpcProfiles]);

    return (
        <SettingsTab>
            <div className="vc-settings-hero">
                <Forms.FormTitle tag="h2">CustomRPC Studio</Forms.FormTitle>
                <Forms.FormText>
                    Build cleaner Rich Presence layouts, save multiple profiles, and manage them from one dedicated place instead of digging through plugin settings.
                </Forms.FormText>

                <div className="vc-settings-pill-row">
                    <div className="vc-settings-pill"><strong>Status</strong> {enabled ? "Enabled" : "Disabled"}</div>
                    <div className="vc-settings-pill"><strong>Profiles</strong> {profileCount}</div>
                    <div className="vc-settings-pill"><strong>Rotation</strong> {rpcSettings.multiRpcEnabled ? "Active" : "Off"}</div>
                </div>
            </div>

            <div className="vc-settings-stat-grid">
                <div className="vc-settings-stat-card">
                    <Forms.FormTitle tag="h5">Live RPC</Forms.FormTitle>
                    <Forms.FormText>Current presence pushed to Discord right now.</Forms.FormText>
                    <span className="vc-settings-stat-value">{rpcSettings.appName || "Idle"}</span>
                </div>

                <div className="vc-settings-stat-card">
                    <Forms.FormTitle tag="h5">Saved Profiles</Forms.FormTitle>
                    <Forms.FormText>Reusable RPC presets you can create with the + button.</Forms.FormText>
                    <span className="vc-settings-stat-value">{profileCount}</span>
                </div>

                <div className="vc-settings-stat-card">
                    <Forms.FormTitle tag="h5">Rotation Interval</Forms.FormTitle>
                    <Forms.FormText>How often ReCord cycles saved profiles when rotation is enabled.</Forms.FormText>
                    <span className="vc-settings-stat-value">{Math.max(5, Number(rpcSettings.multiRpcIntervalSec) || 30)}s</span>
                </div>
            </div>

            {!enabled && (
                <div className="vc-settings-card">
                    <Forms.FormText style={{ color: "var(--text-danger)" }}>
                        CustomRPC is currently disabled. Enable it in Plugins first to create and push Rich Presence profiles.
                    </Forms.FormText>
                </div>
            )}

            {enabled && (
                <div className="vc-settings-card">
                    <RPCSettings />
                </div>
            )}
        </SettingsTab>
    );
}

export default wrapTab(CustomRpcTab, "CustomRPC");
