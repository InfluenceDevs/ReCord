/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and Megumin
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

import { isPluginEnabled } from "@api/PluginManager";
import { definePluginSettings } from "@api/Settings";
import { BackupRestoreIcon, CloudIcon, CogWheel, LogIcon, MainSettingsIcon, Microphone, NotesIcon, PaintbrushIcon, PatchHelperIcon, PlaceholderIcon, PluginsIcon, SafetyIcon, UpdaterIcon, VesktopSettingsIcon } from "@components/Icons";
import { AccountCenterTab, BackupAndRestoreTab, CloudTab, ConsoleTab, CustomRpcTab, DownloadsTab, GhostChatsTab, ModulesTab, OpsecTab, PatchHelperTab, PerformanceTab, PluginsTab, ReCordTab, ThemesTab, UpdaterTab, VoiceTab } from "@components/settings/tabs";
import { Devs } from "@utils/constants";
import { isTruthy } from "@utils/guards";
import { Logger } from "@utils/Logger";
import definePlugin, { IconProps, OptionType } from "@utils/types";
import { waitFor } from "@webpack";
import { React } from "@webpack/common";
import type { ComponentType, PropsWithChildren, ReactNode } from "react";

import gitHash from "~git-hash";

const logger = new Logger("Settings");

let LayoutTypes = {
    SECTION: 1,
    SIDEBAR_ITEM: 2,
    PANEL: 3,
    CATEGORY: 5,
    CUSTOM: 19,
};
waitFor(["SECTION", "SIDEBAR_ITEM", "PANEL", "CUSTOM"], v => LayoutTypes = v);

const FallbackSectionTypes = {
    HEADER: "HEADER",
    DIVIDER: "DIVIDER",
    CUSTOM: "CUSTOM"
};
type SectionTypes = typeof FallbackSectionTypes;

type SettingsLocation =
    | "top"
    | "aboveNitro"
    | "belowNitro"
    | "aboveActivity"
    | "belowActivity"
    | "bottom";

interface SettingsLayoutNode {
    type: number;
    key?: string;
    legacySearchKey?: string;
    getLegacySearchKey?(): string;
    useLabel?(): string;
    useTitle?(): string;
    buildLayout?(): SettingsLayoutNode[];
    icon?(): ReactNode;
    render?(): ReactNode;
    StronglyDiscouragedCustomComponent?(): ReactNode;
}

interface EntryOptions {
    key: string,
    title: string,
    panelTitle?: string,
    Component: ComponentType<{}>,
    Icon: ComponentType<IconProps>;
}
interface SettingsLayoutBuilder {
    key?: string;
    buildLayout(): SettingsLayoutNode[];
}

const settings = definePluginSettings({
    settingsLocation: {
        type: OptionType.SELECT,
        description: "Where to put the ReCord settings section",
        options: [
            { label: "At the very top", value: "top" },
            { label: "Above the Nitro section", value: "aboveNitro", default: true },
            { label: "Below the Nitro section", value: "belowNitro" },
            { label: "Above Activity Settings", value: "aboveActivity" },
            { label: "Below Activity Settings", value: "belowActivity" },
            { label: "At the very bottom", value: "bottom" },
        ] as { label: string; value: SettingsLocation; default?: boolean; }[]
    },
    enableQuickNavigationTabs: {
        type: OptionType.BOOLEAN,
        description: "Show quick navigation tabs in ReCord Settings",
        default: true,
    }
});

const settingsSectionMap: [string, string][] = [
    ["ReCordSettings", "vencord_main_panel"],
    ["ReCordPlugins", "vencord_plugins_panel"],
    ["ReCordThemes", "vencord_themes_panel"],
    ["ReCordUpdater", "vencord_updater_panel"],
    ["ReCordCloud", "vencord_cloud_panel"],
    ["ReCordBackupAndRestore", "vencord_backup_restore_panel"],
    ["ReCordPatchHelper", "vencord_patch_helper_panel"],
    ["ReCordConsole", "vencord_console_panel"],
    ["ReCordAccountCenter", "vencord_account_center_panel"],
    ["ReCordGhostChats", "vencord_ghost_chats_panel"],
    ["ReCordOpsec", "vencord_opsec_panel"],
    ["ReCordPerformance", "vencord_performance_panel"],
    ["ReCordVoice", "vencord_voice_panel"],
    ["ReCordModules", "vencord_modules_panel"],
    ["ReCordDownloads", "vencord_downloads_panel"],
    ["ReCordCustomRPC", "vencord_custom_rpc_panel"],
    ["ReCordMultiRPC", "vencord_custom_rpc_panel"]
];

