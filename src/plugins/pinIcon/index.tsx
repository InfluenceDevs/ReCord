/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";

const EQUICORD_ICON = "https://github.com/Equicord/Equibored/blob/main/icons/equicord/icon.png?raw=1";
const PinIcon = findComponentByCodeLazy("1-.06-.63L6.16");

export default definePlugin({
    name: "PinIcon",
    description: "Adds a pin icon to pinned messages",
    tags: ["Appearance", "Chat", "Equicord"],
    authors: [Devs.Rloxx],
    icon: EQUICORD_ICON,

    patches: [
        {
            find: "isUnsupported})",
            replacement: {
                match: /WITH_CONTENT\}\)/,
                replace: "$&,$self.renderPinIcon(arguments[0].message)"
            }
        }
    ],

    renderPinIcon: ErrorBoundary.wrap((message: any) => {
        if (!message?.pinned || !PinIcon) return null;

        return (
            <PinIcon
                size="xs"
                style={{
                    position: "absolute",
                    right: "0",
                    top: "0"
                }}
            />
        );
    }, { noop: true })
});
