/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings, SettingsStore } from "@api/Settings";
import { coreStyleRootNode } from "@api/Styles";
import { createAndAppendStyle } from "@utils/css";

const STYLE_ID = "record-performance-mode";

let isInitialized = false;
let styleNode: HTMLStyleElement | null = null;

let originalRaf: typeof requestAnimationFrame | null = null;
let originalCancelRaf: typeof cancelAnimationFrame | null = null;

function clampBackgroundFps(value: number) {
    if (!Number.isFinite(value)) return 8;
    return Math.min(30, Math.max(1, Math.floor(value)));
}

function getEffectiveSettings() {
    const perf = Settings.performance;
    const enabled = !!perf.enabled;

    return {
        enabled,
        disableAnimations: enabled && !!perf.disableAnimations,
        reduceBackdropBlur: enabled && !!perf.reduceBackdropBlur,
        disableVisualFlair: enabled && !!perf.disableVisualFlair,
        disableShadows: enabled && !!perf.disableShadows,
        disableGradients: enabled && !!perf.disableGradients,
        disableHoverAnimations: enabled && !!perf.disableHoverAnimations,
        hideTypingIndicators: enabled && !!perf.hideTypingIndicators,
        hideActivityCards: enabled && !!perf.hideActivityCards,
        hideProfilePanels: enabled && !!perf.hideProfilePanels,
        hideGuildBoostEffects: enabled && !!perf.hideGuildBoostEffects,
        hideStickersAndGifPreviews: enabled && !!perf.hideStickersAndGifPreviews,
        compactChannelList: enabled && !!perf.compactChannelList,
        compactMemberList: enabled && !!perf.compactMemberList,
        compactChatDensity: enabled && !!perf.compactChatDensity,
        preferStaticAvatars: enabled && !!perf.preferStaticAvatars,
        pauseHiddenMedia: enabled && !!perf.pauseHiddenMedia,
        pauseHiddenAudio: enabled && !!perf.pauseHiddenAudio,
        keepOnlyVisibleVideos: enabled && !!perf.keepOnlyVisibleVideos,
        limitBackgroundFps: enabled && !!perf.limitBackgroundFps,
        backgroundFps: clampBackgroundFps(perf.backgroundFps)
    };
}

function ensureStyleNode() {
    styleNode ??= createAndAppendStyle(STYLE_ID, coreStyleRootNode);
    return styleNode;
}

function applyCssTweaks() {
    const cfg = getEffectiveSettings();
    const css: string[] = [];

    if (cfg.disableAnimations) {
        css.push("*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;}");
    }

    if (cfg.reduceBackdropBlur) {
        css.push("*,*::before,*::after{backdrop-filter:none!important;filter:none!important;}");
    }

    if (cfg.disableVisualFlair) {
        css.push(".avatarDecoration-2Wb1Au,.profileEffects-8u-zj5,[class*=profileEffects],[class*=avatarDecoration],[class*=shine],[class*=sparkle]{display:none!important;}");
        css.push("[class*=mask], [class*=gradient], [class*=effects], [class*=glow]{box-shadow:none!important;text-shadow:none!important;}");
    }

    if (cfg.disableShadows) {
        css.push("*,*::before,*::after{box-shadow:none!important;text-shadow:none!important;}");
    }

    if (cfg.disableGradients) {
        css.push("*,*::before,*::after{background-image:none!important;}");
    }

    if (cfg.disableHoverAnimations) {
        css.push("*:hover,*:focus{transition:none!important;animation:none!important;}");
    }

    if (cfg.hideTypingIndicators) {
        css.push("[class*=typing], [class*=dots], [class*=chatTyping]{display:none!important;}");
    }

    if (cfg.hideActivityCards) {
        css.push("[class*=activityPanel], [class*=activityUser], [class*=activityFeed], [class*=activityNow]{display:none!important;}");
    }

    if (cfg.hideProfilePanels) {
        css.push("[class*=profilePanel],[class*=userPanelOverlay],[class*=memberProfile],[class*=userPopoutOverlayBackground]{display:none!important;}");
    }

    if (cfg.hideGuildBoostEffects) {
        css.push("[class*=guildBoost],[class*=premiumTier],[class*=collectibles], [class*=burstGlow]{display:none!important;}");
    }

    if (cfg.hideStickersAndGifPreviews) {
        css.push("[class*=stickerInspected], [class*=gifPicker], [class*=stickerPicker], [class*=expressionPicker] [class*=preview]{display:none!important;}");
    }

    if (cfg.compactChannelList) {
        css.push("[class*=sidebar] [class*=containerDefault], [class*=sidebar] [class*=channel]{padding-top:1px!important;padding-bottom:1px!important;min-height:22px!important;}");
    }

    if (cfg.compactMemberList) {
        css.push("[class*=membersWrap] [class*=member], [class*=membersWrap] [class*=layout]{min-height:30px!important;padding-top:1px!important;padding-bottom:1px!important;}");
    }

    if (cfg.compactChatDensity) {
        css.push("[class*=messageListItem], [class*=message], [class*=cozyMessage]{padding-top:2px!important;padding-bottom:2px!important;margin-top:0!important;margin-bottom:0!important;}");
    }

    if (cfg.preferStaticAvatars) {
        css.push("img[src*=\".gif\"],video[poster]{image-rendering:auto!important;filter:none!important;}");
    }

    const node = ensureStyleNode();
    node.textContent = css.join("\n");
}

