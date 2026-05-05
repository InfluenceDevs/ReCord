/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./settings.css";

import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { Heading } from "@components/Heading";
import { resolveError } from "@components/settings/tabs/plugins/components/Common";
import { debounce } from "@shared/debounce";
import { classNameFactory } from "@utils/css";
import { ActivityType } from "@vencord/discord-types/enums";
import { React, Select, Text, TextInput } from "@webpack/common";

import { applyRpcSettingsUpdate, settings, TimestampMode } from ".";

const cl = classNameFactory("vc-customRPC-settings-");

type SettingsKey = keyof typeof settings.store;

interface TextOption<T> {
    settingsKey?: SettingsKey;
    label: string;
    disabled?: boolean;
    transform?: (value: string) => T;
    isValid?: (value: T) => true | string;
}

interface EditorOption<T> extends TextOption<T> {
    value: T | string | number | undefined;
    onValueChange: (value: T) => void;
}

interface SelectOption<T> {
    label: string;
    disabled?: boolean;
    options: { label: string; value: T; default?: boolean; }[];
}

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

const profileKeys: (keyof RpcProfile)[] = [
    "appID",
    "appName",
    "details",
    "detailsURL",
    "state",
    "stateURL",
    "type",
    "streamLink",
    "timestampMode",
    "startTime",
    "endTime",
    "imageBig",
    "imageBigURL",
    "imageBigTooltip",
    "imageSmall",
    "imageSmallURL",
    "imageSmallTooltip",
    "buttonOneText",
    "buttonOneURL",
    "buttonTwoText",
    "buttonTwoURL",
    "partySize",
    "partyMaxSize",
    "rotate"
];

const makeValidator = (maxLength: number, isRequired = false) => (value: string) => {
    if (isRequired && !value) return "This field is required.";
    if (value.length > maxLength) return `Must be not longer than ${maxLength} characters.`;
    return true;
};

const maxLength128 = makeValidator(128);

function isAppIdValid(value: string) {
    if (!/^\d{16,21}$/.test(value)) return "Must be a valid Discord ID.";
    return true;
}

const updateRPC = debounce(applyRpcSettingsUpdate);

function isStreamLinkValid(value: string) {
    if (value && !/https?:\/\/(www\.)?(twitch\.tv|youtube\.com)\/\w+/.test(value)) return "Streaming link must be a valid URL.";
    if (value && value.length > 512) return "Streaming link must be not longer than 512 characters.";
    return true;
}

function parseNumber(value: string) {
    return value ? parseInt(value, 10) : 0;
}

function isNumberValid(value: number) {
    if (isNaN(value)) return "Must be a number.";
    if (value < 0) return "Must be a positive number.";
    return true;
}

function isUrlValid(value: string) {
    if (value && !/^https?:\/\/.+/.test(value)) return "Must be a valid URL.";
    return true;
}

