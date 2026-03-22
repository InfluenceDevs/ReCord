/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

const Influence = { name: "Influence", id: 0n };
const YOUR_MAX_BOOST = 5; // 5x = 500% max for YOUR OWN volume

export default definePlugin({
    name: "RecordStereoDbUncap",
    description: "Enables stereo panning in voice (lets you be heard in stereo). Uncaps YOUR OWN loudness output so Discord doesn't cap your dB.",
    authors: [Influence],
    tags: ["audio", "stereo", "db", "voice"],
    enabledByDefault: true,

    patches: [
        // Force stereo in WebRTC SDP (Session Description Protocol) for voice
        {
            find: "x-google-max-bitrate",
            replacement: [
                {
                    match: /`x-google-max-bitrate=\$\{\i\}`/,
                    replace: '"x-google-max-bitrate=80_000"'
                },
                {
                    match: ";level-asymmetry-allowed=1",
                    replace: ";b=AS:800000;level-asymmetry-allowed=1"
                },
                {
                    match: /;usedtx=\$\{(\i)\?"0":"1"\}/,
                    replace: '$&${$1?";stereo=1;sprop-stereo=1":""}'
                },
            ]
        },
        // Uncap YOUR OWN local volume slider (so Discord doesn't cap your dB output)
        {
            find: "#{intl::USER_VOLUME}",
            replacement: {
                match: /(?<=maxValue:)\i\.isPlatformEmbedded\?(\i\.\i):\i\.\i(?=,)/,
                replace: (_, maxValue) => `${maxValue}*${YOUR_MAX_BOOST}`
            }
        },
        // Uncap YOUR OWN stream volume (camera/game audio)
        {
            find: "currentVolume:",
            replacement: {
                match: /(?<=maxValue:)\i\.\i\?(\d+?):\d+?(?=,)/,
                replace: (_, maxValue) => `${maxValue}*${YOUR_MAX_BOOST}`
            }
        },
        // Prevent Discord from clamping YOUR volume values back to 100% on sync
        {
            find: "AudioContextSettingsMigrated",
            replacement: [
                {
                    match: /(?<=isLocalMute\(\i,\i\),volume:(\i).+?\i\(\i,\i,)\1(?=\))/,
                    replace: "$&>500?500:$&"
                },
                {
                    match: /(?<=Object\.entries\(\i\.localMutes\).+?volume:).+?(?=,)/,
                    replace: "$&>500?500:$&"
                },
                {
                    match: /(?<=Object\.entries\(\i\.localVolumes\).+?volume:).+?(?=})/,
                    replace: "$&>500?500:$&"
                }
            ]
        },
        // Prevent the MediaEngineStore from overwriting YOUR boosted volumes
        {
            find: '="MediaEngineStore",',
            replacement: {
                match: /(?<=localVolumes\.set\(\i,)({\w+:\i})/,
                replace: "Object.assign($1,{volume:Math.max($1.volume,256)})"
            }
        }
    ]
});
