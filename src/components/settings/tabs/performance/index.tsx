/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings, useSettings } from "@api/Settings";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Margins } from "@utils/margins";
import { Button, Forms, React, TextInput } from "@webpack/common";

function ToggleRow({
    title,
    description,
    value,
    onToggle,
    onLabel = "Enabled",
    offLabel = "Disabled"
}: {
    title: string;
    description: string;
    value: boolean;
    onToggle: () => void;
    onLabel?: string;
    offLabel?: string;
}) {
    return (
        <div
            style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: 12,
                background: "var(--background-secondary)",
                padding: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12
            }}
        >
            <div style={{ minWidth: 0 }}>
                <Forms.FormTitle tag="h5" style={{ marginBottom: 2 }}>{title}</Forms.FormTitle>
                <Forms.FormText style={{ color: "var(--text-muted)" }}>{description}</Forms.FormText>
            </div>

            <Button size="small" onClick={onToggle}>
                {value ? onLabel : offLabel}
            </Button>
        </div>
    );
}

function applyLowPowerPreset() {
    Settings.performance.enabled = true;
    Settings.performance.disableAnimations = true;
    Settings.performance.reduceBackdropBlur = true;
    Settings.performance.disableVisualFlair = true;
    Settings.performance.hideTypingIndicators = true;
    Settings.performance.hideActivityCards = false;
    Settings.performance.compactChannelList = true;
    Settings.performance.compactMemberList = true;
    Settings.performance.pauseHiddenMedia = true;
    Settings.performance.limitBackgroundFps = true;
    Settings.performance.backgroundFps = 8;
}

function applyBalancedPreset() {
    Settings.performance.enabled = true;
    Settings.performance.disableAnimations = false;
    Settings.performance.reduceBackdropBlur = true;
    Settings.performance.disableVisualFlair = true;
    Settings.performance.hideTypingIndicators = false;
    Settings.performance.hideActivityCards = false;
    Settings.performance.compactChannelList = false;
    Settings.performance.compactMemberList = false;
    Settings.performance.pauseHiddenMedia = true;
    Settings.performance.limitBackgroundFps = true;
    Settings.performance.backgroundFps = 12;
}

function disablePreset() {
    Settings.performance.enabled = false;
}

