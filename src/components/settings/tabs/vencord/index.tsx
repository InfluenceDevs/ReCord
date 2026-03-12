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
import { FolderIcon, GithubIcon, LogIcon, PaintbrushIcon, RestartIcon } from "@components/Icons";
import { QuickAction, QuickActionCard } from "@components/settings/QuickAction";
import { BackupAndRestoreTab, CloudTab, openSettingsTabModal, PluginsTab, ThemesTab, UpdaterTab } from "@components/settings/tabs";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { openContributorModal } from "@components/settings/tabs/plugins/ContributorModal";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { gitRemote } from "@shared/vencordUserAgent";
import { IS_MAC, IS_WINDOWS } from "@utils/constants";
import { Margins } from "@utils/margins";
import { isPluginDev } from "@utils/misc";
import { relaunch } from "@utils/native";
import { Alerts, Forms, React, UserStore } from "@webpack/common";

import { VibrancySettings } from "./MacVibrancySettings";
import { NotificationSection } from "./NotificationSettings";
import { openReCordConsoleModal } from "./ReCordConsole";

const COZY_CONTRIB_IMAGE = "https://cdn.discordapp.com/emojis/1026533070955872337.png";
const CONTRIB_BACKGROUND_IMAGE = "https://media.discordapp.net/stickers/1311070166481895484.png?size=2048";

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
    const [installedPlugins, setInstalledPlugins] = React.useState<string[]>([]);
    const [pluginListLoading, setPluginListLoading] = React.useState(false);
    const filePickerRef = React.useRef<HTMLInputElement>(null);

    const bdNative = (VencordNative.pluginHelpers as any).BetterDiscordCompat;
    const bdCompatPlugin = (Vencord.Plugins.plugins as any).BetterDiscordCompat;

    const refreshInstalledPlugins = React.useCallback(async () => {
        if (IS_WEB || !bdNative?.listPluginFiles) return;

        setPluginListLoading(true);
        try {
            const files = await bdNative.listPluginFiles();
            setInstalledPlugins(Array.isArray(files) ? files : []);
        } finally {
            setPluginListLoading(false);
        }
    }, [bdNative]);

    React.useEffect(() => {
        refreshInstalledPlugins();
    }, [refreshInstalledPlugins]);

    const onUploadPlugins = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const { files } = event.target;
        if (!files?.length || !bdNative?.uploadPluginFile) return;

        for (const file of Array.from(files)) {
            const content = await file.text();
            await bdNative.uploadPluginFile(file.name, content);
        }

        await bdCompatPlugin?.reloadPlugins?.();
        await refreshInstalledPlugins();

        event.target.value = "";
    }, [bdNative, bdCompatPlugin, refreshInstalledPlugins]);

    const onDeletePlugin = React.useCallback(async (fileName: string) => {
        if (!bdNative?.deletePluginFile) return;

        await bdNative.deletePluginFile(fileName);
        await bdCompatPlugin?.reloadPlugins?.();
        await refreshInstalledPlugins();
    }, [bdNative, bdCompatPlugin, refreshInstalledPlugins]);

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
                    <QuickAction
                        Icon={LogIcon}
                        text="Notification Log"
                        action={openNotificationLogModal}
                    />
                    <QuickAction
                        Icon={LogIcon}
                        text="ReCord Console"
                        action={openReCordConsoleModal}
                    />
                    <QuickAction
                        Icon={PaintbrushIcon}
                        text="Edit QuickCSS"
                        action={() => VencordNative.quickCss.openEditor()}
                    />
                    {!IS_WEB && (
                        <>
                            <QuickAction
                                Icon={RestartIcon}
                                text="Relaunch Discord"
                                action={relaunch}
                            />
                            <QuickAction
                                Icon={FolderIcon}
                                text="Open Settings Folder"
                                action={() => VencordNative.settings.openFolder()}
                            />
                            <QuickAction
                                Icon={FolderIcon}
                                text="Open UserPlugins Folder"
                                action={() => VencordNative.settings.openUserPluginsFolder()}
                            />
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
                        Jump to frequently used ReCord settings tabs instantly.
                    </Forms.FormText>
                    <div className="vc-record-quick-tabs">
                        <Button size="small" variant="secondary" onClick={() => openSettingsTabModal(PluginsTab)}>Plugins</Button>
                        <Button size="small" variant="secondary" onClick={() => openSettingsTabModal(ThemesTab)}>Themes</Button>
                        <Button size="small" variant="secondary" onClick={() => openSettingsTabModal(CloudTab)}>Cloud</Button>
                        <Button size="small" variant="secondary" onClick={() => openSettingsTabModal(BackupAndRestoreTab)}>Backup</Button>
                        {!!UpdaterTab && <Button size="small" variant="secondary" onClick={openUpdaterTab}>Updater</Button>}
                    </div>
                </section>
            )}

            <Divider />

            <section className={Margins.top16}>
                <Forms.FormTitle tag="h5">Custom Plugins</Forms.FormTitle>
                <Forms.FormText className={Margins.bottom8}>
                    Upload BetterDiscord-style JavaScript plugins, manage installed files, and reload without restarting.
                </Forms.FormText>

                {!IS_WEB && (
                    <>
                        <input
                            ref={filePickerRef}
                            type="file"
                            multiple
                            accept=".js,.plugin.js"
                            style={{ display: "none" }}
                            onChange={onUploadPlugins}
                        />

                        <QuickActionCard>
                            <QuickAction
                                Icon={FolderIcon}
                                text="Open BD Plugins Folder"
                                action={() => bdNative?.openPluginsDir?.()}
                            />
                            <QuickAction
                                Icon={RestartIcon}
                                text="Reload BD Plugins"
                                action={async () => {
                                    await bdCompatPlugin?.reloadPlugins?.();
                                    await refreshInstalledPlugins();
                                }}
                            />
                            <QuickAction
                                Icon={FolderIcon}
                                text="Upload Plugin Files"
                                action={() => filePickerRef.current?.click()}
                            />
                        </QuickActionCard>

                        <Forms.FormTitle tag="h5" className={Margins.top16}>Installed</Forms.FormTitle>
                        {pluginListLoading && <Forms.FormText>Loading plugin list...</Forms.FormText>}
                        {!pluginListLoading && installedPlugins.length === 0 && (
                            <Forms.FormText>No custom plugins installed yet.</Forms.FormText>
                        )}
                        {!pluginListLoading && installedPlugins.length > 0 && (
                            <div style={{ display: "grid", gap: 8 }}>
                                {installedPlugins.map(fileName => (
                                    <div key={fileName} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                        <Forms.FormText>{fileName}</Forms.FormText>
                                        <Button
                                            size="small"
                                            variant="dangerSecondary"
                                            onClick={() => onDeletePlugin(fileName)}
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </section>

            <section className={Margins.top16}>
                <Forms.FormTitle tag="h5">Settings</Forms.FormTitle>
                <Forms.FormText className={Margins.bottom20} style={{ color: "var(--text-muted)" }}>
                    Hint: You can change the position of this settings section in the{" "}
                    <a onClick={() => openPluginModal(Vencord.Plugins.plugins.Settings)}>
                        settings of the Settings plugin
                    </a>!
                </Forms.FormText>

                <Switches />

                <FormSwitch
                    title="Enable Quick Tabs"
                    description="Show fast navigation tabs at the top of ReCord Settings"
                    value={settings.plugins.Settings.enableQuickNavigationTabs ?? true}
                    onChange={v => settings.plugins.Settings.enableQuickNavigationTabs = v}
                />
            </section>

            <section className={Margins.top16}>
                <Forms.FormTitle tag="h5">About ReCord</Forms.FormTitle>
                <Forms.FormText>
                    ReCord is a custom Discord client mod with blurple theming, custom plugin support, and BetterDiscord-style CSS compatibility.
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
