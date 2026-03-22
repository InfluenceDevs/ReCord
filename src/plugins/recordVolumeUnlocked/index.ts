/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { makeRange, OptionType } from "@utils/types";

const Influence = { name: "Influence", id: 0n };
const OTHER_USERS_MAX_BOOST = 10; // 10x = 1000% max for OTHER people's volumes

const settings = definePluginSettings({
    multiplier: {
        description: "Volume multiplier for other users (1.0 = 100%, 10.0 = 1000%)",
        type: OptionType.SLIDER,
        markers: makeRange(1, OTHER_USERS_MAX_BOOST, 0.5),
        default: 2,
        stickToMarkers: false,
    }
});

export default definePlugin({
    name: "RecordVolumeUnlocked",
    description: "Unlocks volume for OTHER PEOPLE in voice chats (up to 1000%). Adjustable slider per user.",
    authors: [Influence],
    tags: ["audio", "volume", "voice"],
    settings,

    patches: [
        // Change the max volume for user volume sliders to allow beyond 200%
        {
            find: "#{intl::USER_VOLUME}",
            replacement: {
                match: /(?<=maxValue:)\i\.isPlatformEmbedded\?(\i\.\i):\i\.\i(?=,)/,
                replace: (_, maxValue) => `${maxValue}*${OTHER_USERS_MAX_BOOST}`
            }
        },
        // Change the max volume for stream/screenshare sliders
        {
            find: "currentVolume:",
            replacement: {
                match: /(?<=maxValue:)\i\.\i\?(\d+?):\d+?(?=,)/,
                replace: (_, maxValue) => `${maxValue}*${OTHER_USERS_MAX_BOOST}`
            }
        },
        // Prevent Discord from clamping user volume values back to below max on sync
        {
            find: "AudioContextSettingsMigrated",
            replacement: [
                {
                    match: /(?<=isLocalMute\(\i,\i\),volume:(\i).+?\i\(\i,\i,)\1(?=\))/,
                    replace: "$&>1000?1000:$&"
                },
                {
                    match: /(?<=Object\.entries\(\i\.localMutes\).+?volume:).+?(?=,)/,
                    replace: "$&>1000?1000:$&"
                },
                {
                    match: /(?<=Object\.entries\(\i\.localVolumes\).+?volume:).+?(?=})/,
                    replace: "$&>1000?1000:$&"
                }
            ]
        },
        // Prevent the MediaEngineStore from overwriting boosted user volumes
        {
            find: '="MediaEngineStore",',
            replacement: {
                match: /(?<=localVolumes\.set\(\i,)({\w+:\i})/,
                replace: "Object.assign($1,{volume:Math.max($1.volume,512)})"
            }
        }
    ]
});
