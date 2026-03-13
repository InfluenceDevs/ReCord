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

import "./styles.css";

import * as DataStore from "@api/DataStore";
import { isPluginEnabled } from "@api/PluginManager";
import { useSettings } from "@api/Settings";
import { Card } from "@components/Card";
import { Divider } from "@components/Divider";
import ErrorBoundary from "@components/ErrorBoundary";
import { HeadingTertiary } from "@components/Heading";
import { FolderIcon, RestartIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { QuickAction, QuickActionCard } from "@components/settings/QuickAction";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { ChangeList } from "@utils/ChangeList";
import { classNameFactory } from "@utils/css";
import { isTruthy } from "@utils/guards";
import { Logger } from "@utils/Logger";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { useAwaiter, useCleanupEffect } from "@utils/react";
import { Alerts, Button, lodash, Parser, React, Select, TextInput, Tooltip, useMemo, useState } from "@webpack/common";
import { JSX } from "react";

import Plugins, { ExcludedPlugins, PluginMeta } from "~plugins";

import { PluginCard } from "./PluginCard";
import { UIElementsButton } from "./UIElements";

export const cl = classNameFactory("vc-plugins-");
export const logger = new Logger("PluginSettings", "#a6d189");

function ReloadRequiredCard({ required }: { required: boolean; }) {
    return (
        <Card variant={required ? "warning" : "normal"} className={cl("info-card")}>
            {required
                ? (
                    <>
                        <HeadingTertiary>Restart required!</HeadingTertiary>
                        <Paragraph className={cl("dep-text")}>
                            Restart now to apply new plugins and their settings
                        </Paragraph>
                        <Button onClick={() => location.reload()} className={cl("restart-button")}>
                            Restart
                        </Button>
                    </>
                )
                : (
                    <>
                        <HeadingTertiary>Plugin Management</HeadingTertiary>
                        <Paragraph>Press the cog wheel or info icon to get more info on a plugin</Paragraph>
                        <Paragraph>Plugins with a cog wheel have settings you can modify!</Paragraph>
                    </>
                )}
        </Card>
    );
}

const enum SearchStatus {
    ALL,
    ENABLED,
    DISABLED,
    NEW,
    USER_PLUGINS,
    API_PLUGINS
}

function ExcludedPluginsList({ search }: { search: string; }) {
    const matchingExcludedPlugins = search
        ? Object.entries(ExcludedPlugins)
            .filter(([name]) => name.toLowerCase().includes(search))
        : [];

    const ExcludedReasons: Record<"web" | "discordDesktop" | "vesktop" | "desktop" | "dev", string> = {
        desktop: "Discord Desktop app or Vesktop",
        discordDesktop: "Discord Desktop app",
        vesktop: "Vesktop app",
        web: "Vesktop app and the Web version of Discord",
        dev: "Developer version of ReCord"
    };

    return (
        <Paragraph className={Margins.top16}>
            {matchingExcludedPlugins.length
                ? <>
                    <Paragraph>Are you looking for:</Paragraph>
                    <ul>
                        {matchingExcludedPlugins.map(([name, reason]) => (
                            <li key={name}>
                                <b>{name}</b>: Only available on the {ExcludedReasons[reason]}
                            </li>
                        ))}
                    </ul>
                </>
                : "No plugins meet the search criteria."
            }
        </Paragraph>
    );
}

function PluginSettings() {
    const settings = useSettings();
    const changes = useMemo(() => new ChangeList<string>(), []);

    useCleanupEffect(() => {
        if (changes.hasChanges)
            Alerts.show({
                title: "Restart required",
                body: (
                    <>
                        <p>The following plugins require a restart:</p>
                        <div>{changes.map((s, i) => (
                            <>
                                {i > 0 && ", "}
                                {Parser.parse("`" + s.split(".")[0] + "`")}
                            </>
                        ))}</div>
                    </>
                ),
                confirmText: "Restart now",
                cancelText: "Later!",
                onConfirm: () => location.reload()
            });
    }, []);

    const depMap = useMemo(() => {
        const o = {} as Record<string, string[]>;
        for (const plugin in Plugins) {
            const deps = Plugins[plugin].dependencies;
            if (deps) {
                for (const dep of deps) {
                    o[dep] ??= [];
                    o[dep].push(plugin);
                }
            }
        }
        return o;
    }, []);

    const sortedPlugins = useMemo(() =>
        Object.values(Plugins).sort((a, b) => a.name.localeCompare(b.name)),
        []
    );

    const hasUserPlugins = useMemo(() => !IS_STANDALONE && Object.values(PluginMeta).some(m => m.userPlugin), []);

    const [searchValue, setSearchValue] = useState({ value: "", status: SearchStatus.ALL });

    const search = searchValue.value.toLowerCase();
    const onSearch = (query: string) => setSearchValue(prev => ({ ...prev, value: query }));
    const onStatusChange = (status: SearchStatus) => setSearchValue(prev => ({ ...prev, status }));

    const pluginFilter = (plugin: typeof Plugins[keyof typeof Plugins]) => {
        const { status } = searchValue;
        const enabled = isPluginEnabled(plugin.name);

        switch (status) {
            case SearchStatus.DISABLED:
                if (enabled) return false;
                break;
            case SearchStatus.ENABLED:
                if (!enabled) return false;
                break;
            case SearchStatus.NEW:
                if (!newPlugins?.includes(plugin.name)) return false;
                break;
            case SearchStatus.USER_PLUGINS:
                if (!PluginMeta[plugin.name]?.userPlugin) return false;
                break;
            case SearchStatus.API_PLUGINS:
                if (!plugin.name.endsWith("API")) return false;
                break;
        }

        if (!search.length) return true;

        return (
            plugin.name.toLowerCase().includes(search) ||
            plugin.description.toLowerCase().includes(search) ||
            plugin.tags?.some(t => t.toLowerCase().includes(search))
        );
    };

    const [newPlugins] = useAwaiter(() => DataStore.get("ReCord_existingPlugins").then((cachedPlugins: Record<string, number> | undefined) => {
        const now = Date.now() / 1000;
        const existingTimestamps: Record<string, number> = {};
        const sortedPluginNames = Object.values(sortedPlugins).map(plugin => plugin.name);

        const newPlugins: string[] = [];
        for (const { name: p } of sortedPlugins) {
            const time = existingTimestamps[p] = cachedPlugins?.[p] ?? now;
            if ((time + 60 * 60 * 24 * 2) > now) {
                newPlugins.push(p);
            }
        }
        DataStore.set("ReCord_existingPlugins", existingTimestamps);

        return lodash.isEqual(newPlugins, sortedPluginNames) ? [] : newPlugins;
    }));

    const plugins = [] as JSX.Element[];
    const requiredPlugins = [] as JSX.Element[];

    const showApi = searchValue.status === SearchStatus.API_PLUGINS;
    for (const p of sortedPlugins) {
        if (p.hidden || (!p.options && p.name.endsWith("API") && !showApi))
            continue;

        if (!pluginFilter(p)) continue;

        const isRequired = p.required || p.isDependency || depMap[p.name]?.some(d => settings.plugins[d].enabled);

        if (isRequired) {
            const tooltipText = p.required || !depMap[p.name]
                ? "This plugin is required for ReCord to function."
                : makeDependencyList(depMap[p.name]?.filter(d => settings.plugins[d].enabled));

            requiredPlugins.push(
                <Tooltip text={tooltipText} key={p.name}>
                    {({ onMouseLeave, onMouseEnter }) => (
                        <PluginCard
                            onMouseLeave={onMouseLeave}
                            onMouseEnter={onMouseEnter}
                            onRestartNeeded={(name, key) => changes.handleChange(`${name}.${key}`)}
                            disabled={true}
                            plugin={p}
                            key={p.name}
                        />
                    )}
                </Tooltip>
            );
        } else {
            plugins.push(
                <PluginCard
                    onRestartNeeded={(name, key) => changes.handleChange(`${name}.${key}`)}
                    disabled={false}
                    plugin={p}
                    isNew={newPlugins?.includes(p.name)}
                    key={p.name}
                />
            );
        }
    }

    return (
        <SettingsTab>
            <ReloadRequiredCard required={changes.hasChanges} />

            <UIElementsButton />

            <HeadingTertiary className={classes(Margins.top20, Margins.bottom8)}>
                Filters
            </HeadingTertiary>

            <div className={classes(Margins.bottom20, cl("filter-controls"))}>
                <ErrorBoundary noop>
                    <TextInput autoFocus value={searchValue.value} placeholder="Search for a plugin..." onChange={onSearch} />
                </ErrorBoundary>
                <div>
                    <ErrorBoundary noop>
                        <Select
                            options={[
                                { label: "Show All", value: SearchStatus.ALL, default: true },
                                { label: "Show Enabled", value: SearchStatus.ENABLED },
                                { label: "Show Disabled", value: SearchStatus.DISABLED },
                                { label: "Show New", value: SearchStatus.NEW },
                                hasUserPlugins && { label: "Show UserPlugins", value: SearchStatus.USER_PLUGINS },
                                { label: "Show API Plugins", value: SearchStatus.API_PLUGINS },
                            ].filter(isTruthy)}
                            serialize={String}
                            select={onStatusChange}
                            isSelected={v => v === searchValue.status}
                            closeOnSelect={true}
                        />
                    </ErrorBoundary>
                </div>
            </div>

            <HeadingTertiary className={Margins.top20}>Plugins</HeadingTertiary>

            {plugins.length || requiredPlugins.length
                ? (
                    <div className={cl("grid")}>
                        {plugins.length
                            ? plugins
                            : <Paragraph>No plugins meet the search criteria.</Paragraph>
                        }
                    </div>
                )
                : <ExcludedPluginsList search={search} />
            }


            <Divider className={Margins.top20} />

            <HeadingTertiary className={classes(Margins.top20, Margins.bottom8)}>
                Required Plugins
            </HeadingTertiary>
            <div className={cl("grid")}>
                {requiredPlugins.length
                    ? requiredPlugins
                    : <Paragraph>No plugins meet the search criteria.</Paragraph>
                }
            </div>

            <CustomPluginsSection />
        </SettingsTab >
    );
}

function CustomPluginsSection() {
    const [installedPlugins, setInstalledPlugins] = React.useState<string[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [dragOver, setDragOver] = React.useState(false);
    const filePickerRef = React.useRef<HTMLInputElement>(null);

    const bdNative = (VencordNative.pluginHelpers as any).BetterDiscordCompat;
    const bdPlugin = (Vencord.Plugins.plugins as any).BetterDiscordCompat;

    const refresh = React.useCallback(async () => {
        if (IS_WEB || !bdNative?.listPluginFiles) return;
        setLoading(true);
        try {
            const files = await bdNative.listPluginFiles();
            setInstalledPlugins(Array.isArray(files) ? files : []);
        } finally { setLoading(false); }
    }, [bdNative]);

    React.useEffect(() => { refresh(); }, [refresh]);

    const uploadFiles = React.useCallback(async (fileList: FileList | null) => {
        if (!fileList?.length || !bdNative?.uploadPluginFile) return;
        for (const file of Array.from(fileList)) {
            const content = await file.text();
            await bdNative.uploadPluginFile(file.name, content);
        }
        await bdPlugin?.reloadPlugins?.();
        await refresh();
    }, [bdNative, bdPlugin, refresh]);

    const handleInputChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        uploadFiles(e.target.files);
        e.target.value = "";
    }, [uploadFiles]);

    const handleDrop = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(false);
        uploadFiles(e.dataTransfer.files);
    }, [uploadFiles]);

    const removePlugin = React.useCallback(async (fileName: string) => {
        if (!bdNative?.deletePluginFile) return;
        await bdNative.deletePluginFile(fileName);
        await bdPlugin?.reloadPlugins?.();
        await refresh();
    }, [bdNative, bdPlugin, refresh]);

    if (IS_WEB || !bdNative) return null;

    return (
        <>
            <Divider className={Margins.top20} />

            <HeadingTertiary className={classes(Margins.top20, Margins.bottom8)}>
                Custom Plugins (BetterDiscord)
            </HeadingTertiary>

            <Paragraph className={Margins.bottom8}>
                Drop <code>.js</code> / <code>.plugin.js</code> files here or use the upload button to add BetterDiscord plugins.
            </Paragraph>

            <input
                ref={filePickerRef}
                type="file"
                multiple
                accept=".js,.plugin.js"
                style={{ display: "none" }}
                onChange={handleInputChange}
            />

            <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                style={{
                    border: `2px dashed ${dragOver ? "var(--text-brand)" : "var(--border-subtle)"}`,
                    borderRadius: 8,
                    padding: "16px",
                    textAlign: "center",
                    marginBottom: 12,
                    transition: "border-color 0.15s",
                    background: dragOver ? "var(--background-modifier-hover)" : undefined
                }}
            >
                <Paragraph style={{ color: "var(--text-muted)", marginBottom: 8 }}>
                    {dragOver ? "Drop to upload" : "Drag & drop plugin files here"}
                </Paragraph>
                <Button size="small" variant="secondary" onClick={() => filePickerRef.current?.click()}>
                    Browse Files
                </Button>
            </div>

            <QuickActionCard>
                <QuickAction
                    Icon={FolderIcon}
                    text="Open BD Plugins Folder"
                    action={() => bdNative?.openPluginsDir?.()}
                />
                <QuickAction
                    Icon={RestartIcon}
                    text="Reload BD Plugins"
                    action={async () => { await bdPlugin?.reloadPlugins?.(); await refresh(); }}
                />
            </QuickActionCard>

            <HeadingTertiary className={classes(Margins.top20, Margins.bottom8)}>
                Installed ({installedPlugins.length})
            </HeadingTertiary>

            {loading && <Paragraph>Loading...</Paragraph>}
            {!loading && installedPlugins.length === 0 && (
                <Paragraph style={{ color: "var(--text-muted)" }}>No custom plugins installed yet.</Paragraph>
            )}
            {!loading && installedPlugins.length > 0 && (
                <div className={cl("grid")}>
                    {installedPlugins.map(fileName => (
                        <Card key={fileName} style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div>
                                <Paragraph style={{ fontWeight: 600, marginBottom: 2 }}>{fileName.replace(/\.plugin\.js$|\.js$/, "")}</Paragraph>
                                <Paragraph style={{ color: "var(--text-muted)", fontSize: 12 }}>{fileName}</Paragraph>
                            </div>
                            <Button size="small" variant="dangerSecondary" onClick={() => removePlugin(fileName)}>
                                Remove
                            </Button>
                        </Card>
                    ))}
                </div>
            )}
        </>
    );
}

function makeDependencyList(deps: string[]) {
    return (
        <>
            <Paragraph>This plugin is required by:</Paragraph>
            {deps.map((dep: string) => <Paragraph key={dep} className={cl("dep-text")}>{dep}</Paragraph>)}
        </>
    );
}

export default wrapTab(PluginSettings, "Plugins");
