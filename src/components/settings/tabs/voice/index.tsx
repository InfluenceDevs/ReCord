/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// ─── Voice Settings Tab ──────────────────────────────────────────────────────
// Self-monitoring (sidetone) with bass/treble/voice-changer and device routing.
// Audio engine uses MediaStreamDestination → HTMLAudioElement so setSinkId works
// and AudioContext.resume() is called so the context is never left suspended.

import { Button } from "@components/Button";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Margins } from "@utils/margins";
import { Alerts, Forms, React } from "@webpack/common";

interface VoicePlaybackState {
    microphonePlaybackEnabled: boolean;
    persistentPlayback: boolean;
    playbackVolume: number;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
    bassGain: number;
    trebleGain: number;
    voiceChanger: "off" | "deep" | "chipmunk" | "robot" | "radio";
    selectedInputDevice: string;
    selectedOutputDevice: string;
}

const STORE_KEY = "record_voice_playback_settings";

const DEFAULT_STATE: VoicePlaybackState = {
    microphonePlaybackEnabled: false,
    persistentPlayback: false,
    playbackVolume: 0.5,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    bassGain: 0,
    trebleGain: 0,
    voiceChanger: "off",
    selectedInputDevice: "default",
    selectedOutputDevice: "default"
};

function getStorage() {
    try {
        if (typeof globalThis === "undefined") return null;
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

function loadState(): VoicePlaybackState {
    try {
        const storage = getStorage();
        if (!storage) return DEFAULT_STATE;

        const raw = JSON.parse(storage.getItem(STORE_KEY) ?? "{}");
        return { ...DEFAULT_STATE, ...raw };
    } catch {
        return DEFAULT_STATE;
    }
}

function saveState(state: VoicePlaybackState) {
    try {
        const storage = getStorage();
        if (!storage) return;
        storage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
        // no-op when storage is unavailable
    }
}

// ─── Audio engine ────────────────────────────────────────────────────────────
// Uses MediaStreamDestination → HTMLAudioElement pipeline so that:
//   1. AudioContext.resume() is called right after creation (fixes suspended state)
//   2. setSinkId() on the <audio> element routes to the correct output device
//   3. Each call creates a fresh context + source (no stale-node reuse bug)

let audioCtx: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let volumeNode: GainNode | null = null;
let bassNode: BiquadFilterNode | null = null;
let trebleNode: BiquadFilterNode | null = null;
let effectNode: BiquadFilterNode | null = null;
let outputEl: HTMLAudioElement | null = null;

function applyEffect(node: BiquadFilterNode, mode: VoicePlaybackState["voiceChanger"]) {
    switch (mode) {
        case "deep":
            node.type = "lowshelf";
            node.frequency.value = 240;
            node.gain.value = 10;
            break;
        case "chipmunk":
            node.type = "highshelf";
            node.frequency.value = 2600;
            node.gain.value = 12;
            break;
        case "robot":
            node.type = "bandpass";
            node.frequency.value = 900;
            node.Q.value = 3;
            break;
        case "radio":
            node.type = "bandpass";
            node.frequency.value = 1800;
            node.Q.value = 2;
            break;
        default:
            node.type = "allpass";
            node.frequency.value = 1000;
            node.gain.value = 0;
    }
}

/** Start self-monitoring. Returns an error string on failure, null on success. */
async function startPlayback(state: VoicePlaybackState): Promise<string | null> {
    try {
        // Always start clean
        await stopPlayback();

        // Request mic with user-chosen constraints
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: state.selectedInputDevice !== "default"
                    ? { ideal: state.selectedInputDevice }
                    : undefined,
                echoCancellation: state.echoCancellation,
                noiseSuppression: state.noiseSuppression,
                autoGainControl: state.autoGainControl
            }
        });

        // Create and immediately resume AudioContext
        audioCtx = new AudioContext();
        if (audioCtx.state === "suspended") await audioCtx.resume();

        const source = audioCtx.createMediaStreamSource(mediaStream);

        bassNode = audioCtx.createBiquadFilter();
        bassNode.type = "lowshelf";
        bassNode.frequency.value = 200;
        bassNode.gain.value = state.bassGain;

        trebleNode = audioCtx.createBiquadFilter();
        trebleNode.type = "highshelf";
        trebleNode.frequency.value = 3500;
        trebleNode.gain.value = state.trebleGain;

        effectNode = audioCtx.createBiquadFilter();
        applyEffect(effectNode, state.voiceChanger);

        volumeNode = audioCtx.createGain();
        volumeNode.gain.value = state.playbackVolume;

        // Route to a MediaStreamDestination so <audio> can setSinkId
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(bassNode);
        bassNode.connect(trebleNode);
        trebleNode.connect(effectNode);
        effectNode.connect(volumeNode);
        volumeNode.connect(dest);

        // Play via HTMLAudioElement for output-device routing
        outputEl = new Audio();
        outputEl.srcObject = dest.stream;
        outputEl.autoplay = true;

        if (
            state.selectedOutputDevice !== "default" &&
            typeof (outputEl as any).setSinkId === "function"
        ) {
            try {
                await (outputEl as any).setSinkId(state.selectedOutputDevice);
            } catch {
                // setSinkId unavailable for this device, fall through to default
            }
        }

        await outputEl.play();
        return null;
    } catch (err: any) {
        await stopPlayback();
        const msg: string = err?.message ?? String(err);
        if (/Permission|NotAllowed|denied/i.test(msg))
            return "Microphone permission denied. Allow microphone access in Discord settings and try again.";
        if (/NotFound|device not found|Requested device/i.test(msg))
            return "Microphone not found. Check your device selection and try again.";
        return `Playback failed: ${msg}`;
    }
}

