/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import { buildPluginMenuEntries, buildThemeMenuEntries } from "@plugins/vencordToolbox/menu";
import { Devs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { findCssClassesLazy } from "@webpack";
import { ComponentDispatch, FocusLock, Menu, useEffect, useRef } from "@webpack/common";
import type { HTMLAttributes, ReactNode } from "react";

import fullHeightStyle from "./fullHeightContext.css?managed";

const cl = classNameFactory("");
const Classes = findCssClassesLazy("animating", "baseLayer", "bg", "layer", "layers");

const settings = definePluginSettings({
    disableFade: {
        description: "Disable the crossfade animation",
        type: OptionType.BOOLEAN,
        default: false,
        restartNeeded: true
    },
    organizeMenu: {
        description: "Organizes the settings cog context menu into categories",
        type: OptionType.BOOLEAN,
        default: false,
        restartNeeded: true
    },
    eagerLoad: {
        description: "Removes the loading delay when opening the menu for the first time",
        type: OptionType.BOOLEAN,
        default: false,
        restartNeeded: true
    }
});

interface LayerProps extends HTMLAttributes<HTMLDivElement> {
    mode: "SHOWN" | "HIDDEN";
    baseLayer?: boolean;
}

function Layer({ mode, baseLayer = false, ...props }: LayerProps) {
    const hidden = mode === "HIDDEN";
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => () => {
        ComponentDispatch.dispatch("LAYER_POP_START");
        ComponentDispatch.dispatch("LAYER_POP_COMPLETE");
    }, []);

    const node = (
        <div
            ref={containerRef}
            aria-hidden={hidden}
            className={cl({
                [Classes.layer]: true,
                [Classes.baseLayer]: baseLayer,
                "stop-animations": hidden
            })}
            style={{ opacity: hidden ? 0 : undefined }}
            {...props}
        />
    );

    return baseLayer
        ? node
        : <FocusLock containerRef={containerRef}>{node}</FocusLock>;
}

export default definePlugin({
    name: "BetterSettings",
    description: "Enhances your settings-menu-opening experience",
    authors: [Devs.Kyuuhachi],
    settings,

    start() {
        // Temporary safety fallback: these patches have been a frequent source of crashes
        // when Discord changes internals around settings/profile surfaces.
        settings.store.disableFade = false;
        settings.store.organizeMenu = false;
        settings.store.eagerLoad = false;

        disableStyle(fullHeightStyle);
    },

    stop() {
        disableStyle(fullHeightStyle);
    },

    patches: [],

    // This is the very outer layer of the entire ui, so we can't wrap this in an ErrorBoundary
    // without possibly also catching unrelated errors of children.
    //
    // Thus, we sanity check webpack modules
    Layer(props: LayerProps) {
        try {
            [FocusLock.$$vencordGetWrappedComponent(), ComponentDispatch, Classes.layer].forEach(e => e.test);
        } catch {
            new Logger("BetterSettings").error("Failed to find some components");
            return props.children;
        }

        return <Layer {...props} />;
    },

    transformSettingsEntries(list) {
        const items: ReactNode[] = [];

        if (!Array.isArray(list)) {
            return items;
        }

        for (const item of list) {
            if (!item || typeof item !== "object") {
                continue;
            }

            try {
                const { key, props } = item;
                if (!props || typeof key !== "string") {
                    items.push(item);
                    continue;
                }

                if (key === "vencord_plugins" || key === "vencord_themes") {
                    const children = key === "vencord_plugins"
                        ? buildPluginMenuEntries()
                        : buildThemeMenuEntries();

                    items.push(
                        <Menu.MenuItem key={key} label={props.label} id={props.label} {...props}>
                            {children}
                        </Menu.MenuItem>
                    );
                } else if (key.endsWith("_section") && props.label) {
                    items.push(
                        <Menu.MenuItem key={key} label={props.label} id={props.label}>
                            {this.transformSettingsEntries(props.children)}
                        </Menu.MenuItem>
                    );
                } else {
                    items.push(item);
                }
            } catch (error) {
                new Logger("BetterSettings").error("Failed to transform a settings entry", error);
                items.push(item);
            }
        }

        return items;
    }
});
