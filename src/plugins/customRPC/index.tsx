/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import { Divider } from "@components/Divider";
import { ErrorCard } from "@components/ErrorCard";
import { Flex } from "@components/Flex";
import { Link } from "@components/Link";
import { Devs } from "@utils/constants";
import { isTruthy } from "@utils/guards";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { useAwaiter } from "@utils/react";
import definePlugin, { OptionType } from "@utils/types";
import { Activity } from "@vencord/discord-types";
import { ActivityType } from "@vencord/discord-types/enums";
import { findByCodeLazy, findComponentByCodeLazy } from "@webpack";
import { ApplicationAssetUtils, Button, FluxDispatcher, Forms, React, Select, UserStore } from "@webpack/common";

import { RPCSettings } from "./RpcSettings";

const useProfileThemeStyle = findByCodeLazy("profileThemeStyle:", "--profile-gradient-primary-color");
const ActivityView = findComponentByCodeLazy(".party?(0", "USER_PROFILE_ACTIVITY");

const ShowCurrentGame = getUserSettingLazy<boolean>("status", "showCurrentGame")!;

async function getApplicationAsset(key: string): Promise<string> {
    return (await ApplicationAssetUtils.fetchAssetIds(settings.store.appID!, [key]))[0];
}

export const enum TimestampMode {
    NONE,
    NOW,
    TIME,
    CUSTOM,
}

export const settings = definePluginSettings({
    config: {
        type: OptionType.COMPONENT,
        component: RPCSettings
    },
}).withPrivateSettings<{
    appID?: string;
    appName?: string;
    details?: string;
    detailsURL?: string;
    state?: string;
    stateURL?: string;
    type?: ActivityType;
    streamLink?: string;
    timestampMode?: TimestampMode;
    startTime?: number;
    endTime?: number;
    imageBig?: string;
    imageBigURL?: string;
    imageBigTooltip?: string;
    imageSmall?: string;
    imageSmallURL?: string;
    imageSmallTooltip?: string;
    buttonOneText?: string;
    buttonOneURL?: string;
    buttonTwoText?: string;
    buttonTwoURL?: string;
    partySize?: number;
    partyMaxSize?: number;
    multiRpcEnabled?: boolean;
    multiRpcProfiles?: string;
    multiRpcIntervalSec?: number;
    multiRpcMode?: "cycle" | "single";
    multiRpcSingleIndex?: number;
}>();

type MultiRpcMode = "cycle" | "single";

type RpcProfile = Partial<{
    appID: string;
    appName: string;
    details: string;
    detailsURL: string;
    state: string;
    stateURL: string;
    type: ActivityType;
    streamLink: string;
    timestampMode: TimestampMode;
    startTime: number;
    endTime: number;
    imageBig: string;
    imageBigURL: string;
    imageBigTooltip: string;
    imageSmall: string;
    imageSmallURL: string;
    imageSmallTooltip: string;
    buttonOneText: string;
    buttonOneURL: string;
    buttonTwoText: string;
    buttonTwoURL: string;
    partySize: number;
    partyMaxSize: number;
    rotate: boolean;
}>;

let multiRpcTimer: ReturnType<typeof setInterval> | null = null;
let profileCursor = 0;

export function applyRpcSettingsUpdate() {
    void setRpc(true);
    if (Vencord.Plugins.isPluginEnabled("CustomRPC")) void setRpc();
    refreshMultiRpcScheduler();
}

function parseProfiles(): RpcProfile[] {
    try {
        const parsed = JSON.parse(settings.store.multiRpcProfiles || "[]");
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(Boolean);
    } catch {
        return [];
    }
}

function getRotationProfiles() {
    return parseProfiles().filter(profile => profile.rotate !== false);
}

function resolveProfileSource(): RpcProfile | undefined {
    if (!settings.store.multiRpcEnabled) return;

    const profiles = parseProfiles();
    if (!profiles.length) return;

    const mode = (settings.store.multiRpcMode ?? "cycle") as MultiRpcMode;
    if (mode === "single") {
        const rawIndex = Number(settings.store.multiRpcSingleIndex ?? 0);
        const index = Number.isFinite(rawIndex) ? Math.max(0, Math.min(profiles.length - 1, rawIndex)) : 0;
        return profiles[index];
    }

    const rotationProfiles = profiles.filter(profile => profile.rotate !== false);
    if (!rotationProfiles.length) return;

    const current = rotationProfiles[profileCursor % rotationProfiles.length];
    profileCursor = (profileCursor + 1) % rotationProfiles.length;
    return current;
}

