/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
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

import "./QuickTabs.css";

import * as DataStore from "@api/DataStore";
import { openNotificationLogModal } from "@api/Notifications/notificationLog";
import { isPluginEnabled } from "@api/PluginManager";
import { useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { FormSwitch } from "@components/FormSwitch";
import { CopyIcon, FolderIcon, GithubIcon, LogIcon, PaintbrushIcon, RestartIcon, SafetyIcon } from "@components/Icons";
import { QuickAction, QuickActionCard } from "@components/settings/QuickAction";
import { BackupAndRestoreTab, openSettingsTabModal, PluginsTab, ThemesTab, UpdaterTab } from "@components/settings/tabs";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { DEFAULT_PLUGIN_FILTER_STATE, normalizePluginFilterState, PLUGIN_FILTER_STORE_KEY, SearchSource, SearchStatus } from "@components/settings/tabs/plugins";
import { openContributorModal } from "@components/settings/tabs/plugins/ContributorModal";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { settings as customRpcSettings } from "@plugins/customRPC";
import { gitRemote } from "@shared/vencordUserAgent";
import { IS_MAC, IS_WINDOWS } from "@utils/constants";
import { Margins } from "@utils/margins";
import { isPluginDev } from "@utils/misc";
import { relaunch } from "@utils/native";
import { ActivityType } from "@vencord/discord-types/enums";
import { Alerts, AuthenticationStore, Forms, React, UserStore } from "@webpack/common";

import { VibrancySettings } from "./MacVibrancySettings";
import { NotificationSection } from "./NotificationSettings";
import { openReCordConsoleModal } from "./ReCordConsole";

const RECORD_ICON = "vencord://assets/icon.png";
const RECORD_LIGHT_ICON = RECORD_ICON;

const activityTypeOptions = [
    { label: "Playing", value: ActivityType.PLAYING, default: true },
    { label: "Streaming", value: ActivityType.STREAMING },
    { label: "Listening", value: ActivityType.LISTENING },
    { label: "Watching", value: ActivityType.WATCHING },
    { label: "Competing", value: ActivityType.COMPETING }
];

function getActivityTypeLabel(type?: ActivityType) {
    switch (type) {
        case ActivityType.STREAMING:
            return "Streaming";
        case ActivityType.LISTENING:
            return "Listening";
        case ActivityType.WATCHING:
            return "Watching";
        case ActivityType.COMPETING:
            return "Competing";
        case ActivityType.PLAYING:
        default:
            return "Playing";
    }
}

type KeysOfType<Object, Type> = {
    [K in keyof Object]: Object[K] extends Type ? K : never;
}[keyof Object];

function Switches() {
    const settings = useSettings(["useQuickCss", "enableReactDevtools", "frameless", "winNativeTitleBar", "transparent", "winCtrlQ", "disableMinSize"]);

    const Switches = [
        {
            key: "useQuickCss",
            title: "Enable Custom CSS",
        },
        !IS_WEB && {
            key: "enableReactDevtools",
            title: "Enable React Developer Tools",
            restartRequired: true
        },
        !IS_WEB && (!IS_DISCORD_DESKTOP || !IS_WINDOWS ? {
            key: "frameless",
            title: "Disable the window frame",
            restartRequired: true
        } : {
            key: "winNativeTitleBar",
            title: "Use Windows' native title bar instead of Discord's custom one",
            restartRequired: true
        }),
        !IS_WEB && {
            key: "transparent",
            title: "Enable window transparency",
            description: "A theme that supports transparency is required or this will do nothing. Stops the window from being resizable as a side effect",
            restartRequired: true
        },
        IS_DISCORD_DESKTOP && {
            key: "disableMinSize",
            title: "Disable minimum window size",
            restartRequired: true
        },
        !IS_WEB && IS_WINDOWS && {
            key: "winCtrlQ",
            title: "Register Ctrl+Q as shortcut to close Discord (Alternative to Alt+F4)",
            restartRequired: true
        },
    ] satisfies Array<false | {
        key: KeysOfType<typeof settings, boolean>;
        title: string;
        description?: string;
        restartRequired?: boolean;
    }>;

    return Switches.map(setting => {
        if (!setting) {
            return null;
        }

        const { key, title, description, restartRequired } = setting;

        return (
            <FormSwitch
                key={key}
                title={title}
                description={description}
                value={settings[key]}
                onChange={v => {
                    settings[key] = v;

                    if (restartRequired) {
                        Alerts.show({
                            title: "Restart Required",
                            body: "A restart is required to apply this change",
                            confirmText: "Restart now",
                            cancelText: "Later!",
                            onConfirm: relaunch
                        });
                    }
                }}
            />
        );
    });
}

function ReCordSettings() {
    const settings = useSettings(["plugins.Settings.enableQuickNavigationTabs"]);
    const rpcSettings = customRpcSettings.use();

    const needsVibrancySettings = IS_DISCORD_DESKTOP && IS_MAC;
    const showQuickTabs = settings.plugins.Settings.enableQuickNavigationTabs ?? true;
    const customRpcEnabled = isPluginEnabled("CustomRPC");
    const openUpdaterTab = () => {
        if (UpdaterTab) openSettingsTabModal(UpdaterTab);
    };

    const user = UserStore?.getCurrentUser();
    const isDark = document.body.classList.contains("theme-dark");
    const currentIcon = isDark ? RECORD_ICON : RECORD_LIGHT_ICON;

    const copyToken = React.useCallback(() => {
        try {
            const token = (AuthenticationStore as any).getToken?.();
            if (token) {
                navigator.clipboard.writeText(token);
                Alerts.show({
                    title: "Token Copied",
                    body: "Your Discord token has been copied to the clipboard. Keep it secret - anyone with your token has full access to your account.",
                    confirmText: "Got it"
                });
            } else {
                Alerts.show({ title: "Error", body: "Could not retrieve token.", confirmText: "OK" });
            }
        } catch {
            Alerts.show({ title: "Error", body: "Failed to copy token.", confirmText: "OK" });
        }
    }, []);

    const openPluginsWithFilter = React.useCallback((filter: Partial<typeof DEFAULT_PLUGIN_FILTER_STATE>) => {
        void DataStore.set(PLUGIN_FILTER_STORE_KEY, normalizePluginFilterState({
            ...DEFAULT_PLUGIN_FILTER_STATE,
            ...filter
        }));
        openSettingsTabModal(PluginsTab);
    }, []);


    return (
        <SettingsTab>
            <section className="vc-record-layout">
                <header className="vc-record-header">
                    <div className="vc-record-header-main">
                        <img src={currentIcon} alt="ReCord Icon" className="vc-record-logo" />
                        <div>
                            <Forms.FormTitle tag="h2">ReCord Control Center</Forms.FormTitle>
                            <Forms.FormText className="vc-record-muted">
                                One place for account controls, behavior toggles, and fast actions.
                            </Forms.FormText>
                        </div>
                    </div>
                    <div className="vc-record-badges">
                        <span className="vc-record-badge">Creator: Influence</span>
                        {user && (
                            <span className="vc-record-badge vc-record-badge-soft">
                                Signed in: {user.username}{user.discriminator !== "0" ? `#${user.discriminator}` : ""}
                            </span>
                        )}
                    </div>
                </header>

                {showQuickTabs && (
                    <section className="vc-record-panel vc-record-nav-panel">
                        <Forms.FormTitle tag="h5">Quick Tabs</Forms.FormTitle>
                        <div className="vc-record-quick-tabs">
                            <Button size="small" variant="secondary" onClick={() => openSettingsTabModal(PluginsTab)}>Plugins</Button>
                            <Button size="small" variant="secondary" onClick={() => openSettingsTabModal(ThemesTab)}>Themes</Button>
                            <Button size="small" variant="secondary" onClick={() => openSettingsTabModal(BackupAndRestoreTab)}>Backup</Button>
                            {!!UpdaterTab && <Button size="small" variant="secondary" onClick={openUpdaterTab}>Updater</Button>}
                        </div>
                    </section>
                )}

                <div className="vc-record-grid">
                    <section className="vc-record-panel vc-record-panel-wide">
                        <Forms.FormTitle tag="h5">Quick Actions</Forms.FormTitle>
                        <QuickActionCard>
                            <QuickAction Icon={LogIcon} text="Notification Log" action={openNotificationLogModal} />
                            <QuickAction Icon={LogIcon} text="ReCord Console" action={openReCordConsoleModal} />
                            <QuickAction Icon={PaintbrushIcon} text="Edit QuickCSS" action={() => VencordNative.quickCss.openEditor()} />
                            <QuickAction Icon={SafetyIcon} text="Copy Token" action={copyToken} />
                            {!IS_WEB && (
                                <>
                                    <QuickAction Icon={RestartIcon} text="Relaunch Discord" action={relaunch} />
                                    <QuickAction Icon={FolderIcon} text="Open Settings Folder" action={() => VencordNative.settings.openFolder()} />
                                    <QuickAction Icon={FolderIcon} text="Open UserPlugins Folder" action={() => VencordNative.settings.openUserPluginsFolder()} />
                                    <QuickAction
                                        Icon={FolderIcon}
                                        text="Open Plugins Folder"
                                        action={() => (VencordNative.pluginHelpers as any).BetterDiscordCompat?.openPluginsDir?.()}
                                    />
                                </>
                            )}
                            <QuickAction Icon={GithubIcon} text="View Source Code" action={() => VencordNative.native.openExternal("https://github.com/" + gitRemote)} />
                        </QuickActionCard>
                    </section>

                    <section className="vc-record-panel">
                        <Forms.FormTitle tag="h5">Account</Forms.FormTitle>
                        <Forms.FormText className="vc-record-muted" style={{ marginBottom: 10 }}>
                            Your token grants full access to your account. Never share it.
                        </Forms.FormText>
                        <Button size="small" variant="secondary" onClick={copyToken}>
                            <CopyIcon width={14} height={14} style={{ marginRight: 6 }} /> Copy Token
                        </Button>
                    </section>

                    <section className="vc-record-panel">
                        <Forms.FormTitle tag="h5">About ReCord</Forms.FormTitle>
                        <Forms.FormText>
                            ReCord is a Discord client mod forked from Vencord with Custom Plugins compatibility, OPSEC tools, and utility plugins.
                        </Forms.FormText>
                        <Forms.FormText className={Margins.top8}>
                            Built and maintained by Influence.
                        </Forms.FormText>
                    </section>

                    <section className="vc-record-panel">
                        <Forms.FormTitle tag="h5">Plugin Browser</Forms.FormTitle>
                        <Forms.FormText className="vc-record-muted" style={{ marginBottom: 10 }}>
                            Jump straight into filtered plugin lists instead of rebuilding the browser each time.
                        </Forms.FormText>
                        <div className="vc-record-quick-tabs">
                            <Button size="small" variant="secondary" onClick={() => openPluginsWithFilter({ status: SearchStatus.ENABLED })}>Enabled</Button>
                            <Button size="small" variant="secondary" onClick={() => openPluginsWithFilter({ status: SearchStatus.DISABLED })}>Disabled</Button>
                            <Button size="small" variant="secondary" onClick={() => openPluginsWithFilter({ source: SearchSource.RECORD, status: SearchStatus.ALL })}>ReCord</Button>
                            <Button size="small" variant="secondary" onClick={() => openPluginsWithFilter({ source: SearchSource.VENCORD, status: SearchStatus.ALL })}>Vencord</Button>
                            <Button size="small" variant="secondary" onClick={() => openPluginsWithFilter({ value: "CustomRPC" })}>Find CustomRPC</Button>
                        </div>
                    </section>
                </div>

                <section className="vc-record-panel">
                    <Forms.FormTitle tag="h5">Client Settings</Forms.FormTitle>
                    <Forms.FormText className="vc-record-muted" style={{ marginBottom: 12 }}>
                        Layout and behavior controls. You can move this section from{" "}
                        <a onClick={() => openPluginModal(Vencord.Plugins.plugins.Settings)}>Settings plugin options</a>.
                    </Forms.FormText>
                    <Switches />
                    <FormSwitch
                        title="Enable Quick Tabs"
                        description="Show fast navigation tabs in ReCord Settings"
                        value={settings.plugins.Settings.enableQuickNavigationTabs ?? true}
                        onChange={v => settings.plugins.Settings.enableQuickNavigationTabs = v}
                    />
                </section>

                {isPluginDev(user?.id) && (
                    <section className="vc-record-panel">
                        <Forms.FormTitle tag="h5">Contributions</Forms.FormTitle>
                        <Forms.FormText className={Margins.bottom8}>
                            You have a contributor badge for ReCord.
                        </Forms.FormText>
                        <Button size="small" variant="secondary" onClick={() => openContributorModal(user)}>
                            See your contributions
                        </Button>
                    </section>
                )}

                {needsVibrancySettings && <VibrancySettings />}
            </section>

            <Divider className={Margins.top16} />
            <NotificationSection />
        </SettingsTab>
    );
}

export default wrapTab(ReCordSettings, "ReCord Settings");
