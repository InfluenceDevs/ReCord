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
        hideTypingIndicators: enabled && !!perf.hideTypingIndicators,
        hideActivityCards: enabled && !!perf.hideActivityCards,
        compactChannelList: enabled && !!perf.compactChannelList,
        compactMemberList: enabled && !!perf.compactMemberList,
        pauseHiddenMedia: enabled && !!perf.pauseHiddenMedia,
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

    if (cfg.hideTypingIndicators) {
        css.push("[class*=typing], [class*=dots], [class*=chatTyping]{display:none!important;}");
    }

    if (cfg.hideActivityCards) {
        css.push("[class*=activityPanel], [class*=activityUser], [class*=activityFeed], [class*=activityNow]{display:none!important;}");
    }

    if (cfg.compactChannelList) {
        css.push("[class*=sidebar] [class*=containerDefault], [class*=sidebar] [class*=channel]{padding-top:1px!important;padding-bottom:1px!important;min-height:22px!important;}");
    }

    if (cfg.compactMemberList) {
        css.push("[class*=membersWrap] [class*=member], [class*=membersWrap] [class*=layout]{min-height:30px!important;padding-top:1px!important;padding-bottom:1px!important;}");
    }

    const node = ensureStyleNode();
    node.textContent = css.join("\n");
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
    if (!cfg.pauseHiddenMedia || !document.hidden) return;

    for (const video of document.querySelectorAll("video")) {
        const v = video as HTMLVideoElement;
        if (v.paused) continue;
        if (v.muted || v.autoplay) {
            try {
                v.pause();
            } catch {
                // noop
            }
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
