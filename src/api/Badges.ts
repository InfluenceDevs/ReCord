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

import ErrorBoundary from "@components/ErrorBoundary";
import BadgeAPIPlugin from "@plugins/_api/badges";
import { Logger } from "@utils/Logger";
import { ComponentType, HTMLProps } from "react";

const logger = new Logger("Badges");

export const enum BadgePosition {
    START,
    END
}

export interface ProfileBadge {
    /** The tooltip to show on hover. Required for image badges */
    description?: string;
    /** Custom component for the badge (tooltip not included) */
    component?: ComponentType<ProfileBadge & BadgeUserArgs>;
    /** The custom image to use */
    iconSrc?: string;
    link?: string;
    /** Action to perform when you click the badge */
    onClick?(event: React.MouseEvent, props: ProfileBadge & BadgeUserArgs): void;
    /** Action to perform when you right click the badge */
    onContextMenu?(event: React.MouseEvent, props: BadgeUserArgs & BadgeUserArgs): void;
    /** Should the user display this badge? */
    shouldShow?(userInfo: BadgeUserArgs): boolean;
    /** Optional props (e.g. style) for the badge, ignored for component badges */
    props?: HTMLProps<HTMLImageElement>;
    /** Insert at start or end? */
    position?: BadgePosition;
    /** The badge name to display, Discord uses this. Required for component badges */
    key?: string;

    /**
     * Allows dynamically returning multiple badges.
     * Must not call hooks
     */
    getBadges?(userInfo: BadgeUserArgs): ProfileBadge[];
}

const Badges = new Set<ProfileBadge>();

/**
 * Register a new badge with the Badges API
 * @param badge The badge to register
 */
export function addProfileBadge(badge: ProfileBadge) {
    badge.component &&= ErrorBoundary.wrap(badge.component, { noop: true });
    Badges.add(badge);
}

/**
 * Unregister a badge from the Badges API
 * @param badge The badge to remove
 */
export function removeProfileBadge(badge: ProfileBadge) {
    return Badges.delete(badge);
}

/**
 * Inject badges into the profile badges array.
 * You probably don't need to use this.
 */
export function _getBadges(args: BadgeUserArgs) {
    const badges = [] as ProfileBadge[];
    for (const badge of Badges) {
        try {
            if (badge.shouldShow && !badge.shouldShow(args)) {
                continue;
            }

            const generatedBadges = badge.getBadges?.(args);
            const b = Array.isArray(generatedBadges)
                ? generatedBadges
                    .filter((badge): badge is ProfileBadge => Boolean(badge && typeof badge === "object"))
                    .map(badge => ({
                        ...args,
                        ...badge,
                        component: typeof badge.component === "function"
                            ? ErrorBoundary.wrap(badge.component, { noop: true })
                            : undefined
                    }))
                : [{ ...args, ...badge }];

            if (badge.position === BadgePosition.START) {
                badges.unshift(...b);
            } else {
                badges.push(...b);
            }
        } catch (error) {
            logger.error("Failed to resolve a profile badge", error);
        }
    }

    try {
        const donorBadges = BadgeAPIPlugin.getDonorBadges(args.userId);
        if (Array.isArray(donorBadges) && donorBadges.length) {
            badges.unshift(
                ...donorBadges.map(badge => ({
                    ...args,
                    ...badge,
                }))
            );
        }
    } catch (error) {
        logger.error("Failed to resolve donor badges", error);
    }

    return badges.filter(badge => {
        if (badge.component) return true;

        const src = typeof badge.iconSrc === "string"
            ? badge.iconSrc.trim()
            : "";
        if (!src || src === "undefined" || src.endsWith("/undefined.png")) {
            return false;
        }

        return true;
    });
}

export interface BadgeUserArgs {
    userId: string;
    guildId: string;
}
