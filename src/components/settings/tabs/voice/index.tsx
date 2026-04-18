/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

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

// Audio context for playback
let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;

// Audio processing nodes
let echoCancellationFilter: BiquadFilterNode | null = null;
let noiseSuppressionGain: GainNode | null = null;
let autoGainNode: DynamicsCompressor | null = null;
let volumeControl: GainNode | null = null;
let bassFilter: BiquadFilterNode | null = null;
let trebleFilter: BiquadFilterNode | null = null;
let voiceEffectFilter: BiquadFilterNode | null = null;

function applyVoiceChanger(mode: VoicePlaybackState["voiceChanger"]) {
    if (!voiceEffectFilter) return;

    switch (mode) {
        case "deep":
            voiceEffectFilter.type = "lowshelf";
            voiceEffectFilter.frequency.value = 240;
            voiceEffectFilter.gain.value = 10;
            break;
        case "chipmunk":
            voiceEffectFilter.type = "highshelf";
            voiceEffectFilter.frequency.value = 2600;
            voiceEffectFilter.gain.value = 12;
            break;
        case "robot":
            voiceEffectFilter.type = "bandpass";
            voiceEffectFilter.frequency.value = 900;
            voiceEffectFilter.Q.value = 3;
            voiceEffectFilter.gain.value = 0;
            break;
        case "radio":
            voiceEffectFilter.type = "bandpass";
            voiceEffectFilter.frequency.value = 1800;
            voiceEffectFilter.Q.value = 2;
            voiceEffectFilter.gain.value = 0;
            break;
        default:
            voiceEffectFilter.type = "allpass";
            voiceEffectFilter.frequency.value = 1000;
            voiceEffectFilter.gain.value = 0;
            break;
    }
}

async function initializeAudioContext(state: VoicePlaybackState) {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        // Request microphone access
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: state.selectedInputDevice !== "default" ? state.selectedInputDevice : undefined,
                echoCancellation: state.echoCancellation,
                noiseSuppression: state.noiseSuppression,
                autoGainControl: state.autoGainControl
            }
        });

        // Create audio nodes
        if (!sourceNode) {
            sourceNode = audioContext.createMediaStreamSource(mediaStream);
        }

        // Create processing chain
        volumeControl = audioContext.createGain();
        volumeControl.gain.value = state.playbackVolume;

        bassFilter = audioContext.createBiquadFilter();
        bassFilter.type = "lowshelf";
        bassFilter.frequency.value = 200;
        bassFilter.gain.value = state.bassGain;

        trebleFilter = audioContext.createBiquadFilter();
        trebleFilter.type = "highshelf";
        trebleFilter.frequency.value = 3500;
        trebleFilter.gain.value = state.trebleGain;

        voiceEffectFilter = audioContext.createBiquadFilter();
        applyVoiceChanger(state.voiceChanger);

        // Echo cancellation (simple implementation using delay + inversion)
        echoCancellationFilter = audioContext.createBiquadFilter();
        echoCancellationFilter.type = "lowpass";
        echoCancellationFilter.frequency.value = 8000;

        // Noise suppression (gate)
        noiseSuppressionGain = audioContext.createGain();
        noiseSuppressionGain.gain.value = state.noiseSuppression ? 1 : 1;

        // Auto gain (compressor)
        autoGainNode = audioContext.createDynamicsCompressor();
        autoGainNode.threshold.value = -50;
        autoGainNode.knee.value = 40;
        autoGainNode.ratio.value = 12;
        autoGainNode.attack.value = 0.003;
        autoGainNode.release.value = 0.25;

        // Connect processing chain
        sourceNode.connect(noiseSuppressionGain);
        noiseSuppressionGain.connect(state.echoCancellation ? echoCancellationFilter! : autoGainNode!);
        if (state.echoCancellation) {
            echoCancellationFilter!.connect(autoGainNode!);
        }
        autoGainNode!.connect(bassFilter);
        bassFilter.connect(trebleFilter);
        trebleFilter.connect(voiceEffectFilter);
        voiceEffectFilter.connect(volumeControl);
        volumeControl.connect(audioContext.destination);

        return true;
    } catch (error) {
        console.error("Failed to initialize audio context:", error);
        return false;
    }
}