function isElementMostlyVisible(el: Element) {
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;

    const x = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
    const y = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    const visibleArea = x * y;
    const totalArea = Math.max(1, rect.width * rect.height);

    return visibleArea / totalArea >= 0.35;
}

function applyBackgroundFrameLimiter() {
    const cfg = getEffectiveSettings();

    if (!cfg.limitBackgroundFps) {
        if (originalRaf) {
            window.requestAnimationFrame = originalRaf;
            if (originalCancelRaf) window.cancelAnimationFrame = originalCancelRaf;
            originalRaf = null;
            originalCancelRaf = null;
        }
        return;
    }

    if (!originalRaf) {
        originalRaf = window.requestAnimationFrame.bind(window);
        originalCancelRaf = window.cancelAnimationFrame.bind(window);
    }

    const frameMs = Math.max(1, Math.floor(1000 / cfg.backgroundFps));

    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
        if (document.hidden) {
            return window.setTimeout(() => cb(performance.now()), frameMs) as unknown as number;
        }

        return originalRaf!(cb);
    }) as typeof requestAnimationFrame;
}

function pauseMediaIfHidden() {
    const cfg = getEffectiveSettings();
    if (!cfg.pauseHiddenMedia && !cfg.pauseHiddenAudio && !cfg.keepOnlyVisibleVideos) return;

    for (const media of document.querySelectorAll("video,audio")) {
        const element = media as HTMLMediaElement;
        const isVideo = element instanceof HTMLVideoElement;

        const shouldPauseHiddenVideo = cfg.pauseHiddenMedia && document.hidden && isVideo;
        const shouldPauseHiddenAudio = cfg.pauseHiddenAudio && document.hidden && !isVideo;
        const shouldPauseOffscreenVideo = cfg.keepOnlyVisibleVideos && isVideo && !isElementMostlyVisible(element);

        if (!shouldPauseHiddenVideo && !shouldPauseHiddenAudio && !shouldPauseOffscreenVideo) continue;
        if (element.paused) continue;

        try {
            element.pause();
        } catch {
            // noop
        }
    }
}

function applyPerformanceTweaks() {
    applyCssTweaks();
    applyBackgroundFrameLimiter();
    pauseMediaIfHidden();
}

export function initPerformanceMode() {
    if (isInitialized) return;
    isInitialized = true;

    applyPerformanceTweaks();

    SettingsStore.addPrefixChangeListener("performance", () => {
        applyPerformanceTweaks();
    });

    document.addEventListener("visibilitychange", () => {
        pauseMediaIfHidden();
    });
}
