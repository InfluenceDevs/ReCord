/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Rloxx
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addProfileBadge, BadgePosition, removeProfileBadge } from "@api/Badges";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

const OWNER_USER_ID = "260577084223520770";

// Twemoji crown emoji (👑 U+1F451) hosted on jsDelivr
const CROWN_ICON = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f451.png";

const OwnerBadge = {
    description: "ReCord Owner",
    iconSrc: CROWN_ICON,
    position: BadgePosition.START,
    props: {
        style: {
            borderRadius: "50%",
            transform: "scale(0.9)",
        }
    },
    shouldShow: ({ userId }: { userId: string }) => userId === OWNER_USER_ID,
    link: "https://github.com/InfluenceDevs/ReCord",
};

export default definePlugin({
    name: "RecordOwnerBadge",
    description: "Displays a crown badge on the ReCord owner's profile.",
    authors: [Devs.Rloxx],
    required: false,

    start() {
        addProfileBadge(OwnerBadge);
    },

    stop() {
        removeProfileBadge(OwnerBadge);
    },
});
