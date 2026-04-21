/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { resetAllSettings, resetPerformanceSettings, Settings, useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Margins } from "@utils/margins";
import { Alerts, Forms, React, TextInput } from "@webpack/common";

type PerfKey = Exclude<keyof typeof Settings.performance, "backgroundFps">;

type PerfDiagnostics = {
    fps: number;
    gpu: string;
    cores: number;
    memoryMb: number | null;
    jsHeapMb: number | null;
    hidden: boolean;
};

function detectGpuRenderer() {
    try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (!gl) return "Unknown GPU";

        const dbg = (gl as WebGLRenderingContext).getExtension("WEBGL_debug_renderer_info");
        if (!dbg) return "GPU info unavailable";

        return (gl as WebGLRenderingContext).getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string;
    } catch {
        return "GPU info unavailable";
    }
}

function usePerformanceDiagnostics(enabled: boolean) {
    const gpu = React.useMemo(() => detectGpuRenderer(), []);
    const [stats, setStats] = React.useState<PerfDiagnostics>({
        fps: 0,
        gpu,
        cores: navigator.hardwareConcurrency || 0,
        memoryMb: typeof (navigator as any).deviceMemory === "number"
            ? Math.round((navigator as any).deviceMemory * 1024)
            : null,
        jsHeapMb: null,
        hidden: document.hidden
    });

    React.useEffect(() => {
        if (!enabled) return;

        let raf = 0;
        let frameCount = 0;
        let lastSample = performance.now();

        const tick = () => {
            frameCount++;
            const now = performance.now();

            if (now - lastSample >= 1000) {
                const fps = Math.round((frameCount * 1000) / (now - lastSample));
                frameCount = 0;
                lastSample = now;

                const perfMem = (performance as any).memory;
                const jsHeapMb = perfMem?.usedJSHeapSize
                    ? Math.round(perfMem.usedJSHeapSize / (1024 * 1024))
                    : null;

                setStats(s => ({
                    ...s,
                    fps,
                    jsHeapMb,
                    hidden: document.hidden
                }));
            }

            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [enabled]);

    return stats;
}

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
    Settings.performance.disableShadows = true;
    Settings.performance.disableGradients = true;
    Settings.performance.disableHoverAnimations = true;
    Settings.performance.hideTypingIndicators = true;
    Settings.performance.hideActivityCards = true;
    Settings.performance.hideProfilePanels = true;
    Settings.performance.hideGuildBoostEffects = true;
    Settings.performance.hideStickersAndGifPreviews = true;
    Settings.performance.compactChannelList = true;
    Settings.performance.compactMemberList = true;
    Settings.performance.compactChatDensity = true;
    Settings.performance.preferStaticAvatars = true;
    Settings.performance.pauseHiddenMedia = true;
    Settings.performance.pauseHiddenAudio = true;
    Settings.performance.keepOnlyVisibleVideos = true;
    Settings.performance.limitBackgroundFps = true;
    Settings.performance.backgroundFps = 8;
    Settings.performance.diagnosticsEnabled = true;
}

function applyBalancedPreset() {
    Settings.performance.enabled = true;
    Settings.performance.disableAnimations = true;
    Settings.performance.reduceBackdropBlur = true;
    Settings.performance.disableVisualFlair = false;
    Settings.performance.disableShadows = false;
    Settings.performance.disableGradients = false;
    Settings.performance.disableHoverAnimations = false;
    Settings.performance.hideTypingIndicators = false;
    Settings.performance.hideActivityCards = true;
    Settings.performance.hideProfilePanels = false;
    Settings.performance.hideGuildBoostEffects = true;
    Settings.performance.hideStickersAndGifPreviews = false;
    Settings.performance.compactChannelList = false;
    Settings.performance.compactMemberList = false;
    Settings.performance.compactChatDensity = false;
    Settings.performance.preferStaticAvatars = false;
    Settings.performance.pauseHiddenMedia = true;
    Settings.performance.pauseHiddenAudio = true;
    Settings.performance.keepOnlyVisibleVideos = true;
    Settings.performance.limitBackgroundFps = true;
    Settings.performance.backgroundFps = 12;
    Settings.performance.diagnosticsEnabled = true;
}

function applyVisualPreset() {
    Settings.performance.enabled = true;
    Settings.performance.disableAnimations = false;
    Settings.performance.reduceBackdropBlur = false;
    Settings.performance.disableVisualFlair = false;
    Settings.performance.disableShadows = false;
    Settings.performance.disableGradients = false;
    Settings.performance.disableHoverAnimations = false;
    Settings.performance.hideTypingIndicators = false;
    Settings.performance.hideActivityCards = false;
    Settings.performance.hideProfilePanels = false;
    Settings.performance.hideGuildBoostEffects = false;
    Settings.performance.hideStickersAndGifPreviews = false;
    Settings.performance.compactChannelList = false;
    Settings.performance.compactMemberList = false;
    Settings.performance.compactChatDensity = false;
    Settings.performance.preferStaticAvatars = false;
    Settings.performance.pauseHiddenMedia = true;
    Settings.performance.pauseHiddenAudio = true;
    Settings.performance.keepOnlyVisibleVideos = false;
    Settings.performance.limitBackgroundFps = true;
    Settings.performance.backgroundFps = 16;
    Settings.performance.diagnosticsEnabled = true;
}

function disablePreset() {
    Settings.performance.enabled = false;
}

function togglePerf(key: PerfKey) {
    Settings.performance[key] = !Settings.performance[key] as any;
}

function PerformanceTab() {
    useSettings(["performance.*"]);
    const perf = Settings.performance;
    const diagnostics = usePerformanceDiagnostics(perf.diagnosticsEnabled);

    const activeCount = [
        perf.disableAnimations,
        perf.reduceBackdropBlur,
        perf.disableVisualFlair,
        perf.disableShadows,
        perf.disableGradients,
        perf.disableHoverAnimations,
        perf.hideTypingIndicators,
        perf.hideActivityCards,
        perf.hideProfilePanels,
        perf.hideGuildBoostEffects,
        perf.hideStickersAndGifPreviews,
        perf.compactChannelList,
        perf.compactMemberList,
        perf.compactChatDensity,
        perf.preferStaticAvatars,
        perf.pauseHiddenMedia,
        perf.pauseHiddenAudio,
        perf.keepOnlyVisibleVideos,
        perf.limitBackgroundFps
    ].filter(Boolean).length;

    const estimatedMode = !perf.enabled
        ? "Default"
        : activeCount >= 7
            ? "Aggressive Savings"
            : activeCount >= 4
                ? "Balanced Savings"
                : "Light Savings";

    const diagnosticsOverlay = perf.diagnosticsOverlay && perf.diagnosticsEnabled;

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
                    ReCord now defaults to a performance-first profile so expensive visual extras stay off until you enable them.
                </Forms.FormText>
                <Forms.FormText style={{ color: "var(--text-muted)" }}>
                    Current profile: <b>{estimatedMode}</b> · Active optimizations: <b>{activeCount}</b>
                </Forms.FormText>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                <Button size="small" onClick={applyBalancedPreset}>Apply Balanced Preset</Button>
                <Button size="small" onClick={applyLowPowerPreset}>Apply Aggressive Preset</Button>
                <Button size="small" onClick={applyVisualPreset}>Apply Visual Quality Preset</Button>
                <Button size="small" onClick={disablePreset}>Disable All Tweaks</Button>
                <Button size="small" onClick={resetPerformanceSettings}>Reset Performance Defaults</Button>
                <Button
                    size="small"
                    variant="primary"
                    onClick={() => {
                        Alerts.show({
                            title: "Reset all settings?",
                            body: "This will reset ReCord, plugin, theme, and performance settings to defaults.",
                            confirmText: "Reset Everything",
                            cancelText: "Cancel",
                            onConfirm: () => resetAllSettings()
                        });
                    }}
                >
                    Reset All Settings
                </Button>
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
                    onToggle={() => togglePerf("disableVisualFlair")}
                />

                <ToggleRow
                    title="Disable Shadows"
                    description="Removes UI shadows and text glows that trigger frequent repaints."
                    value={perf.disableShadows}
                    onToggle={() => togglePerf("disableShadows")}
                />

                <ToggleRow
                    title="Disable Gradients"
                    description="Turns off gradient layers and image backgrounds to reduce GPU fill-rate load."
                    value={perf.disableGradients}
                    onToggle={() => togglePerf("disableGradients")}
                />

                <ToggleRow
                    title="Disable Hover Animations"
                    description="Stops hover/focus animation effects while navigating channels and DMs."
                    value={perf.disableHoverAnimations}
                    onToggle={() => togglePerf("disableHoverAnimations")}
                />

                <ToggleRow
                    title="Hide Typing Indicators"
                    description="Reduces tiny but frequent animation churn in busy channels."
                    value={perf.hideTypingIndicators}
                    onToggle={() => togglePerf("hideTypingIndicators")}
                />

                <ToggleRow
                    title="Hide Activity Cards"
                    description="Removes rich activity surfaces that can increase repaint work."
                    value={perf.hideActivityCards}
                    onToggle={() => togglePerf("hideActivityCards")}
                />

                <ToggleRow
                    title="Hide Profile Panels"
                    description="Hides heavy popout/profile panel surfaces that use effects and media."
                    value={perf.hideProfilePanels}
                    onToggle={() => togglePerf("hideProfilePanels")}
                />

                <ToggleRow
                    title="Hide Guild Boost Effects"
                    description="Suppresses premium/boost visual callouts and effect containers."
                    value={perf.hideGuildBoostEffects}
                    onToggle={() => togglePerf("hideGuildBoostEffects")}
                />

                <ToggleRow
                    title="Hide Sticker and GIF Previews"
                    description="Disables animated media previews in expression picker surfaces."
                    value={perf.hideStickersAndGifPreviews}
                    onToggle={() => togglePerf("hideStickersAndGifPreviews")}
                />

                <ToggleRow
                    title="Compact Channel List"
                    description="Tighter channel rows reduce rendering area and scroll work."
                    value={perf.compactChannelList}
                    onToggle={() => togglePerf("compactChannelList")}
                />

                <ToggleRow
                    title="Compact Member List"
                    description="Tighter member rows reduce list rendering cost in large guilds."
                    value={perf.compactMemberList}
                    onToggle={() => togglePerf("compactMemberList")}
                />

                <ToggleRow
                    title="Compact Chat Density"
                    description="Reduces message vertical spacing to lower the amount of content on-screen."
                    value={perf.compactChatDensity}
                    onToggle={() => togglePerf("compactChatDensity")}
                />

                <ToggleRow
                    title="Prefer Static Avatars"
                    description="Prefers static avatar rendering over animated visuals where possible."
                    value={perf.preferStaticAvatars}
                    onToggle={() => togglePerf("preferStaticAvatars")}
                />

                <ToggleRow
                    title="Pause Hidden Media"
                    description="Pauses autoplay/muted videos while Discord is hidden."
                    value={perf.pauseHiddenMedia}
                    onToggle={() => togglePerf("pauseHiddenMedia")}
                />

                <ToggleRow
                    title="Pause Hidden Audio"
                    description="Stops background audio streams while Discord is hidden."
                    value={perf.pauseHiddenAudio}
                    onToggle={() => togglePerf("pauseHiddenAudio")}
                />

                <ToggleRow
                    title="Keep Only Visible Videos Running"
                    description="Pauses video elements that are off-screen to reduce decode/GPU usage."
                    value={perf.keepOnlyVisibleVideos}
                    onToggle={() => togglePerf("keepOnlyVisibleVideos")}
                />

                <ToggleRow
                    title="Limit Background FPS"
                    description="Throttles animation frames when Discord is unfocused/minimized."
                    value={perf.limitBackgroundFps}
                    onToggle={() => togglePerf("limitBackgroundFps")}
                    onLabel="Limiter ON"
                    offLabel="Limiter OFF"
                />

                <ToggleRow
                    title="Enable Diagnostics"
                    description="Shows live FPS, GPU renderer, memory, and visibility status."
                    value={perf.diagnosticsEnabled}
                    onToggle={() => togglePerf("diagnosticsEnabled")}
                />

                <ToggleRow
                    title="Show Diagnostics Overlay"
                    description="Displays a compact floating diagnostics HUD while ReCord is running."
                    value={perf.diagnosticsOverlay}
                    onToggle={() => togglePerf("diagnosticsOverlay")}
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

                {perf.diagnosticsEnabled && (
                    <div
                        style={{
                            border: "1px solid var(--border-subtle)",
                            borderRadius: 12,
                            background: "var(--background-secondary)",
                            padding: 12,
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                            gap: 10
                        }}
                    >
                        <div>
                            <Forms.FormTitle tag="h5">FPS</Forms.FormTitle>
                            <Forms.FormText>{diagnostics.fps} fps</Forms.FormText>
                        </div>
                        <div>
                            <Forms.FormTitle tag="h5">GPU Renderer</Forms.FormTitle>
                            <Forms.FormText>{diagnostics.gpu}</Forms.FormText>
                        </div>
                        <div>
                            <Forms.FormTitle tag="h5">CPU Cores</Forms.FormTitle>
                            <Forms.FormText>{diagnostics.cores || "Unknown"}</Forms.FormText>
                        </div>
                        <div>
                            <Forms.FormTitle tag="h5">System Memory</Forms.FormTitle>
                            <Forms.FormText>{diagnostics.memoryMb ? `${diagnostics.memoryMb} MB` : "Unavailable"}</Forms.FormText>
                        </div>
                        <div>
                            <Forms.FormTitle tag="h5">JS Heap</Forms.FormTitle>
                            <Forms.FormText>{diagnostics.jsHeapMb ? `${diagnostics.jsHeapMb} MB` : "Unavailable"}</Forms.FormText>
                        </div>
                        <div>
                            <Forms.FormTitle tag="h5">Visibility</Forms.FormTitle>
                            <Forms.FormText>{diagnostics.hidden ? "Background" : "Foreground"}</Forms.FormText>
                        </div>
                    </div>
                )}

                {diagnosticsOverlay && (
                    <div
                        style={{
                            position: "fixed",
                            right: 12,
                            bottom: 12,
                            zIndex: 99999,
                            borderRadius: 10,
                            border: "1px solid var(--border-subtle)",
                            background: "color-mix(in srgb, var(--background-tertiary) 88%, black)",
                            padding: "8px 10px",
                            fontSize: 12,
                            lineHeight: 1.4,
                            backdropFilter: "blur(8px)"
                        }}
                    >
                        <div><b>{diagnostics.fps}</b> fps</div>
                        <div>{diagnostics.jsHeapMb ? `${diagnostics.jsHeapMb} MB heap` : "heap: n/a"}</div>
                        <div>{diagnostics.hidden ? "background" : "foreground"}</div>
                    </div>
                )}
            </div>

            <Forms.FormText className={Margins.top16} style={{ color: "var(--text-muted)" }}>
                Tip: Start with Balanced. If FPS drops on busy servers, switch to Aggressive and keep diagnostics enabled.
            </Forms.FormText>
        </SettingsTab>
    );
}

export default wrapTab(PerformanceTab, "Performance");
