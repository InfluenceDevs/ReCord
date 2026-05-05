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
    name: "EquiLenny",
    description: "Send a lenny face command quickly",
    authors: [Devs.Rloxx],
    tags: ["Chat", "Fun", "Equicord"],
    icon: EQUICORD_ICON,
    dependencies: ["CommandsAPI"],
    commands: [{
        name: "equilenny",
        description: "Send ( ͡° ͜ʖ ͡°)",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_, ctx) => sendBotMessage(ctx.channel.id, { content: "( ͡° ͜ʖ ͡°)" })
    }]
});