async function stopPlayback() {
    try {
        if (outputEl) {
            outputEl.pause();
            outputEl.srcObject = null;
            outputEl = null;
        }
        if (mediaStream) {
            mediaStream.getTracks().forEach(t => t.stop());
            mediaStream = null;
        }
        if (audioCtx) {
            await audioCtx.close();
            audioCtx = null;
        }
        volumeNode = bassNode = trebleNode = effectNode = null;
    } catch {
        // best-effort cleanup
    }
}

function VoiceTab() {
    const [state, setState] = React.useState<VoicePlaybackState>(() => loadState());
    const [isPlaying, setIsPlaying] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [devices, setDevices] = React.useState<{ input: MediaDeviceInfo[]; output: MediaDeviceInfo[] }>({ input: [], output: [] });

    React.useEffect(() => {
        navigator.mediaDevices.enumerateDevices().then(list => {
            setDevices({
                input: list.filter(d => d.kind === "audioinput"),
                output: list.filter(d => d.kind === "audiooutput")
            });
        });
    }, []);

    const update = React.useCallback((key: keyof VoicePlaybackState, value: any) => {
        setState(prev => {
            const next = { ...prev, [key]: value };
            saveState(next);
            // Live-update audio nodes without restarting
            if (key === "playbackVolume" && volumeNode) volumeNode.gain.value = value;
            if (key === "bassGain" && bassNode) bassNode.gain.value = value;
            if (key === "trebleGain" && trebleNode) trebleNode.gain.value = value;
            if (key === "voiceChanger" && effectNode) applyEffect(effectNode, value);
            return next;
        });
    }, []);

    // Auto-start when persistentPlayback is turned on
    React.useEffect(() => {
        if (!state.persistentPlayback || isPlaying) return;
        startPlayback(state).then(err => {
            if (err) setError(err);
            else { setIsPlaying(true); setError(null); }
        });
    }, [state.persistentPlayback]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggle = React.useCallback(async () => {
        if (isPlaying) {
            await stopPlayback();
            setIsPlaying(false);
            setError(null);
        } else {
            const err = await startPlayback(state);
            if (err) {
                setError(err);
                Alerts.show({ title: "Microphone Error", body: err, confirmText: "OK" });
            } else {
                setIsPlaying(true);
                setError(null);
            }
        }
    }, [isPlaying, state]);

    const toggleRow = (label: string, desc: string, key: keyof VoicePlaybackState) => (
        <div key={key} className="vc-voice-row">
            <div>
                <Forms.FormTitle tag="h5" style={{ marginBottom: 2 }}>{label}</Forms.FormTitle>
                <Forms.FormText style={{ color: "var(--text-muted)" }}>{desc}</Forms.FormText>
            </div>
            <Button
                size="small"
                variant={state[key] ? "primary" : "secondary"}
                onClick={() => update(key, !state[key])}
            >
                {state[key] ? "On" : "Off"}
            </Button>
        </div>
    );

    const slider = (label: string, key: "playbackVolume" | "bassGain" | "trebleGain", min: number, max: number, step: number, fmt: (v: number) => string) => (
        <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <Forms.FormTitle tag="h5" style={{ margin: 0 }}>{label}</Forms.FormTitle>
                <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{fmt(state[key] as number)}</span>
            </div>
            <input
                type="range"
                min={min} max={max} step={step}
                value={state[key] as number}
                onChange={e => update(key, parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "var(--brand-500)" }}
            />
        </div>
    );

    return (
        <SettingsTab>
            <Forms.FormTitle tag="h2">Voice Settings</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom16} style={{ color: "var(--text-muted)" }}>
                Configure microphone self-monitoring (sidetone), audio processing, and device routing.
            </Forms.FormText>

            {/* ── Self-monitoring ── */}
            <section>
                <Forms.FormTitle tag="h3" style={{ marginBottom: 4 }}>Self-Monitoring</Forms.FormTitle>
                <Forms.FormText style={{ color: "var(--text-muted)", marginBottom: 16 }}>
                    Hear your own microphone in real-time. Useful for checking mic quality before calls.
                </Forms.FormText>

                <div className="vc-voice-row">
                    <div>
                        <Forms.FormTitle tag="h5" style={{ marginBottom: 2 }}>Microphone Playback</Forms.FormTitle>
                        <Forms.FormText style={{ color: isPlaying ? "var(--text-positive)" : "var(--text-muted)" }}>
                            {isPlaying ? "Active — you can hear yourself" : "Inactive"}
                        </Forms.FormText>
                    </div>
                    <Button size="small" variant={isPlaying ? "destructive" : "primary"} onClick={toggle}>
                        {isPlaying ? "Stop" : "Start"}
                    </Button>
                </div>

                <div className="vc-voice-row" style={{ marginBottom: 12 }}>
                    <div>
                        <Forms.FormTitle tag="h5" style={{ marginBottom: 2 }}>Always Keep On</Forms.FormTitle>
                        <Forms.FormText style={{ color: "var(--text-muted)" }}>
                            Auto-restarts playback when enabled, even after navigating away.
                        </Forms.FormText>
                    </div>
                    <Button
                        size="small"
                        variant={state.persistentPlayback ? "primary" : "secondary"}
                        onClick={async () => {
                            const next = !state.persistentPlayback;
                            update("persistentPlayback", next);
                            if (next && !isPlaying) {
                                const err = await startPlayback({ ...state, persistentPlayback: true });
                                if (err) setError(err);
                                else { setIsPlaying(true); setError(null); }
                            }
                        }}
                    >
                        {state.persistentPlayback ? "Enabled" : "Disabled"}
                    </Button>
                </div>

                {error && (
                    <div style={{
                        background: "color-mix(in srgb, var(--status-danger) 10%, transparent)",
                        border: "1px solid var(--status-danger)",
                        borderRadius: 6,
                        padding: "8px 12px",
                        marginBottom: 12,
                        color: "var(--text-normal)",
                        fontSize: 13
                    }}>
                        {error}
                    </div>
                )}

                {slider("Playback Volume", "playbackVolume", 0, 1, 0.01, v => `${Math.round(v * 100)}%`)}
                {slider("Bass", "bassGain", -20, 20, 1, v => `${v > 0 ? "+" : ""}${v} dB`)}
                {slider("Treble", "trebleGain", -20, 20, 1, v => `${v > 0 ? "+" : ""}${v} dB`)}

                <div style={{ marginBottom: 4 }}>
                    <Forms.FormTitle tag="h5" style={{ marginBottom: 6 }}>Voice Changer</Forms.FormTitle>
                    <select
                        value={state.voiceChanger}
                        onChange={e => update("voiceChanger", e.target.value as VoicePlaybackState["voiceChanger"])}
                        style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: 4,
                            border: "1px solid var(--input-border)",
                            background: "var(--input-background)",
                            color: "var(--text-normal)"
                        }}
                    >
                        <option value="off">Off</option>
                        <option value="deep">Deep Voice</option>
                        <option value="chipmunk">Chipmunk</option>
                        <option value="robot">Robot</option>
                        <option value="radio">Radio</option>
                    </select>
                </div>
            </section>

            {/* ── Audio Processing ── */}
            <section>
                <Forms.FormTitle tag="h3" style={{ marginBottom: 4 }}>Audio Processing</Forms.FormTitle>
                <Forms.FormText style={{ color: "var(--text-muted)", marginBottom: 16 }}>
                    Applied by the browser when capturing your microphone. Changes take effect on next playback start.
                </Forms.FormText>
                <div style={{ display: "flex", flexDirection: "column" }}>
                    {toggleRow("Echo Cancellation", "Removes feedback and echo from playback.", "echoCancellation")}
                    {toggleRow("Noise Suppression", "Reduces background noise.", "noiseSuppression")}
                    {toggleRow("Auto Gain Control", "Automatically normalises microphone level.", "autoGainControl")}
                </div>
            </section>

            {/* ── Devices ── */}
            <section>
                <Forms.FormTitle tag="h3" style={{ marginBottom: 4 }}>Devices</Forms.FormTitle>
                <Forms.FormText style={{ color: "var(--text-muted)", marginBottom: 16 }}>
                    Choose which microphone to capture and which speaker to play back through.
                </Forms.FormText>

                <div style={{ marginBottom: 12 }}>
                    <Forms.FormTitle tag="h5" style={{ marginBottom: 6 }}>Input Device (Microphone)</Forms.FormTitle>
                    <select
                        value={state.selectedInputDevice}
                        onChange={e => update("selectedInputDevice", e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 4, border: "1px solid var(--input-border)", background: "var(--input-background)", color: "var(--text-normal)" }}
                    >
                        <option value="default">Default Device</option>
                        {devices.input.map((d, i) => (
                            <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <Forms.FormTitle tag="h5" style={{ marginBottom: 6 }}>Output Device (Speaker)</Forms.FormTitle>
                    <select
                        value={state.selectedOutputDevice}
                        onChange={e => update("selectedOutputDevice", e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 4, border: "1px solid var(--input-border)", background: "var(--input-background)", color: "var(--text-normal)" }}
                    >
                        <option value="default">Default Device</option>
                        {devices.output.map((d, i) => (
                            <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Speaker ${i + 1}`}</option>
                        ))}
                    </select>
                </div>
            </section>

            <style>{`
                .vc-voice-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 12px;
                    padding: 10px 0;
                    border-bottom: 1px solid var(--background-modifier-accent);
                }
                .vc-voice-row:last-child { border-bottom: none; }
            `}</style>
        </SettingsTab>
    );
}

export default wrapTab(VoiceTab, "Voice");
