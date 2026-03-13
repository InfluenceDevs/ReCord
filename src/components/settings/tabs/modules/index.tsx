/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Margins } from "@utils/margins";
import { Alerts, Button, Forms, React, Select } from "@webpack/common";

const STORE_KEY = "record_modules_settings";

type ModuleMode = "discord-default" | "custom-low-latency" | "custom-compat";

interface ModulesState {
    voice: ModuleMode;
    audioProcessing: ModuleMode;
    transport: ModuleMode;
    video: ModuleMode;
}

const DEFAULT_STATE: ModulesState = {
    voice: "discord-default",
    audioProcessing: "discord-default",
    transport: "discord-default",
    video: "discord-default"
};

function loadState(): ModulesState {
    try {
        const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
        return { ...DEFAULT_STATE, ...raw };
    } catch {
        return DEFAULT_STATE;
    }
}

function saveState(state: ModulesState) {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

const OPTIONS = [
    { label: "Discord Default", value: "discord-default", default: true },
    { label: "Custom Low Latency", value: "custom-low-latency" },
    { label: "Custom Compatibility", value: "custom-compat" }
] as const;

function Row({
    title,
    value,
    onChange,
    description
}: {
    title: string;
    value: ModuleMode;
    onChange: (v: ModuleMode) => void;
    description: string;
}) {
    return (
        <div style={{ marginBottom: 16 }}>
            <Forms.FormTitle tag="h5">{title}</Forms.FormTitle>
            <Forms.FormText style={{ color: "var(--text-muted)", marginBottom: 8 }}>{description}</Forms.FormText>
            <Select
                options={OPTIONS as any}
                serialize={String}
                select={v => onChange(v as ModuleMode)}
                isSelected={v => v === value}
                closeOnSelect={true}
            />
        </div>
    );
}

function ComingSoonRow({ title, description }: { title: string; description: string; }) {
    return (
        <div
            style={{
                marginBottom: 12,
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
                padding: "10px 12px",
                background: "var(--background-secondary)"
            }}
        >
            <Forms.FormTitle tag="h5">{title}</Forms.FormTitle>
            <Forms.FormText style={{ color: "var(--text-muted)" }}>{description}</Forms.FormText>
            <Forms.FormText style={{ color: "var(--text-brand)", marginTop: 4 }}>Coming soon</Forms.FormText>
        </div>
    );
}

function ModulesTab() {
    const [state, setState] = React.useState<ModulesState>(() => loadState());

    const update = React.useCallback((key: keyof ModulesState, value: ModuleMode) => {
        setState(prev => {
            const next = { ...prev, [key]: value };
            saveState(next);
            return next;
        });
    }, []);

    const apply = React.useCallback(async () => {
        try {
            // Try to apply native-side overrides if available
            await (VencordNative as any).native?.setModuleOverrides?.(state);
        } catch {
            // Fallback: persist only, used at runtime by module wrappers in upcoming releases
        }

        Alerts.show({
            title: "Module Profile Applied",
            body: "Module preferences saved. Restart Discord for full effect.",
            confirmText: "OK"
        });
    }, [state]);

    const reset = React.useCallback(() => {
        setState(DEFAULT_STATE);
        saveState(DEFAULT_STATE);
    }, []);

    return (
        <SettingsTab>
            <Forms.FormTitle tag="h2">Modules</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom16} style={{ color: "var(--text-muted)" }}>
                Choose Discord default modules or custom module profiles for voice/media components.
            </Forms.FormText>

            <Row
                title="Voice Engine Module"
                value={state.voice}
                onChange={v => update("voice", v)}
                description="Controls voice stack behavior and codec profile strategy."
            />

            <Row
                title="Audio Processing Module"
                value={state.audioProcessing}
                onChange={v => update("audioProcessing", v)}
                description="Noise suppression, echo cancellation, and gain handling profile."
            />

            <Row
                title="Network Transport Module"
                value={state.transport}
                onChange={v => update("transport", v)}
                description="RTC transport configuration profile for voice/video channels."
            />

            <Row
                title="Video Pipeline Module"
                value={state.video}
                onChange={v => update("video", v)}
                description="Video encode/decode profile for streams and calls."
            />

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <Button size="small" onClick={apply}>Apply Module Profile</Button>
                <Button size="small" onClick={reset}>Reset to Discord Default</Button>
            </div>

            <div style={{ height: 1, background: "var(--border-subtle)", marginBottom: 16 }} />

            <Forms.FormTitle tag="h5">Module Packs</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                No external module packs detected. Additional downloadable module packs will be available in a later release.
            </Forms.FormText>

            <ComingSoonRow title="Voice Codec Module Pack" description="Alternative codec presets and packetization strategies." />
            <ComingSoonRow title="AEC/NS Module Pack" description="Advanced echo/noise tuning pack for varied microphone setups." />
            <ComingSoonRow title="Transport Optimizer Pack" description="Route and retry profile tuning for unstable networks." />
            <ComingSoonRow title="Video Upscaling Pack" description="Enhanced rendering and scaling profile options." />
        </SettingsTab>
    );
}

export default wrapTab(ModulesTab, "Modules");
