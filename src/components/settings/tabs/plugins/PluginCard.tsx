/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotice } from "@api/Notices";
import { isPluginEnabled, pluginRequiresRestart, startDependenciesRecursive, startPlugin, stopPlugin } from "@api/PluginManager";
import { CogWheel, InfoIcon } from "@components/Icons";
import { AddonCard } from "@components/settings/AddonCard";
import { isObjectEmpty } from "@utils/misc";
import { Plugin } from "@utils/types";
import { React, showToast, Toasts } from "@webpack/common";
import { Settings } from "Vencord";

import { cl, logger } from ".";
import { openPluginModal } from "./PluginModal";

interface PluginCardProps extends React.HTMLProps<HTMLDivElement> {
    plugin: Plugin;
    disabled: boolean;
    onRestartNeeded(name: string, key: string): void;
    isNew?: boolean;
}

const RECORD_ICON = "vencord://assets/icon.png";
const EQUICORD_ICON = "https://github.com/Equicord/Equibored/blob/main/icons/equicord/icon.png?raw=1";
const VENCORD_ICON = "https://raw.githubusercontent.com/Vendicated/Vencord/main/browser/icon.png";

function toSafeLower(value: unknown) {
    return typeof value === "string" ? value.toLowerCase() : "";
}

function hasEquicordMarker(plugin: Plugin) {
    const name = toSafeLower((plugin as any)?.name);
    const desc = toSafeLower((plugin as any)?.description);
    const tags = Array.isArray((plugin as any)?.tags) ? (plugin as any).tags : [];

    return name.includes("equicord")
        || desc.includes("equicord")
        || tags.some((t: unknown) => toSafeLower(t).includes("equicord"));
}

function isReCordPlugin(plugin: Plugin) {
    if (hasEquicordMarker(plugin)) return false;

    const name = toSafeLower((plugin as any)?.name);
    const desc = toSafeLower((plugin as any)?.description);
    const tags = Array.isArray((plugin as any)?.tags) ? (plugin as any).tags : [];
    const authors = Array.isArray((plugin as any)?.authors) ? (plugin as any).authors : [];

    if (name.includes("record") || name.includes("re-cord")) return true;
    if (desc.includes("record") || desc.includes("re-cord")) return true;
    if (tags.some((t: unknown) => toSafeLower(t).includes("record") || toSafeLower(t).includes("re-cord"))) return true;
    if (authors.some((a: any) => toSafeLower(a?.name).includes("record") || toSafeLower(a?.name).includes("rloxx") || toSafeLower(a?.name).includes("influence"))) return true;

    return false;
}

function isEquicordPlugin(plugin: Plugin) {
    return hasEquicordMarker(plugin);
}

export function PluginCard({ plugin, disabled, onRestartNeeded, onMouseEnter, onMouseLeave, isNew }: PluginCardProps) {
    const settings = Settings.plugins[plugin.name] ?? (Settings.plugins[plugin.name] = { enabled: isPluginEnabled(plugin.name) } as any);
    const source = isReCordPlugin(plugin)
        ? { label: "ReCord", className: "record" as const }
        : isEquicordPlugin(plugin)
            ? { label: "Equicord", className: "equicord" as const }
            : { label: "Vencord", className: "vencord" as const };

    const sourceBadge = (
        <span className={cl("source-badge", source.className)} title={source.label}>
            {source.className === "record"
                ? <img src={RECORD_ICON} alt="ReCord source" width={14} height={14} />
                : source.className === "equicord"
                    ? <img src={EQUICORD_ICON} alt="Equicord source" width={14} height={14} />
                : <img src={VENCORD_ICON} alt="Vencord source" width={14} height={14} />
            }
        </span>
    );

    const isEnabled = () => isPluginEnabled(plugin.name);

    function toggleEnabled() {
        const wasEnabled = isEnabled();

        // If we're enabling a plugin, make sure all deps are enabled recursively.
        if (!wasEnabled) {
            const { restartNeeded, failures } = startDependenciesRecursive(plugin);

            if (failures.length) {
                logger.error(`Failed to start dependencies for ${plugin.name}: ${failures.join(", ")}`);
                showNotice("Failed to start dependencies: " + failures.join(", "), "Close", () => null);
                return;
            }

            if (restartNeeded) {
                // If any dependencies have patches, don't start the plugin yet.
                settings.enabled = true;
                onRestartNeeded(plugin.name, "enabled");
                return;
            }
        }

        // if the plugin requires a restart, don't use stopPlugin/startPlugin. Wait for restart to apply changes.
        if (pluginRequiresRestart(plugin)) {
            settings.enabled = !wasEnabled;
            onRestartNeeded(plugin.name, "enabled");
            return;
        }

        // If the plugin is enabled, but hasn't been started, then we can just toggle it off.
        if (wasEnabled && !plugin.started) {
            settings.enabled = !wasEnabled;
            return;
        }

        const result = wasEnabled ? stopPlugin(plugin) : startPlugin(plugin);

        if (!result) {
            settings.enabled = false;

            const msg = `Error while ${wasEnabled ? "stopping" : "starting"} plugin ${plugin.name}`;
            showToast(msg, Toasts.Type.FAILURE, {
                position: Toasts.Position.BOTTOM,
            });

            return;
        }

        settings.enabled = !wasEnabled;
    }

    return (
        <AddonCard
            name={plugin.name}
            description={plugin.description}
            isNew={isNew}
            enabled={isEnabled()}
            setEnabled={toggleEnabled}
            disabled={disabled}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            infoButton={
                <div className={cl("info-group")}>
                    {sourceBadge}
                    <button
                        role="switch"
                        onClick={() => openPluginModal(plugin, onRestartNeeded)}
                        className={cl("info-button")}
                    >
                        {plugin.options && !isObjectEmpty(plugin.options)
                            ? <CogWheel className={cl("info-icon")} />
                            : <InfoIcon className={cl("info-icon")} />
                        }
                    </button>
                </div>
            } />
    );
}