function PerformanceTab() {
    useSettings(["performance.*"]);
    const perf = Settings.performance;

    const activeCount = [
        perf.disableAnimations,
        perf.reduceBackdropBlur,
        perf.disableVisualFlair,
        perf.hideTypingIndicators,
        perf.hideActivityCards,
        perf.compactChannelList,
        perf.compactMemberList,
        perf.pauseHiddenMedia,
        perf.limitBackgroundFps
    ].filter(Boolean).length;

    const estimatedMode = !perf.enabled
        ? "Default"
        : activeCount >= 7
            ? "Aggressive Savings"
            : activeCount >= 4
                ? "Balanced Savings"
                : "Light Savings";

    return (
        <SettingsTab>
            <div
                style={{
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 14,
                    padding: 16,
                    background: "linear-gradient(145deg,var(--background-secondary),var(--background-tertiary))",
                    marginBottom: 14
                }}
            >
                <Forms.FormTitle tag="h2" style={{ marginBottom: 4 }}>Performance Control Center</Forms.FormTitle>
                <Forms.FormText style={{ color: "var(--text-muted)", marginBottom: 8 }}>
                    Apply renderer-focused optimizations to reduce CPU/GPU load, memory churn, and background usage.
                </Forms.FormText>
                <Forms.FormText style={{ color: "var(--text-muted)" }}>
                    Current profile: <b>{estimatedMode}</b> · Active optimizations: <b>{activeCount}</b>
                </Forms.FormText>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                <Button size="small" onClick={applyBalancedPreset}>Apply Balanced Preset</Button>
                <Button size="small" onClick={applyLowPowerPreset}>Apply Aggressive Preset</Button>
                <Button size="small" onClick={disablePreset}>Disable All Tweaks</Button>
            </div>

            <ToggleRow
                title="Performance Mode Master"
                description="Global switch for all ReCord performance optimizations."
                value={perf.enabled}
                onToggle={() => (Settings.performance.enabled = !perf.enabled)}
                onLabel="Performance Mode ON"
                offLabel="Performance Mode OFF"
            />

            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                <ToggleRow
                    title="Disable Animations"
                    description="Removes transitions and animations that add frame-time overhead."
                    value={perf.disableAnimations}
                    onToggle={() => (Settings.performance.disableAnimations = !perf.disableAnimations)}
                />

                <ToggleRow
                    title="Reduce Backdrop Blur"
                    description="Disables costly blur/filter effects to lower GPU utilization."
                    value={perf.reduceBackdropBlur}
                    onToggle={() => (Settings.performance.reduceBackdropBlur = !perf.reduceBackdropBlur)}
                />

                <ToggleRow
                    title="Disable Visual Flair"
                    description="Hides decorative profile/effect layers and expensive UI glows."
                    value={perf.disableVisualFlair}
                    onToggle={() => (Settings.performance.disableVisualFlair = !perf.disableVisualFlair)}
                />

                <ToggleRow
                    title="Hide Typing Indicators"
                    description="Reduces tiny but frequent animation churn in busy channels."
                    value={perf.hideTypingIndicators}
                    onToggle={() => (Settings.performance.hideTypingIndicators = !perf.hideTypingIndicators)}
                />

                <ToggleRow
                    title="Hide Activity Cards"
                    description="Removes rich activity surfaces that can increase repaint work."
                    value={perf.hideActivityCards}
                    onToggle={() => (Settings.performance.hideActivityCards = !perf.hideActivityCards)}
                />

                <ToggleRow
                    title="Compact Channel List"
                    description="Tighter channel rows reduce rendering area and scroll work."
                    value={perf.compactChannelList}
                    onToggle={() => (Settings.performance.compactChannelList = !perf.compactChannelList)}
                />

                <ToggleRow
                    title="Compact Member List"
                    description="Tighter member rows reduce list rendering cost in large guilds."
                    value={perf.compactMemberList}
                    onToggle={() => (Settings.performance.compactMemberList = !perf.compactMemberList)}
                />

                <ToggleRow
                    title="Pause Hidden Media"
                    description="Pauses autoplay/muted videos while Discord is hidden."
                    value={perf.pauseHiddenMedia}
                    onToggle={() => (Settings.performance.pauseHiddenMedia = !perf.pauseHiddenMedia)}
                />

                <ToggleRow
                    title="Limit Background FPS"
                    description="Throttles animation frames when Discord is unfocused/minimized."
                    value={perf.limitBackgroundFps}
                    onToggle={() => (Settings.performance.limitBackgroundFps = !perf.limitBackgroundFps)}
                    onLabel="Limiter ON"
                    offLabel="Limiter OFF"
                />

                <div
                    style={{
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 12,
                        background: "var(--background-secondary)",
                        padding: 12
                    }}
                >
                    <Forms.FormTitle tag="h5">Background FPS Target</Forms.FormTitle>
                    <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                        Used by background limiter. Lower values consume less CPU but reduce background smoothness.
                    </Forms.FormText>
                    <TextInput
                        value={String(perf.backgroundFps)}
                        onChange={v => {
                            const parsed = Number(v);
                            if (!Number.isFinite(parsed)) return;
                            Settings.performance.backgroundFps = Math.max(1, Math.min(30, Math.floor(parsed)));
                        }}
                        placeholder="1 - 30"
                    />
                </div>
            </div>

            <Forms.FormText className={Margins.top16} style={{ color: "var(--text-muted)" }}>
                Tip: Start with Balanced preset. If CPU/GPU usage is still high on large servers, switch to Aggressive.
            </Forms.FormText>
        </SettingsTab>
    );
}

export default wrapTab(PerformanceTab, "Performance");