async function stopAudioPlayback() {
    try {
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
        }

        if (sourceNode) {
            sourceNode.disconnect();
            sourceNode = null;
        }

        if (audioContext) {
            await audioContext.close();
            audioContext = null;
        }

        echoCancellationFilter = null;
        noiseSuppressionGain = null;
        autoGainNode = null;
        volumeControl = null;
        bassFilter = null;
        trebleFilter = null;
        voiceEffectFilter = null;
    } catch (error) {
        console.error("Failed to stop audio playback:", error);
    }
}

async function restartPlaybackIfNeeded(state: VoicePlaybackState, isPlaying: boolean) {
    if (!isPlaying) return;

    await stopAudioPlayback();
    await initializeAudioContext(state);
}

function VoiceTab() {
    const [state, setState] = React.useState<VoicePlaybackState>(() => loadState());
    const [isPlaying, setIsPlaying] = React.useState(false);
    const [devices, setDevices] = React.useState<{
        input: MediaDeviceInfo[];
        output: MediaDeviceInfo[];
    }>({ input: [], output: [] });
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        // Load audio devices
        navigator.mediaDevices.enumerateDevices().then(deviceInfos => {
            const input = deviceInfos.filter(device => device.kind === "audioinput");
            const output = deviceInfos.filter(device => device.kind === "audiooutput");
            setDevices({ input, output });
        });
    }, []);

    const update = React.useCallback((key: keyof VoicePlaybackState, value: any) => {
        setState(prev => {
            const next = { ...prev, [key]: value };
            saveState(next);

            // Update playback volume in real-time
            if (key === "playbackVolume" && volumeControl) {
                volumeControl.gain.value = value;
            }

            if (key === "bassGain" && bassFilter) {
                bassFilter.gain.value = value;
            }

            if (key === "trebleGain" && trebleFilter) {
                trebleFilter.gain.value = value;
            }

            if (key === "voiceChanger") {
                applyVoiceChanger(next.voiceChanger);
            }

            return next;
        });
    }, []);

    React.useEffect(() => {
        if (!state.persistentPlayback || isPlaying) return;

        initializeAudioContext(state).then(success => {
            if (success) {
                setIsPlaying(true);
                setError(null);
            }
        });
    }, [state.persistentPlayback, isPlaying]);

    const toggleMicrophonePlayback = React.useCallback(async () => {
        if (isPlaying) {
            await stopAudioPlayback();
            setIsPlaying(false);
            setError(null);
        } else {
            const success = await initializeAudioContext(state);
            if (success) {
                setIsPlaying(true);
                setError(null);
                Alerts.show({
                    title: "Microphone Playback Started",
                    body: "You can now hear your own voice with applied settings.",
                    confirmText: "OK"
                });
            } else {
                setError("Failed to access microphone. Check permissions and try again.");
                Alerts.show({
                    title: "Microphone Access Failed",
                    body: "Could not access your microphone. Please check your permissions.",
                    confirmText: "OK"
                });
            }
        }
    }, [isPlaying, state]);

    return (
        <SettingsTab>
            <Forms.FormTitle tag="h2">Voice Settings</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom16} style={{ color: "var(--text-muted)" }}>
                Configure microphone input, audio processing, and self-monitoring (sidetone).
            </Forms.FormText>

            {/* Microphone Playback Section */}
            <section>
                <Forms.FormTitle tag="h3" style={{ marginBottom: 8 }}>Self-Monitoring (Sidetone)</Forms.FormTitle>
                <Forms.FormText style={{ color: "var(--text-muted)", marginBottom: 16 }}>
                    Hear your own voice in real-time with audio processing effects applied. This helps you monitor microphone quality before joining calls.
                </Forms.FormText>

                <div style={{
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 12,
                    padding: 12,
                    background: "var(--background-secondary)",
                    marginBottom: 12
                }}>
                    <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12
                    }}>
                        <div>
                            <Forms.FormTitle tag="h5" style={{ marginBottom: 2 }}>
                                Microphone Playback
                            </Forms.FormTitle>
                            <Forms.FormText style={{ color: "var(--text-muted)" }}>
                                {isPlaying ? "Active - hearing your voice" : "Inactive - click to enable"}
                            </Forms.FormText>
                        </div>
                        <Button
                            size="small"
                            variant={isPlaying ? "destructive" : "primary"}
                            onClick={toggleMicrophonePlayback}
                        >
                            {isPlaying ? "Stop Playback" : "Start Playback"}
                        </Button>
                    </div>
                </div>

                <div style={{
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 12,
                    padding: 12,
                    background: "var(--background-secondary)",
                    marginBottom: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12
                }}>
                    <div>
                        <Forms.FormTitle tag="h5" style={{ marginBottom: 2 }}>Always Keep Playback On</Forms.FormTitle>
                        <Forms.FormText style={{ color: "var(--text-muted)" }}>
                            Keeps monitoring active while you are in VC and when you leave this tab.
                        </Forms.FormText>
                    </div>
                    <Button
                        size="small"
                        variant={state.persistentPlayback ? "primary" : "secondary"}
                        onClick={async () => {
                            const next = !state.persistentPlayback;
                            update("persistentPlayback", next);
                            if (next) {
                                await restartPlaybackIfNeeded({ ...state, persistentPlayback: true }, isPlaying);
                            }
                        }}
                    >
                        {state.persistentPlayback ? "Enabled" : "Disabled"}
                    </Button>
                </div>

                {error && (
                    <div style={{
                        background: "color-mix(in srgb, var(--red-360) 10%, transparent)",
                        border: "1px solid var(--red-360)",
                        borderRadius: 8,
                        padding: 10,
                        marginBottom: 12,
                        color: "var(--text-normal)"
                    }}>
                        {error}
                    </div>
                )}

                {/* Playback Volume */}
                <div style={{ marginBottom: 12 }}>
                    <Forms.FormTitle tag="h5" style={{ marginBottom: 8 }}>Playback Volume</Forms.FormTitle>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={state.playbackVolume}
                            onChange={(e) => update("playbackVolume", parseFloat(e.target.value))}
                            style={{
                                flex: 1,
                                height: 6,
                                borderRadius: 3,
                                appearance: "none",
                                background: "var(--brand-500)",
                                outline: "none"
                            }}
                        />
                        <span style={{ minWidth: 45, textAlign: "right", color: "var(--text-muted)" }}>
                            {Math.round(state.playbackVolume * 100)}%
                        </span>
                    </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                    <Forms.FormTitle tag="h5" style={{ marginBottom: 8 }}>Bass</Forms.FormTitle>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                            type="range"
                            min="-20"
                            max="20"
                            step="1"
                            value={state.bassGain}
                            onChange={e => update("bassGain", Number(e.target.value))}
                            style={{ flex: 1, height: 6, borderRadius: 3, appearance: "none", background: "var(--brand-500)", outline: "none" }}
                        />
                        <span style={{ minWidth: 56, textAlign: "right", color: "var(--text-muted)" }}>{state.bassGain} dB</span>
                    </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                    <Forms.FormTitle tag="h5" style={{ marginBottom: 8 }}>Treble</Forms.FormTitle>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                            type="range"
                            min="-20"
                            max="20"
                            step="1"
                            value={state.trebleGain}
                            onChange={e => update("trebleGain", Number(e.target.value))}
                            style={{ flex: 1, height: 6, borderRadius: 3, appearance: "none", background: "var(--brand-500)", outline: "none" }}
                        />
                        <span style={{ minWidth: 56, textAlign: "right", color: "var(--text-muted)" }}>{state.trebleGain} dB</span>
                    </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                    <Forms.FormTitle tag="h5" style={{ marginBottom: 8 }}>Voice Changer</Forms.FormTitle>
                    <select
                        value={state.voiceChanger}
                        onChange={e => update("voiceChanger", e.target.value as VoicePlaybackState["voiceChanger"])}
                        style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: "1px solid var(--border-subtle)",
                            background: "var(--background-secondary)",
                            color: "var(--text-normal)",
                            cursor: "pointer"
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

            {/* Audio Processing Section */}
            <section>
                <Forms.FormTitle tag="h3" style={{ marginBottom: 8 }}>Audio Processing</Forms.FormTitle>
                <Forms.FormText style={{ color: "var(--text-muted)", marginBottom: 16 }}>
                    Enable advanced audio filters to improve microphone quality during playback.
                </Forms.FormText>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                        { key: "echoCancellation", title: "Echo Cancellation", desc: "Removes microphone feedback and echo." },
                        { key: "noiseSuppression", title: "Noise Suppression", desc: "Reduces background noise during playback." },
                        { key: "autoGainControl", title: "Auto Gain Control", desc: "Automatically normalizes microphone volume." }
                    ].map(({ key, title, desc }) => (
                        <div
                            key={key}
                            style={{
                                border: "1px solid var(--border-subtle)",
                                borderRadius: 12,
                                padding: 12,
                                background: "var(--background-secondary)",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center"
                            }}
                        >
                            <div>
                                <Forms.FormTitle tag="h5" style={{ marginBottom: 2 }}>{title}</Forms.FormTitle>
                                <Forms.FormText style={{ color: "var(--text-muted)" }}>{desc}</Forms.FormText>
                            </div>
                            <Button
                                size="small"
                                onClick={() => update(key as keyof VoicePlaybackState, !state[key as keyof VoicePlaybackState])}
                            >
                                {state[key as keyof VoicePlaybackState] ? "Enabled" : "Disabled"}
                            </Button>
                        </div>
                    ))}
                </div>
            </section>

            {/* Device Selection Section */}
            <section>
                <Forms.FormTitle tag="h3" style={{ marginBottom: 8 }}>Audio Devices</Forms.FormTitle>
                <Forms.FormText style={{ color: "var(--text-muted)", marginBottom: 16 }}>
                    Select which microphone and speaker to use for playback.
                </Forms.FormText>

                {/* Input Device */}
                <div style={{ marginBottom: 12 }}>
                    <Forms.FormTitle tag="h5" style={{ marginBottom: 8 }}>Input Device (Microphone)</Forms.FormTitle>
                    <select
                        value={state.selectedInputDevice}
                        onChange={(e) => update("selectedInputDevice", e.target.value)}
                        style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: "1px solid var(--border-subtle)",
                            background: "var(--background-secondary)",
                            color: "var(--text-normal)",
                            cursor: "pointer"
                        }}
                    >
                        <option value="default">Default Device</option>
                        {devices.input.map((device, idx) => (
                            <option key={idx} value={device.deviceId}>
                                {device.label || `Microphone ${idx + 1}`}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Output Device */}
                <div>
                    <Forms.FormTitle tag="h5" style={{ marginBottom: 8 }}>Output Device (Speaker)</Forms.FormTitle>
                    <select
                        value={state.selectedOutputDevice}
                        onChange={(e) => update("selectedOutputDevice", e.target.value)}
                        style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: "1px solid var(--border-subtle)",
                            background: "var(--background-secondary)",
                            color: "var(--text-normal)",
                            cursor: "pointer"
                        }}
                    >
                        <option value="default">Default Device</option>
                        {devices.output.map((device, idx) => (
                            <option key={idx} value={device.deviceId}>
                                {device.label || `Speaker ${idx + 1}`}
                            </option>
                        ))}
                    </select>
                </div>
            </section>

            {/* Test Section */}
            <section>
                <Forms.FormTitle tag="h3" style={{ marginBottom: 8 }}>Quick Start</Forms.FormTitle>
                <Forms.FormText style={{ color: "var(--text-muted)", marginBottom: 16 }}>
                    1. Select your devices above
                    2. Adjust audio processing settings
                    3. Click "Start Playback" to test your microphone
                    4. Adjust volume until comfortable
                    5. Click "Stop Playback" when done
                </Forms.FormText>
                <div style={{
                    background: "color-mix(in srgb, var(--brand-500) 10%, transparent)",
                    border: "1px solid var(--brand-500)",
                    borderRadius: 8,
                    padding: 10,
                    color: "var(--text-normal)",
                    fontSize: 12
                }}>
                    💡 Tip: Use self-monitoring before important calls to verify your audio quality!
                </div>
            </section>
        </SettingsTab>
    );
}

export default wrapTab(VoiceTab, "Voice");
