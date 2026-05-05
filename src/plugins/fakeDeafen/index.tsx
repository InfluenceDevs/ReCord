/*
 * ReCord, a Discord client mod
 * Copyright (c) 2026 Influence
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";
import { FluxDispatcher, MediaEngineStore, UserStore, useState, VoiceStateStore, useStateFromStores } from "@webpack/common";

import managedStyle from "./style.css?managed";

// ─── Shared state (module-level, survives re-renders) ──────────────────────

let fakeDeafenActive = false;
/** Whether the user was self-muted BEFORE fake-deafen was enabled */
let wasManuallyMuted = false;
/** Guard against re-entrant calls when we ourselves dispatch AUDIO_TOGGLE_SELF_DEAF */
let suppressVoiceStateHook = false;

// ─── Discord internal modules ──────────────────────────────────────────────

/** Same button component used by GameActivityToggle */
const PanelButton = findComponentByCodeLazy(".GREEN,positionKeyStemOverride:");

// ─── Helpers ──────────────────────────────────────────────────────────────

function getActiveConnection() {
    try {
        const engine = MediaEngineStore.getMediaEngine();
        return [...engine.connections][0] ?? null;
    } catch {
        return null;
    }
}

function myVoiceState() {
    const id = UserStore.getCurrentUser()?.id;
    if (!id) return null;
    return VoiceStateStore.getVoiceStateForUser(id) ?? null;
}

function isInVoice() {
    return !!myVoiceState()?.channelId;
}

/** Restore local audio: ensure the RTC connection is neither deafened nor muted
 *  (unless the user had manually muted before enabling fake-deafen). */
function restoreLocalAudio() {
    const conn = getActiveConnection();
    if (!conn) return;
    if (conn.getSelfDeaf()) conn.setSelfDeaf(false);
    if (!wasManuallyMuted && conn.getSelfMute()) conn.setSelfMute(false);
}

// ─── Core enable / disable ─────────────────────────────────────────────────

function enableFakeDeafen() {
    if (!isInVoice()) return;

    fakeDeafenActive = true;

    const vs = myVoiceState();
    wasManuallyMuted = !!(vs?.selfMute);

    if (!vs?.selfDeaf) {
        // Ask the gateway to deafen us (self_deaf: true).  Discord's handler
        // for this action ALSO calls setSelfDeaf(true) on the RTC connection,
        // so we schedule a restore right after the synchronous Flux chain settles.
        suppressVoiceStateHook = true;
        FluxDispatcher.dispatch({ type: "AUDIO_TOGGLE_SELF_DEAF" });
        suppressVoiceStateHook = false;
    }

    // Give Discord's internal handlers one tick to run setSelfDeaf / setSelfMute,
    // then undo those local effects so the user can still hear and speak.
    setTimeout(restoreLocalAudio, 50);
}

function disableFakeDeafen() {
    fakeDeafenActive = false;
    const vs = myVoiceState();

    if (vs?.selfDeaf) {
        // Tell the gateway we are no longer deafened.
        FluxDispatcher.dispatch({ type: "AUDIO_TOGGLE_SELF_DEAF" });
        // Local audio is already undeafened, so no further action needed.
    }
}

// ─── Maintenance subscription ──────────────────────────────────────────────
// If Discord resets our voice state (reconnect / resume), re-apply local restore.

function handleVoiceStateUpdates({ voiceStates }: { voiceStates: Array<{ userId: string; }> }) {
    if (!fakeDeafenActive || suppressVoiceStateHook) return;
    const myId = UserStore.getCurrentUser()?.id;
    if (!myId) return;
    const mine = voiceStates.find(vs => vs.userId === myId);
    if (!mine) return;

    // After the Flux update settles, make sure RTC local state is still undeafened.
    setTimeout(restoreLocalAudio, 100);
}

// ─── UI – icon ─────────────────────────────────────────────────────────────

function FakeDeafenIcon({ active }: { active: boolean; }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {/* Headphone body */}
            <path
                fill={active ? "var(--status-danger)" : "currentColor"}
                d="M12 3a9 9 0 0 0-9 9v3.5A2.5 2.5 0 0 0 5.5 18H7a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H5.07A7 7 0 0 1 19 12v-.07A7 7 0 0 1 18.93 11H17a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1.5A2.5 2.5 0 0 0 21 15.5V12a9 9 0 0 0-9-9Z"
            />
            {/* Ghost-eye badge in top-right when active */}
            {active && (
                <>
                    <circle cx="19" cy="5" r="5" fill="var(--background-primary)" />
                    <circle cx="19" cy="5" r="4" fill="var(--status-danger)" />
                    <circle cx="17.4" cy="5" r="1" fill="white" />
                    <circle cx="20.6" cy="5" r="1" fill="white" />
                </>
            )}
        </svg>
    );
}

// ─── UI – button ───────────────────────────────────────────────────────────

function FakeDeafenButton(props: { nameplate?: unknown; }) {
    // React to voice-state store so button dims when user is not in a channel.
    const inVoice = useStateFromStores([VoiceStateStore], () => isInVoice());

    // Local toggle state — keep in sync with module-level flag.
    const [active, setActive] = useState(() => fakeDeafenActive);

    function toggle() {
        if (!inVoice) return;
        const next = !active;
        setActive(next);
        fakeDeafenActive = next; // sync before async operations
        if (next) enableFakeDeafen();
        else disableFakeDeafen();
    }

    return (
        <PanelButton
            tooltipText={active ? "Disable Fake Deafen" : "Fake Deafen (appear muted+deafened)"}
            icon={() => <FakeDeafenIcon active={active} />}
            role="switch"
            aria-checked={active}
            redGlow={active}
            plated={props?.nameplate != null}
            onClick={toggle}
        />
    );
}

// ─── Plugin definition ─────────────────────────────────────────────────────

export default definePlugin({
    name: "FakeDeafen",
    description: "Adds a toggle next to Mute/Deafen that makes you appear muted and deafened to others while you can still hear and speak.",
    authors: [Devs.Rloxx],
    tags: ["deafen", "mute", "fake", "ghost", "stealth"],

    managedStyle,

    patches: [
        {
            // Inject our button into the same voice-control panel row as
            // mute / deafen / game-activity.
            // NOTE: the lookahead uses 0,200 (not 0,25) so it still matches
            // even when other plugins (e.g. GameActivityToggle) have already
            // prepended their own buttons (~50 chars each) to the array.
            find: ".DISPLAY_NAME_STYLES_COACHMARK),",
            replacement: {
                match: /children:\[(?=.{0,200}?accountContainerRef)/,
                replace: "children:[$self.FakeDeafenButton(arguments[0]),"
            }
        }
    ],

    flux: {
        VOICE_STATE_UPDATES: handleVoiceStateUpdates
    },

    stop() {
        // Clean up: if still active, undo the fake state.
        if (fakeDeafenActive) {
            fakeDeafenActive = false;
            disableFakeDeafen();
        }
    },

    FakeDeafenButton: ErrorBoundary.wrap(FakeDeafenButton, { noop: true }),
});


