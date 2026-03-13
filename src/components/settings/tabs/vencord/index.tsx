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

import { openNotificationLogModal } from "@api/Notifications/notificationLog";
import { useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { FormSwitch } from "@components/FormSwitch";
import { CopyIcon, FolderIcon, GithubIcon, LogIcon, PaintbrushIcon, RestartIcon, SafetyIcon } from "@components/Icons";
import { QuickAction, QuickActionCard } from "@components/settings/QuickAction";
import { BackupAndRestoreTab, openSettingsTabModal, PluginsTab, ThemesTab, UpdaterTab } from "@components/settings/tabs";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { openContributorModal } from "@components/settings/tabs/plugins/ContributorModal";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { gitRemote } from "@shared/vencordUserAgent";
import { IS_MAC, IS_WINDOWS } from "@utils/constants";
import { Margins } from "@utils/margins";
import { isPluginDev } from "@utils/misc";
import { relaunch } from "@utils/native";
import { Alerts, AuthenticationStore, Forms, React, UserStore } from "@webpack/common";

import { VibrancySettings } from "./MacVibrancySettings";
import { NotificationSection } from "./NotificationSettings";
import { openReCordConsoleModal } from "./ReCordConsole";

const RECORD_ICON = "vencord://assets/icon.png";
const RECORD_DARK_BANNER = "vencord://assets/dark-theme-logo.png";
const RECORD_LIGHT_BANNER = "vencord://assets/light-theme-logo.png";

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

    const needsVibrancySettings = IS_DISCORD_DESKTOP && IS_MAC;
    const showQuickTabs = settings.plugins.Settings.enableQuickNavigationTabs ?? true;
    const openUpdaterTab = () => {
        if (UpdaterTab) openSettingsTabModal(UpdaterTab);
    };

    const user = UserStore?.getCurrentUser();
    const isDark = document.body.classList.contains("theme-dark");

    const copyToken = React.useCallback(() => {
        try {
            const token = (AuthenticationStore as any).getToken?.();
            if (token) {
                navigator.clipboard.writeText(token);
                Alerts.show({
                    title: "Token Copied",
                    body: "Your Discord token has been copied to the clipboard. Keep it secret — anyone with your token has full access to your account.",
                    confirmText: "Got it"
                });
            } else {
                Alerts.show({ title: "Error", body: "Could not retrieve token.", confirmText: "OK" });
            }
        } catch {
            Alerts.show({ title: "Error", body: "Failed to copy token.", confirmText: "OK" });
        }
    }, []);

    return (
        <SettingsTab>
            {isPluginDev(user?.id) && (
                <section className={Margins.bottom16}>
                    <Forms.FormTitle tag="h5">Contributions</Forms.FormTitle>
                    <Forms.FormText className={Margins.bottom8}>
                        Since you've contributed to ReCord, you have a contributor badge.
                    </Forms.FormText>
                    <Button size="small" variant="secondary" onClick={() => openContributorModal(user)}>
                        See what you've contributed to
                    </Button>
                </section>
            )}

            <section>
                <Forms.FormTitle tag="h5">Quick Actions</Forms.FormTitle>
                <QuickActionCard>
                    <QuickAction Icon={LogIcon} text="Notification Log" action={openNotificationLogModal} />
                    <QuickAction Icon={LogIcon} text="ReCord Console" action={openReCordConsoleModal} />
                    <QuickAction Icon={PaintbrushIcon} text="Edit QuickCSS" action={() => VencordNative.quickCss.openEditor()} />
                    <QuickAction
                        Icon={SafetyIcon}
                        text="Copy Token"
                        action={copyToken}
                    />
                    {!IS_WEB && (
                        <>
                            <QuickAction Icon={RestartIcon} text="Relaunch Discord" action={relaunch} />
                            <QuickAction Icon={FolderIcon} text="Open Settings Folder" action={() => VencordNative.settings.openFolder()} />
                            <QuickAction Icon={FolderIcon} text="Open UserPlugins Folder" action={() => VencordNative.settings.openUserPluginsFolder()} />
                            <QuickAction
                                Icon={FolderIcon}
                                text="Open BD Plugins Folder"
                                action={() => (VencordNative.pluginHelpers as any).BetterDiscordCompat?.openPluginsDir?.()}
                            />
                        </>
                    )}
                    <QuickAction
                        Icon={GithubIcon}
                        text="View Source Code"
                        action={() => VencordNative.native.openExternal("https://github.com/" + gitRemote)}
                    />
                </QuickActionCard>
            </section>

            {showQuickTabs && (
                <section className={Margins.top16}>
                    <Forms.FormTitle tag="h5">Quick Tabs</Forms.FormTitle>
                    <Forms.FormText className={Margins.bottom8}>
                        Jump to frequently used settings tabs instantly.
                    </Forms.FormText>
                    <div className="vc-record-quick-tabs">
                        <Button size="small" variant="secondary" onClick={() => openSettingsTabModal(PluginsTab)}>Plugins</Button>
                        <Button size="small" variant="secondary" onClick={() => openSettingsTabModal(ThemesTab)}>Themes</Button>
                        <Button size="small" variant="secondary" onClick={() => openSettingsTabModal(BackupAndRestoreTab)}>Backup</Button>
                        {!!UpdaterTab && <Button size="small" variant="secondary" onClick={openUpdaterTab}>Updater</Button>}
                    </div>
                </section>
            )}

            <Divider className={Margins.top16} />

            <section className={Margins.top16}>
                <Forms.FormTitle tag="h5">Settings</Forms.FormTitle>
                <Forms.FormText className={Margins.bottom20} style={{ color: "var(--text-muted)" }}>
                    You can change the position of this section in the{" "}
                    <a onClick={() => openPluginModal(Vencord.Plugins.plugins.Settings)}>
                        Settings plugin options
                    </a>.
                </Forms.FormText>

                <Switches />

                <FormSwitch
                    title="Enable Quick Tabs"
                    description="Show fast navigation tabs in ReCord Settings"
                    value={settings.plugins.Settings.enableQuickNavigationTabs ?? true}
                    onChange={v => settings.plugins.Settings.enableQuickNavigationTabs = v}
                />
            </section>

            <section className={Margins.top16}>
                <Forms.FormTitle tag="h5">Account</Forms.FormTitle>
                {user && (
                    <Forms.FormText className={Margins.bottom8}>
                        Logged in as <strong>{user.username}</strong>{user.discriminator !== "0" ? `#${user.discriminator}` : ""}.
                    </Forms.FormText>
                )}
                <Forms.FormText className={Margins.bottom8} style={{ color: "var(--text-muted)" }}>
                    Your token grants full access to your Discord account. Never share it.
                </Forms.FormText>
                <Button size="small" variant="secondary" onClick={copyToken}>
                    <CopyIcon width={14} height={14} style={{ marginRight: 6 }} /> Copy Token
                </Button>
            </section>

            <section className={Margins.top16}>
                <Forms.FormTitle tag="h5">About ReCord</Forms.FormTitle>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                    <img
                        src={RECORD_ICON}
                        alt="ReCord Icon"
                        width={20}
                        height={20}
                        style={{ borderRadius: 5, objectFit: "cover" }}
                    />
                    <img
                        src={isDark ? RECORD_DARK_BANNER : RECORD_LIGHT_BANNER}
                        alt="ReCord Banner"
                        style={{ height: 34, width: "100%", objectFit: "cover", borderRadius: 8, border: "1px solid var(--border-subtle)" }}
                    />
                </div>
                <Forms.FormText>
                    ReCord is a custom Discord client mod forked from Vencord, featuring BetterDiscord plugin compatibility, OPSEC tools, and custom theming.
                </Forms.FormText>
                <Forms.FormText className={Margins.top8}>
                    Created by Rloxx.
                </Forms.FormText>
            </section>

            {needsVibrancySettings && <VibrancySettings />}

            <NotificationSection />
        </SettingsTab>
    );
}

export default wrapTab(ReCordSettings, "ReCord Settings");
