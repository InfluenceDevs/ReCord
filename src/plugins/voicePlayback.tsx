/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Button, Toasts, React } from "@webpack/common";

interface VoicePlaybackConfig {
    enabled: boolean;
    volume: number;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
}

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let echoCancellationFilter: BiquadFilterNode | null = null;
let noiseSuppressionGain: GainNode | null = null;
let autoGainNode: DynamicsCompressor | null = null;
let volumeControl: GainNode | null = null;
let isPlaybackActive = false;

const config: VoicePlaybackConfig = {
    enabled: false,
    volume: 0.5,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
};

async function initializeAudioContext(cfg: VoicePlaybackConfig = config) {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        if (audioContext.state === "suspended") {
            await audioContext.resume();
        }

        // Request microphone access
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: cfg.echoCancellation,
                noiseSuppression: cfg.noiseSuppression,
                autoGainControl: cfg.autoGainControl
            }
        });

        // Create audio nodes
        if (!sourceNode) {
            sourceNode = audioContext.createMediaStreamSource(mediaStream);
        }

        // Create processing chain
        volumeControl = audioContext.createGain();
        volumeControl.gain.value = cfg.volume;

        echoCancellationFilter = audioContext.createBiquadFilter();
        echoCancellationFilter.type = "lowpass";
        echoCancellationFilter.frequency.value = 8000;

        noiseSuppressionGain = audioContext.createGain();
        noiseSuppressionGain.gain.value = cfg.noiseSuppression ? 1 : 1;

        autoGainNode = audioContext.createDynamicsCompressor();
        autoGainNode.threshold.value = -50;
        autoGainNode.knee.value = 40;
        autoGainNode.ratio.value = 12;
        autoGainNode.attack.value = 0.003;
        autoGainNode.release.value = 0.25;

        const destination = audioContext.destination;

        // Connect processing chain
        sourceNode.connect(noiseSuppressionGain);
        noiseSuppressionGain.connect(cfg.echoCancellation ? echoCancellationFilter! : autoGainNode!);
        if (cfg.echoCancellation) {
            echoCancellationFilter!.connect(autoGainNode!);
        }
        autoGainNode!.connect(volumeControl);
        volumeControl.connect(destination);

        isPlaybackActive = true;
        return true;
    } catch (error) {
        console.error("[VoicePlayback] Failed to initialize audio context:", error);
        Toasts.show({
            message: "Failed to access microphone. Check permissions and try again.",
            type: Toasts.Type.FAILURE,
            id: "voice-playback-error"
        });
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

        // Don't close audio context - keep it alive for quick re-enabling
        if (audioContext && audioContext.state !== "closed") {
            // Just stop the playback by disconnecting, don't close
        }

        echoCancellationFilter = null;
        noiseSuppressionGain = null;
        autoGainNode = null;
        volumeControl = null;
        isPlaybackActive = false;
    } catch (error) {
        console.error("[VoicePlayback] Failed to stop audio playback:", error);
    }
}

async function togglePlayback() {
    if (isPlaybackActive) {
        await stopAudioPlayback();
        Toasts.show({
            message: "Microphone playback disabled",
            type: Toasts.Type.INFO,
            id: "voice-playback-toggle"
        });
    } else {
        const success = await initializeAudioContext();
        if (success) {
            Toasts.show({
                message: "Microphone playback enabled - you can hear your voice",
                type: Toasts.Type.SUCCESS,
                id: "voice-playback-toggle"
            });
        }
    }
}

// Update volume in real-time
function updateVolume(newVolume: number) {
    config.volume = newVolume;
    if (volumeControl) {
        volumeControl.gain.value = newVolume;
    }
}

// Float button component
function VoicePlaybackButton() {
    const [isActive, setIsActive] = React.useState(isPlaybackActive);

    React.useEffect(() => {
        const checkInterval = setInterval(() => {
            setIsActive(isPlaybackActive);
        }, 500);

        return () => clearInterval(checkInterval);
    }, []);

    return (
        <Button
            size={Button.Sizes.SMALL}
            color={isActive ? Button.Colors.RED : Button.Colors.PRIMARY}
            onClick={async () => {
                await togglePlayback();
                setIsActive(isPlaybackActive);
            }}
            style={{
                position: "fixed",
                bottom: 20,
                right: 20,
                zIndex: 10000,
                padding: "8px 12px",
                borderRadius: "50px",
                fontSize: "12px",
                fontWeight: "600"
            }}
        >
            {isActive ? "🎙️ Mic On" : "🎙️ Mic Off"}
        </Button>
    );
}

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable voice playback system",
        default: true
    },
    showFloatingButton: {
        type: OptionType.BOOLEAN,
        description: "Show floating toggle button for quick access",
        default: true
    },
    defaultVolume: {
        type: OptionType.SLIDER,
        description: "Default playback volume",
        markers: [0, 0.25, 0.5, 0.75, 1],
        default: 0.5,
        onChange: (value: number) => {
            config.volume = value;
            updateVolume(value);
        }
    },
    echoCancellation: {
        type: OptionType.BOOLEAN,
        description: "Enable echo cancellation",
        default: true
    },
    noiseSuppression: {
        type: OptionType.BOOLEAN,
        description: "Enable noise suppression",
        default: true
    },
    autoGainControl: {
        type: OptionType.BOOLEAN,
        description: "Enable automatic gain control",
        default: true
    }
});

export default definePlugin({
    name: "Voice Playback",
    description: "Persistent microphone playback with audio processing (works in VC)",
    authors: [Devs.Rloxx],

    settings,

    start() {
        config.volume = settings.store.defaultVolume;
        config.echoCancellation = settings.store.echoCancellation;
        config.noiseSuppression = settings.store.noiseSuppression;
        config.autoGainControl = settings.store.autoGainControl;
    },

    stop() {
        stopAudioPlayback();
    },

    patches: [
        {
            find: "getLayerContainer",
            replacement: {
                match: /function \i\(\)\{let \i=\(0,\i\.useContext\).+?return ?\(/,
                replace: m => `${m.slice(0, -1)}$self.renderFloatingButton() || (`
            }
        }
    ],

    renderFloatingButton() {
        if (!settings.store.showFloatingButton) return null;

        return (
            <ErrorBoundary>
                <VoicePlaybackButton />
            </ErrorBoundary>
        );
    },

    // Expose methods for settings tab
    togglePlayback,
    updateVolume,
    isActive: () => isPlaybackActive,
    getConfig: () => config
});
