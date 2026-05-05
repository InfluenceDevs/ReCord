/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

const EQUICORD_ICON = "https://github.com/Equicord/Equibored/blob/main/icons/equicord/icon.png?raw=1";

export default definePlugin({
    name: "EquiShrug",
    description: "Send a shrug command quickly",
    authors: [Devs.Rloxx],
    tags: ["Chat", "Utility", "Equicord"],
    icon: EQUICORD_ICON,
    dependencies: ["CommandsAPI"],
    commands: [{
        name: "equishrug",
        description: "Send ¯\\_(ツ)_/¯",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_, ctx) => sendBotMessage(ctx.channel.id, { content: "¯\\_(ツ)_/¯" })
    }]
});