async function createActivity(profile?: RpcProfile): Promise<Activity | undefined> {
    const source = profile ? { ...settings.store, ...profile } : settings.store;

    const {
        appID,
        appName,
        details,
        detailsURL,
        state,
        stateURL,
        type,
        streamLink,
        startTime,
        endTime,
        imageBig,
        imageBigURL,
        imageBigTooltip,
        imageSmall,
        imageSmallURL,
        imageSmallTooltip,
        buttonOneText,
        buttonOneURL,
        buttonTwoText,
        buttonTwoURL,
        partyMaxSize,
        partySize,
        timestampMode
    } = source;

    if (!appName) return;

    const activity: Activity = {
        application_id: appID || "0",
        name: appName,
        state,
        details,
        type: type ?? ActivityType.PLAYING,
        flags: 1 << 0,
    };

    if (type === ActivityType.STREAMING) activity.url = streamLink;

    switch (timestampMode) {
        case TimestampMode.NOW:
            activity.timestamps = {
                start: Date.now()
            };
            break;
        case TimestampMode.TIME:
            activity.timestamps = {
                start: Date.now() - (new Date().getHours() * 3600 + new Date().getMinutes() * 60 + new Date().getSeconds()) * 1000
            };
            break;
        case TimestampMode.CUSTOM:
            if (startTime || endTime) {
                activity.timestamps = {};
                if (startTime) activity.timestamps.start = startTime;
                if (endTime) activity.timestamps.end = endTime;
            }
            break;
        case TimestampMode.NONE:
        default:
            break;
    }

    if (detailsURL) {
        activity.details_url = detailsURL;
    }

    if (stateURL) {
        activity.state_url = stateURL;
    }

    if (buttonOneText) {
        activity.buttons = [
            buttonOneText,
            buttonTwoText
        ].filter(isTruthy);

        activity.metadata = {
            button_urls: [
                buttonOneURL,
                buttonTwoURL
            ].filter(isTruthy)
        };
    }

    if (imageBig) {
        activity.assets = {
            large_image: await getApplicationAsset(imageBig),
            large_text: imageBigTooltip || undefined,
            large_url: imageBigURL || undefined
        };
    }

    if (imageSmall) {
        activity.assets = {
            ...activity.assets,
            small_image: await getApplicationAsset(imageSmall),
            small_text: imageSmallTooltip || undefined,
            small_url: imageSmallURL || undefined
        };
    }

    if (partyMaxSize && partySize) {
        activity.party = {
            size: [partySize, partyMaxSize]
        };
    }

    for (const k in activity) {
        if (k === "type") continue;
        const v = activity[k];
        if (!v || v.length === 0)
            delete activity[k];
    }

    return activity;
}

export async function setRpc(disable?: boolean) {
    const profile = resolveProfileSource();
    const activity: Activity | undefined = await createActivity(profile);

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: !disable ? activity : null,
        socketId: "CustomRPC",
    });
}

export function refreshMultiRpcScheduler() {
    if (multiRpcTimer) {
        clearInterval(multiRpcTimer);
        multiRpcTimer = null;
    }

    if (!settings.store.multiRpcEnabled) return;

    const mode = (settings.store.multiRpcMode ?? "cycle") as MultiRpcMode;
    if (mode === "single") return;

    const profiles = getRotationProfiles();
    if (profiles.length < 2) return;

    const intervalSec = Math.max(5, Number(settings.store.multiRpcIntervalSec) || 30);
    multiRpcTimer = setInterval(() => void setRpc(), intervalSec * 1000);
}

