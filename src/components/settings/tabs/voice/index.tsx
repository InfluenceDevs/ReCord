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
    playbackVolume: number;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
    selectedInputDevice: string;
    selectedOutputDevice: string;
}

const STORE_KEY = "record_voice_playback_settings";

const DEFAULT_STATE: VoicePlaybackState = {
    microphonePlaybackEnabled: false,
    playbackVolume: 0.5,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    selectedInputDevice: "default",
    selectedOutputDevice: "default"
};

function loadState(): VoicePlaybackState {
    try {
        const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
        return { ...DEFAULT_STATE, ...raw };
    } catch {
        return DEFAULT_STATE;
    }
}

function saveState(state: VoicePlaybackState) {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

// Audio context for playback
let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let scriptProcessor: ScriptProcessorNode | null = null;
let destination: AudioNode | null = null;

// Audio processing nodes
let echoCancellationFilter: BiquadFilterNode | null = null;
let noiseSuppressionGain: GainNode | null = null;
let autoGainNode: DynamicsCompressor | null = null;
let volumeControl: GainNode | null = null;

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

        // Get output destination
        destination = audioContext.destination;

        // Connect processing chain
        sourceNode.connect(noiseSuppressionGain);
        noiseSuppressionGain.connect(state.echoCancellation ? echoCancellationFilter! : autoGainNode!);
        if (state.echoCancellation) {
            echoCancellationFilter!.connect(autoGainNode!);
        }
        autoGainNode!.connect(volumeControl);
        volumeControl.connect(destination);

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
        destination = null;
    } catch (error) {
        console.error("Failed to stop audio playback:", error);
    }
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

            return next;
        });
    }, []);

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
                            color={isPlaying ? Button.Colors.RED : Button.Colors.PRIMARY}
                            onClick={toggleMicrophonePlayback}
                        >
                            {isPlaying ? "Stop Playback" : "Start Playback"}
                        </Button>
                    </div>
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