export default definePlugin({
    name: "Settings",
    description: "Adds Settings UI and debug info",
    authors: [Devs.Ven, Devs.Megu],
    required: true,

    settings,
    settingsSectionMap,

    patches: [
        {
            find: "#{intl::COPY_VERSION}",
            replacement: [
                {
                    match: /"text-xxs\/normal".{0,300}?(?=null!=(\i)&&(.{0,20}\i\.Text.{0,200}?,children:).{0,15}?("span"),({className:\i\.\i,children:\["Build Override: ",\1\.id\]\})\)\}\))/,
                    replace: (m, _buildOverride, makeRow, component, props) => {
                        props = props.replace(/children:\[.+\]/, "");
                        return `${m},$self.makeInfoElements(${component},${props}).map(e=>${makeRow}e})),`;
                    }
                },
                {
                    match: /"text-xs\/normal".{0,300}?\[\(0,\i\.jsxs?\)\((.{1,10}),(\{[^{}}]+\{.{0,20}className:\i.\i,.+?\})\)," "/,
                    replace: (m, component, props) => {
                        props = props.replace(/children:\[.+\]/, "");
                        return `${m},$self.makeInfoElements(${component},${props})`;
                    }
                },
                {
                    match: /copyValue:\i\.join\(" "\)/g,
                    replace: "$& + $self.getInfoString()"
                }
            ]
        },
        {
            find: ".buildLayout().map",
            replacement: {
                match: /(\i)\.buildLayout\(\)(?=\.map)/,
                replace: "$self.buildLayout($1)"
            }
        },
        {
            find: "getWebUserSettingFromSection",
            replacement: {
                match: /new Map\(\[(?=\[.{0,10}\.ACCOUNT,.{0,10}\.ACCOUNT_PANEL)/,
                replace: "new Map([...$self.getSettingsSectionMappings(),"
            }
        }
    ],

    buildEntry(options: EntryOptions): SettingsLayoutNode {
        const { key, title, panelTitle = title, Component, Icon } = options;
        const SafeComponent = typeof Component === "function"
            ? Component
            : (() => null) as ComponentType<{}>;
        const SafeIcon = typeof Icon === "function"
            ? Icon
            : PlaceholderIcon;

        if (SafeComponent !== Component || SafeIcon !== Icon) {
            logger.warn("Skipping invalid settings entry component/icon", { key, title });
        }

        const panel: SettingsLayoutNode = {
            key: key + "_panel",
            type: LayoutTypes.PANEL,
            useTitle: () => panelTitle,
            buildLayout: () => [{
                type: LayoutTypes.CATEGORY,
                key: key + "_category",
                buildLayout: () => [{
                    type: LayoutTypes.CUSTOM,
                    key: key + "_custom",
                    Component: SafeComponent,
                    useSearchTerms: () => [title]
                }]
            }]
        };

        return ({
            key,
            type: LayoutTypes.SIDEBAR_ITEM,
            useTitle: () => title,
            icon: () => <SafeIcon width={20} height={20} />,
            buildLayout: () => [panel]
        });
    },

    getSettingsSectionMappings() {
        return settingsSectionMap;
    },

    buildLayout(originalLayoutBuilder: SettingsLayoutBuilder) {
        const layout = originalLayoutBuilder.buildLayout();
        if (originalLayoutBuilder.key !== "$Root") return layout;
        if (!Array.isArray(layout)) return layout;

        if (layout.some(s => s?.key === "vencord_section")) return layout;

        const { buildEntry } = this;

        const vencordEntries: SettingsLayoutNode[] = [
            buildEntry({
                key: "vencord_main",
                title: "ReCord",
                panelTitle: "ReCord Settings",
                Component: ReCordTab,
                Icon: MainSettingsIcon
            }),
            buildEntry({
                key: "vencord_plugins",
                title: "Plugins",
                Component: PluginsTab,
                Icon: PluginsIcon
            }),
            buildEntry({
                key: "vencord_themes",
                title: "Themes",
                Component: ThemesTab,
                Icon: PaintbrushIcon
            }),
            !IS_UPDATER_DISABLED && UpdaterTab && buildEntry({
                key: "vencord_updater",
                title: "Updater",
                panelTitle: "ReCord Updater",
                Component: UpdaterTab,
                Icon: UpdaterIcon
            }),
            buildEntry({
                key: "vencord_cloud",
                title: "Cloud",
                panelTitle: "ReCord Cloud",
                Component: CloudTab,
                Icon: CloudIcon
            }),
            buildEntry({
                key: "vencord_backup_restore",
                title: "Backup & Restore",
                Component: BackupAndRestoreTab,
                Icon: BackupRestoreIcon
            }),
            buildEntry({
                key: "vencord_console",
                title: "Console",
                panelTitle: "ReCord Console",
                Component: ConsoleTab,
                Icon: NotesIcon
            }),
            buildEntry({
                key: "vencord_account_center",
                title: "Account Center",
                panelTitle: "Account Center",
                Component: AccountCenterTab,
                Icon: CogWheel
            }),
            buildEntry({
                key: "vencord_ghost_chats",
                title: "Ghost Chats",
                panelTitle: "Ghost Chats",
                Component: GhostChatsTab,
                Icon: LogIcon
            }),
            buildEntry({
                key: "vencord_opsec",
                title: "OPSEC",
                panelTitle: "OPSEC Tools",
                Component: OpsecTab,
                Icon: SafetyIcon
            }),
            buildEntry({
                key: "vencord_performance",
                title: "Performance",
                panelTitle: "ReCord Performance",
                Component: PerformanceTab,
                Icon: UpdaterIcon
            }),
            buildEntry({
                key: "vencord_voice",
                title: "Voice",
                panelTitle: "Voice Settings",
                Component: VoiceTab,
                Icon: Microphone
            }),
            buildEntry({
                key: "vencord_modules",
                title: "Modules",
                panelTitle: "ReCord Modules",
                Component: ModulesTab,
                Icon: PluginsIcon
            }),
            buildEntry({
                key: "vencord_downloads",
                title: "Downloads",
                panelTitle: "Download History",
                Component: DownloadsTab,
                Icon: CloudIcon
            }),
            isPluginEnabled("CustomRPC") && buildEntry({
                key: "vencord_custom_rpc",
                title: "CustomRPC",
                panelTitle: "CustomRPC Studio",
                Component: CustomRpcTab,
                Icon: NotesIcon
            }),
            IS_DEV && PatchHelperTab && buildEntry({
                key: "vencord_patch_helper",
                title: "Patch Helper",
                Component: PatchHelperTab,
                Icon: PatchHelperIcon
            }),
            ...this.customEntries.map(buildEntry),
            // TODO: Remove deprecated customSections in a future update
            ...this.customSections.map((func, i) => {
                const { section, element, label } = func(FallbackSectionTypes);
                if (Object.values(FallbackSectionTypes).includes(section)) return null;

                return buildEntry({
                    key: `vencord_deprecated_custom_${section}`,
                    title: label,
                    Component: element,
                    Icon: section === "Vesktop" ? VesktopSettingsIcon : PlaceholderIcon
                });
            })
        ].filter(isTruthy);

        const vencordSection: SettingsLayoutNode = {
            key: "vencord_section",
            type: LayoutTypes.SECTION,
            useTitle: () => "ReCord Settings",
            buildLayout: () => vencordEntries
        };

        const { settingsLocation } = settings.store;

        const places: Record<SettingsLocation, string> = {
            top: "user_section",
            aboveNitro: "billing_section",
            belowNitro: "billing_section",
            aboveActivity: "activity_section",
            belowActivity: "activity_section",
            bottom: "logout_section"
        };

        const key = places[settingsLocation] ?? places.top;
        let idx = layout.findIndex(s => typeof s?.key === "string" && s.key === key);

        if (idx === -1) {
            idx = 2;
        } else if (settingsLocation.startsWith("below")) {
            idx += 1;
        }

        layout.splice(idx, 0, vencordSection);

        return layout;
    },

    /** @deprecated Use customEntries */
    customSections: [] as ((SectionTypes: SectionTypes) => any)[],
    customEntries: [] as EntryOptions[],

    get electronVersion() {
        return VencordNative.native.getVersions().electron || window.legcord?.electron || null;
    },

    get chromiumVersion() {
        try {
            return VencordNative.native.getVersions().chrome
                // @ts-expect-error Typescript will add userAgentData IMMEDIATELY
                || navigator.userAgentData?.brands?.find(b => b.brand === "Chromium" || b.brand === "Google Chrome")?.version
                || null;
        } catch { // inb4 some stupid browser throws unsupported error for navigator.userAgentData, it's only in chromium
            return null;
        }
    },

    get additionalInfo() {
        if (IS_DEV) return " (Dev)";
        if (IS_WEB) return " (Web)";
        if (IS_VESKTOP) return ` (Vesktop v${VesktopNative.app.getVersion()})`;
        if (IS_STANDALONE) return " (Standalone)";
        return "";
    },

    getInfoRows() {
        const { electronVersion, chromiumVersion, additionalInfo } = this;

        const rows = [`ReCord ${gitHash}${additionalInfo}`];

        if (electronVersion) rows.push(`Electron ${electronVersion}`);
        if (chromiumVersion) rows.push(`Chromium ${chromiumVersion}`);

        return rows;
    },

    getInfoString() {
        return "\n" + this.getInfoRows().join("\n");
    },

    makeInfoElements(Component: ComponentType<PropsWithChildren>, props: PropsWithChildren) {
        return this.getInfoRows().map((text, i) =>
            <Component key={i} {...props}>{text}</Component>
        );
    }
});