export default definePlugin({
    name: "CustomRPC",
    description: "ReCord Rich Presence studio with live RPC editing, activity type control, and selective profile rotation",
    authors: [Devs.Rloxx, Devs.captain, Devs.AutumnVN, Devs.nin0dev],
    dependencies: ["UserSettingsAPI"],
    // This plugin's patch is not important for functionality, so don't require a restart
    requiresRestart: false,
    settings,

    start() {
        profileCursor = 0;
        applyRpcSettingsUpdate();
    },
    stop() {
        if (multiRpcTimer) {
            clearInterval(multiRpcTimer);
            multiRpcTimer = null;
        }
        void setRpc(true);
    },

    // Discord hides buttons on your own Rich Presence for some reason. This patch disables that behaviour
    patches: [
        {
            find: ".USER_PROFILE_ACTIVITY_BUTTONS),",
            replacement: {
                match: /.getId\(\)===\i.id/,
                replace: "$& && false"
            }
        }
    ],

    settingsAboutComponent: () => {
        const [activity] = useAwaiter(() => createActivity(), { fallbackValue: undefined, deps: Object.values(settings.store) });
        const gameActivityEnabled = ShowCurrentGame.useSetting();
        const { profileThemeStyle } = useProfileThemeStyle({});
        const liveActivityType = (settings.store.type ?? ActivityType.PLAYING) as ActivityType;

        return (
            <>
                {!gameActivityEnabled && (
                    <ErrorCard
                        className={classes(Margins.top16, Margins.bottom16)}
                        style={{ padding: "1em" }}
                    >
                        <Forms.FormTitle>Notice</Forms.FormTitle>
                        <Forms.FormText>Activity Sharing isn't enabled, people won't be able to see your custom rich presence!</Forms.FormText>

                        <Button
                            color={Button.Colors.TRANSPARENT}
                            className={Margins.top8}
                            onClick={() => ShowCurrentGame.updateSetting(true)}
                        >
                            Enable
                        </Button>
                    </ErrorCard>
                )}

                <Flex flexDirection="column" gap=".5em" className={Margins.top16}>
                    <Forms.FormTitle tag="h5">ReCord Rich Presence Studio</Forms.FormTitle>
                    <Forms.FormText>
                        Go to the <Link href="https://discord.com/developers/applications">Discord Developer Portal</Link> to create an application and
                        get the application ID.
                    </Forms.FormText>
                    <Forms.FormText>
                        Save multiple RPC cards, choose their activity type individually, and decide which ones are allowed to join automatic rotation.
                    </Forms.FormText>
                    <Forms.FormText>
                        Upload images in the Rich Presence tab to get the image keys.
                    </Forms.FormText>
                    <Forms.FormText>
                        If you want to use an image link, download your image and reupload the image to <Link href="https://imgur.com">Imgur</Link> and get the image link by right-clicking the image and selecting "Copy image address".
                    </Forms.FormText>
                    <Forms.FormText>
                        You can't see your own buttons on your profile, but everyone else can see it fine.
                    </Forms.FormText>
                    <Forms.FormText>
                        Some weird unicode text ("fonts" 𝖑𝖎𝖐𝖊 𝖙𝖍𝖎𝖘) may cause the rich presence to not show up, try using normal letters instead.
                    </Forms.FormText>

                    <Forms.FormTitle tag="h5" className={Margins.top8}>Quick Controls</Forms.FormTitle>
                    <Forms.FormText>
                        Set the live activity type here and toggle profile rotation without opening the full editor.
                    </Forms.FormText>

                    <Flex flexDirection="column" gap="0.5em">
                        <Select
                            placeholder={"Activity Type"}
                            options={[
                                { label: "Playing", value: ActivityType.PLAYING, default: true },
                                { label: "Streaming", value: ActivityType.STREAMING },
                                { label: "Listening", value: ActivityType.LISTENING },
                                { label: "Watching", value: ActivityType.WATCHING },
                                { label: "Competing", value: ActivityType.COMPETING }
                            ]}
                            maxVisibleItems={5}
                            closeOnSelect={true}
                            select={value => {
                                settings.store.type = value;
                                applyRpcSettingsUpdate();
                            }}
                            isSelected={value => value === liveActivityType}
                            serialize={value => String(value)}
                        />

                        <Button
                            color={settings.store.multiRpcEnabled ? Button.Colors.BRAND : Button.Colors.PRIMARY}
                            onClick={() => {
                                settings.store.multiRpcEnabled = !settings.store.multiRpcEnabled;
                                applyRpcSettingsUpdate();
                            }}
                        >
                            {settings.store.multiRpcEnabled ? "Disable Rotation" : "Enable Rotation"}
                        </Button>
                    </Flex>
                </Flex>

                <Divider className={Margins.top8} />

                <div style={{ width: "284px", ...profileThemeStyle, marginTop: 8, borderRadius: 8, background: "var(--background-mod-muted)" }}>
                    {activity && <ActivityView
                        activity={activity}
                        user={UserStore.getCurrentUser()}
                        currentUser={UserStore.getCurrentUser()}
                    />}
                </div>
            </>
        );
    }
});