function isImageKeyValid(value: string) {
    if (/https?:\/\/(cdn|media)\.discordapp\.(com|net)\//.test(value)) return "Don't use a Discord link. Use an Imgur image link instead.";
    if (/https?:\/\/(?!i\.)?imgur\.com\//.test(value)) return "Imgur link must be a direct link to the image (e.g. https://i.imgur.com/...). Right click the image and click 'Copy image address'";
    if (/https?:\/\/(?!media\.)?tenor\.com\//.test(value)) return "Tenor link must be a direct link to the image (e.g. https://media.tenor.com/...). Right click the GIF and click 'Copy image address'";
    return true;
}

function parseProfiles(rawProfiles?: string): RpcProfile[] {
    try {
        const parsed = JSON.parse(rawProfiles || "[]");
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
        return [];
    }
}

function saveProfiles(profiles: RpcProfile[]) {
    settings.store.multiRpcProfiles = JSON.stringify(profiles);
    updateRPC();
}

function buildBlankProfile(): RpcProfile {
    return {
        appName: "",
        type: ActivityType.PLAYING,
        timestampMode: TimestampMode.NONE,
        rotate: true
    };
}

function getActivityTypeLabel(type?: ActivityType) {
    switch (type) {
        case ActivityType.STREAMING:
            return "STREAMING";
        case ActivityType.LISTENING:
            return "LISTENING";
        case ActivityType.WATCHING:
            return "WATCHING";
        case ActivityType.COMPETING:
            return "COMPETING";
        case ActivityType.PLAYING:
        default:
            return "PLAYING";
    }
}

function PairSetting<TLeft, TRight>(props: { data: [EditorOption<TLeft>, EditorOption<TRight>]; }) {
    const [left, right] = props.data;

    return (
        <div className={cl("pair")}>
            <SingleSetting {...left} />
            <SingleSetting {...right} />
        </div>
    );
}

function SingleSetting<T>({ value, label, disabled, isValid, transform, onValueChange }: EditorOption<T>) {
    const [state, setState] = React.useState(() => value == null ? "" : String(value));
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        setState(value == null ? "" : String(value));
        setError(null);
    }, [value]);

    function handleChange(nextValue: string) {
        const transformedValue = transform ? transform(nextValue) : nextValue as T;
        const valid = isValid?.(transformedValue) ?? true;

        setState(nextValue);
        setError(resolveError(valid));

        if (valid === true) {
            onValueChange(transformedValue);
        }
    }

    return (
        <div className={cl("single", { disabled })}>
            <Heading tag="h5">{label}</Heading>
            <TextInput
                type="text"
                placeholder={"Enter a value"}
                value={state}
                onChange={handleChange}
                disabled={disabled}
            />
            {error && <Text className={cl("error")} variant="text-sm/normal">{error}</Text>}
        </div>
    );
}

function SelectSetting<T>({ label, options, disabled, value, onValueChange }: SelectOption<T> & {
    value: T | undefined;
    onValueChange: (value: T) => void;
}) {
    return (
        <div className={cl("single", { disabled })}>
            <Heading tag="h5">{label}</Heading>
            <Select
                placeholder={"Select an option"}
                options={options}
                maxVisibleItems={5}
                closeOnSelect={true}
                select={onValueChange}
                isSelected={v => v === value}
                serialize={v => String(v)}
                isDisabled={disabled}
            />
        </div>
    );
}

const ACTIVITY_TYPES = [
    { label: "Playing", value: ActivityType.PLAYING },
    { label: "Streaming", value: ActivityType.STREAMING },
    { label: "Listening", value: ActivityType.LISTENING },
    { label: "Watching", value: ActivityType.WATCHING },
    { label: "Competing", value: ActivityType.COMPETING },
];

function ActivityTypePicker({ value, onChange }: { value: ActivityType; onChange: (v: ActivityType) => void; }) {
    const currentIndex = ACTIVITY_TYPES.findIndex(t => t.value === value);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const label = ACTIVITY_TYPES[safeIndex].label;

    function prev() {
        const nextIndex = (safeIndex - 1 + ACTIVITY_TYPES.length) % ACTIVITY_TYPES.length;
        onChange(ACTIVITY_TYPES[nextIndex].value);
    }

    function next() {
        const nextIndex = (safeIndex + 1) % ACTIVITY_TYPES.length;
        onChange(ACTIVITY_TYPES[nextIndex].value);
    }

    return (
        <div className={cl("single")}>
            <Heading tag="h5">Activity Type</Heading>
            <div className={cl("type-picker")}>
                <Button size="small" variant="secondary" onClick={prev}>‹</Button>
                <Text className={cl("type-label")} variant="text-md/semibold">{label}</Text>
                <Button size="small" variant="secondary" onClick={next}>›</Button>
            </div>
        </div>
    );
}

export function RPCSettings() {
    const s = settings.use();
    const profiles = React.useMemo(() => parseProfiles(s.multiRpcProfiles), [s.multiRpcProfiles]);
    const rotationProfiles = React.useMemo(() => profiles.filter(profile => profile.rotate !== false), [profiles]);
    const [selectedProfileIndex, setSelectedProfileIndex] = React.useState<number | null>(null);

    React.useEffect(() => {
        if (selectedProfileIndex == null) return;
        if (selectedProfileIndex >= profiles.length) {
            setSelectedProfileIndex(profiles.length ? profiles.length - 1 : null);
        }
    }, [profiles.length, selectedProfileIndex]);

    const selectedProfile = selectedProfileIndex == null ? null : profiles[selectedProfileIndex] ?? null;
    const currentType = (selectedProfile?.type ?? s.type ?? ActivityType.PLAYING) as ActivityType;
    const currentTimestampMode = (selectedProfile?.timestampMode ?? s.timestampMode ?? TimestampMode.NONE) as TimestampMode;
    const rotationMode = (s.multiRpcMode ?? "cycle") as "cycle" | "single";
    const selectedStaticProfileIndex = Math.max(0, Math.min(profiles.length - 1, Number(s.multiRpcSingleIndex ?? 0) || 0));

    const applySetting = React.useCallback(<T,>(settingsKey: SettingsKey, value: T) => {
        if (selectedProfileIndex == null) {
            settings.store[settingsKey] = value;
            updateRPC();
            return;
        }

        const nextProfiles = [...parseProfiles(settings.store.multiRpcProfiles)];
        const nextProfile = { ...(nextProfiles[selectedProfileIndex] ?? buildBlankProfile()) };
        nextProfile[settingsKey as keyof RpcProfile] = value as never;
        nextProfiles[selectedProfileIndex] = nextProfile;
        saveProfiles(nextProfiles);
    }, [selectedProfileIndex]);

    const addProfile = React.useCallback(() => {
        const nextProfiles = [...profiles, buildBlankProfile()];
        settings.store.multiRpcEnabled = true;
        saveProfiles(nextProfiles);
        setSelectedProfileIndex(nextProfiles.length - 1);
    }, [profiles]);

    const duplicateLiveRpc = React.useCallback(() => {
        const snapshot = {} as RpcProfile;

        for (const key of profileKeys) {
            const value = s[key as SettingsKey];
            if (value != null && value !== "") snapshot[key] = value as never;
        }

        const nextProfiles = [...profiles, snapshot];
        settings.store.multiRpcEnabled = true;
        saveProfiles(nextProfiles);
        setSelectedProfileIndex(nextProfiles.length - 1);
    }, [profiles, s]);

    const deleteProfile = React.useCallback((index: number) => {
        const nextProfiles = profiles.filter((_, currentIndex) => currentIndex !== index);
        saveProfiles(nextProfiles);
        setSelectedProfileIndex(current => {
            if (current == null) return null;
            if (current === index) return nextProfiles.length ? Math.min(index, nextProfiles.length - 1) : null;
            return current > index ? current - 1 : current;
        });
    }, [profiles]);

    const setProfileRotation = React.useCallback((index: number, rotate: boolean) => {
        const nextProfiles = [...profiles];
        nextProfiles[index] = {
            ...(nextProfiles[index] ?? buildBlankProfile()),
            rotate
        };
        saveProfiles(nextProfiles);
    }, [profiles]);

    const applySelectedProfileToLive = React.useCallback(() => {
        if (!selectedProfile) return;

        const target = settings.store as unknown as Record<string, unknown>;
        for (const [key, value] of Object.entries(selectedProfile)) {
            if (key === "rotate") continue;
            target[key] = value;
        }

        updateRPC();
    }, [selectedProfile]);

    const openLiveRpc = React.useCallback(() => {
        setSelectedProfileIndex(null);
    }, []);

    const currentValues = selectedProfile ?? s;
    const isProfileEditor = selectedProfileIndex != null;

    return (
        <div className={cl("root")}>
            <div className={cl("hero")}>
                <div className={cl("hero-copy")}>
                    <Heading tag="h2">ReCord Rich Presence Studio</Heading>
                    <Text variant="text-sm/normal">
                        Build your live status, save alternate RPC presets, choose their activity type, and control exactly which ones enter rotation.
                    </Text>
                </div>


            </div>

            <div className={cl("section")}>
                <div className={cl("section-heading")}>
                    <Heading tag="h3">Workspace</Heading>
                    <Text variant="text-sm/normal">Switch between the live Rich Presence and saved reusable profiles. Saved profiles can be included in rotation individually.</Text>
                </div>

                <div className={cl("toolbar")}>
                    <Button size="small" onClick={addProfile}>+ New Profile</Button>
                    <Button size="small" variant="secondary" onClick={duplicateLiveRpc}>Duplicate Live RPC</Button>
                    {isProfileEditor && <Button size="small" variant="secondary" onClick={openLiveRpc}>Back to Live RPC</Button>}
                    {isProfileEditor && <Button size="small" variant="primary" onClick={applySelectedProfileToLive}>Use This Profile Now</Button>}
                </div>

                <div className={cl("targets")}>
                    <div
                        className={cl("target-card", {
                            "target-card-active": !isProfileEditor
                        })}
                        onClick={openLiveRpc}
                    >
                        <Heading tag="h4">Live RPC</Heading>
                        <Text variant="text-sm/normal">{s.appName || "No live RPC configured yet."}</Text>
                        <span className={cl("target-meta")}>{getActivityTypeLabel(s.type)} · pushed immediately</span>
                    </div>

                    {profiles.map((profile, index) => (
                        <div
                            key={`profile-${index}`}
                            className={cl("target-card", {
                                "target-card-active": selectedProfileIndex === index
                            })}
                            onClick={() => setSelectedProfileIndex(index)}
                        >
                            <Heading tag="h4">{profile.appName || `Profile ${index + 1}`}</Heading>
                            <Text variant="text-sm/normal">{profile.details || profile.state || "Empty profile. Start filling out the fields below."}</Text>
                            <span className={cl("target-meta")}>{getActivityTypeLabel(profile.type)} · {profile.rotate !== false ? "included in rotation" : "excluded from rotation"}</span>

                            <div className={cl("target-actions")}>
                                <Button size="small" variant="secondary" onClick={event => {
                                    event.stopPropagation();
                                    setSelectedProfileIndex(index);
                                }}>
                                    Edit
                                </Button>
                                <Button size="small" variant={profile.rotate !== false ? "primary" : "secondary"} onClick={event => {
                                    event.stopPropagation();
                                    setProfileRotation(index, profile.rotate === false);
                                }}>
                                    {profile.rotate !== false ? "In Rotation" : "Skip Rotation"}
                                </Button>
                                <Button size="small" variant="dangerSecondary" onClick={event => {
                                    event.stopPropagation();
                                    deleteProfile(index);
                                }}>
                                    Delete
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                <Text className={cl("footnote")} variant="text-sm/normal">
                    The Live RPC is the presence Discord sees immediately. Rotation only uses profiles marked as included.
                </Text>
            </div>

            <Divider />

            <div className={cl("section")}>
                <div className={cl("section-heading")}>
                    <Heading tag="h3">{isProfileEditor ? `Editing ${selectedProfile?.appName || `Profile ${selectedProfileIndex! + 1}`}` : "Editing Live RPC"}</Heading>
                    <Text variant="text-sm/normal">{isProfileEditor ? "Changes here are saved to the selected profile card." : "Changes here update your currently active Rich Presence."}</Text>
                </div>

            <ActivityTypePicker
                value={currentType}
                onChange={value => applySetting("type", value)}
            />

            <PairSetting data={[
                {
                    settingsKey: "appID",
                    label: "Application ID",
                    isValid: isAppIdValid,
                    value: currentValues.appID,
                    onValueChange: (value: string) => applySetting("appID", value)
                },
                {
                    settingsKey: "appName",
                    label: "Application Name",
                    isValid: makeValidator(128, true),
                    value: currentValues.appName,
                    onValueChange: (value: string) => applySetting("appName", value)
                },
            ]} />

            <PairSetting data={[
                {
                    settingsKey: "details",
                    label: "Detail (line 1)",
                    isValid: maxLength128,
                    value: currentValues.details,
                    onValueChange: (value: string) => applySetting("details", value)
                },
                {
                    settingsKey: "detailsURL",
                    label: "Detail URL",
                    isValid: isUrlValid,
                    value: currentValues.detailsURL,
                    onValueChange: (value: string) => applySetting("detailsURL", value)
                },
            ]} />

            <PairSetting data={[
                {
                    settingsKey: "state",
                    label: "State (line 2)",
                    isValid: maxLength128,
                    value: currentValues.state,
                    onValueChange: (value: string) => applySetting("state", value)
                },
                {
                    settingsKey: "stateURL",
                    label: "State URL",
                    isValid: isUrlValid,
                    value: currentValues.stateURL,
                    onValueChange: (value: string) => applySetting("stateURL", value)
                },
            ]} />

            <SingleSetting
                label="Stream Link (Twitch or YouTube, only if activity type is Streaming)"
                value={currentValues.streamLink}
                onValueChange={(value: string) => applySetting("streamLink", value)}
                disabled={currentType !== ActivityType.STREAMING}
                isValid={value => currentType !== ActivityType.STREAMING ? true : isStreamLinkValid(value)}
            />

            <PairSetting data={[
                {
                    settingsKey: "partySize",
                    label: "Party Size",
                    value: currentValues.partySize,
                    onValueChange: (value: number) => applySetting("partySize", value),
                    transform: parseNumber,
                    isValid: isNumberValid,
                    disabled: currentType !== ActivityType.PLAYING,
                },
                {
                    settingsKey: "partyMaxSize",
                    label: "Maximum Party Size",
                    value: currentValues.partyMaxSize,
                    onValueChange: (value: number) => applySetting("partyMaxSize", value),
                    transform: parseNumber,
                    isValid: isNumberValid,
                    disabled: currentType !== ActivityType.PLAYING,
                },
            ]} />

            <Divider />

            <PairSetting data={[
                {
                    settingsKey: "imageBig",
                    label: "Large Image URL/Key",
                    isValid: isImageKeyValid,
                    value: currentValues.imageBig,
                    onValueChange: (value: string) => applySetting("imageBig", value)
                },
                {
                    settingsKey: "imageBigTooltip",
                    label: "Large Image Text",
                    isValid: maxLength128,
                    value: currentValues.imageBigTooltip,
                    onValueChange: (value: string) => applySetting("imageBigTooltip", value)
                },
            ]} />
            <SingleSetting
                label="Large Image clickable URL"
                value={currentValues.imageBigURL}
                onValueChange={(value: string) => applySetting("imageBigURL", value)}
                isValid={isUrlValid}
            />

            <PairSetting data={[
                {
                    settingsKey: "imageSmall",
                    label: "Small Image URL/Key",
                    isValid: isImageKeyValid,
                    value: currentValues.imageSmall,
                    onValueChange: (value: string) => applySetting("imageSmall", value)
                },
                {
                    settingsKey: "imageSmallTooltip",
                    label: "Small Image Text",
                    isValid: maxLength128,
                    value: currentValues.imageSmallTooltip,
                    onValueChange: (value: string) => applySetting("imageSmallTooltip", value)
                },
            ]} />
            <SingleSetting
                label="Small Image clickable URL"
                value={currentValues.imageSmallURL}
                onValueChange={(value: string) => applySetting("imageSmallURL", value)}
                isValid={isUrlValid}
            />

            <Divider />

            <PairSetting data={[
                {
                    settingsKey: "buttonOneText",
                    label: "Button1 Text",
                    isValid: makeValidator(31),
                    value: currentValues.buttonOneText,
                    onValueChange: (value: string) => applySetting("buttonOneText", value)
                },
                {
                    settingsKey: "buttonOneURL",
                    label: "Button1 URL",
                    isValid: isUrlValid,
                    value: currentValues.buttonOneURL,
                    onValueChange: (value: string) => applySetting("buttonOneURL", value)
                },
            ]} />
            <PairSetting data={[
                {
                    settingsKey: "buttonTwoText",
                    label: "Button2 Text",
                    isValid: makeValidator(31),
                    value: currentValues.buttonTwoText,
                    onValueChange: (value: string) => applySetting("buttonTwoText", value)
                },
                {
                    settingsKey: "buttonTwoURL",
                    label: "Button2 URL",
                    isValid: isUrlValid,
                    value: currentValues.buttonTwoURL,
                    onValueChange: (value: string) => applySetting("buttonTwoURL", value)
                },
            ]} />

            <Divider />

            <SelectSetting
                label="Timestamp Mode"
                value={currentTimestampMode}
                onValueChange={value => applySetting("timestampMode", value)}
                options={[
                    {
                        label: "None",
                        value: TimestampMode.NONE,
                        default: true
                    },
                    {
                        label: "Since discord open",
                        value: TimestampMode.NOW
                    },
                    {
                        label: "Same as your current time (not reset after 24h)",
                        value: TimestampMode.TIME
                    },
                    {
                        label: "Custom",
                        value: TimestampMode.CUSTOM
                    }
                ]}
            />

            <PairSetting data={[
                {
                    settingsKey: "startTime",
                    label: "Start Timestamp (in milliseconds)",
                    value: currentValues.startTime,
                    onValueChange: (value: number) => applySetting("startTime", value),
                    transform: parseNumber,
                    isValid: isNumberValid,
                    disabled: currentTimestampMode !== TimestampMode.CUSTOM,
                },
                {
                    settingsKey: "endTime",
                    label: "End Timestamp (in milliseconds)",
                    value: currentValues.endTime,
                    onValueChange: (value: number) => applySetting("endTime", value),
                    transform: parseNumber,
                    isValid: isNumberValid,
                    disabled: currentTimestampMode !== TimestampMode.CUSTOM,
                },
            ]} />

            </div>

            <Divider />

            <div className={cl("section")}>
                <div className={cl("section-heading")}>
                    <Heading tag="h3">Rotation</Heading>
                    <Text variant="text-sm/normal">Turn rotation on or off, choose whether to cycle or pin one profile, and decide exactly which saved RPC cards are eligible.</Text>
                </div>

                <div className={cl("single")}>
                    <Heading tag="h5">Rotation</Heading>
                    <Button
                        size="medium"
                        variant={s.multiRpcEnabled ? "primary" : "secondary"}
                        onClick={() => {
                            settings.store.multiRpcEnabled = !s.multiRpcEnabled;
                            updateRPC();
                        }}
                    >
                        {s.multiRpcEnabled ? "Rotation: ON" : "Rotation: OFF"}
                    </Button>
                </div>

                <div className={cl("rotation-summary")}>
                    <Text variant="text-sm/normal">
                        {rotationProfiles.length
                            ? `${rotationProfiles.length} profile${rotationProfiles.length === 1 ? "" : "s"} currently available for rotation.`
                            : "No profiles are marked for rotation yet. Use the button on each profile card above to include one."}
                    </Text>
                </div>

                <SelectSetting
                    label="Profile Scheduling"
                    value={rotationMode}
                    onValueChange={value => {
                        settings.store.multiRpcMode = value as "cycle" | "single";
                        updateRPC();
                    }}
                    options={[
                        { label: "Cycle through profiles", value: "cycle", default: true },
                        { label: "Use one profile only", value: "single" }
                    ]}
                    disabled={!s.multiRpcEnabled}
                />

                <SelectSetting
                    label="Single Profile"
                    value={selectedStaticProfileIndex}
                    onValueChange={value => {
                        settings.store.multiRpcSingleIndex = value;
                        updateRPC();
                    }}
                    options={profiles.length
                        ? profiles.map((profile, index) => ({
                            label: profile.appName || `Profile ${index + 1}`,
                            value: index,
                            default: index === 0
                        }))
                        : [{ label: "Create a profile first", value: 0, default: true }]}
                    disabled={!s.multiRpcEnabled || rotationMode !== "single" || !profiles.length}
                />

                <PairSetting data={[
                    {
                        settingsKey: "multiRpcIntervalSec",
                        label: "Rotation Interval (seconds)",
                        value: s.multiRpcIntervalSec,
                        onValueChange: (value: number) => {
                            settings.store.multiRpcIntervalSec = value;
                            updateRPC();
                        },
                        transform: parseNumber,
                        isValid: value => value >= 5 ? true : "Must be at least 5 seconds.",
                        disabled: !s.multiRpcEnabled,
                    },
                    {
                        settingsKey: "multiRpcProfiles",
                        label: "Profiles JSON (advanced)",
                        value: s.multiRpcProfiles,
                        onValueChange: (value: string) => {
                            settings.store.multiRpcProfiles = value;
                            updateRPC();
                        },
                        isValid: (value: string) => {
                            if (!value) return true;
                            try {
                                const parsed = JSON.parse(value);
                                if (!Array.isArray(parsed)) return "Must be a JSON array.";
                                return true;
                            } catch {
                                return "Invalid JSON.";
                            }
                        },
                        disabled: !s.multiRpcEnabled,
                    },
                ]} />

                <Text className={cl("footnote")} variant="text-sm/normal">
                    {"Example: [{\"appName\":\"Coding\",\"details\":\"Fixing bugs\"},{\"appName\":\"Gaming\",\"state\":\"In Match\"}]"}
                </Text>
            </div>
        </div>
    );
}
