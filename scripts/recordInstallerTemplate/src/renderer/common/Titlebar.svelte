<script>
    import {remote} from "electron";
    import quit from "../actions/quit";
    import pkg from "../../../package.json";

    export let macButtons;

    function minimize() {
        remote.BrowserWindow.getFocusedWindow().minimize();
    }

    const version = pkg.version;

</script>

<header class="titlebar {macButtons === true ? "type-mac" : "type-standard"}">
    <div class="brand-mark" aria-hidden="true">
        <span>R</span>
    </div>
    <div class="title-wrap">
        <span class="title">ReCord Installer</span>
        <span class="version">v{version}</span>
    </div>
    <div class="window-controls">
        {#if macButtons === true}
            <button tabindex="-1" on:click={quit} id="close">
                <svg width="12" height="12" viewBox="0 0 12 12">
                    <path stroke="#4c0000" fill="none" d="M8.5,3.5 L6,6 L3.5,3.5 L6,6 L3.5,8.5 L6,6 L8.5,8.5 L6,6 L8.5,3.5 Z"></path>
                </svg>
            </button>
            <button tabindex="-1" on:click={minimize} id="minimize">
                <svg width="12" height="12" viewBox="0 0 12 12">
                    <rect fill="#975500" width="6" height="1" x="3" y="5.5" fill-rule="evenodd"></rect>
                </svg>
            </button>
            <button id="maximize" disabled></button>
        {:else}
            <button tabindex="-1" on:click={minimize} id="minimize">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M2 9.75C2 9.33579 2.33579 9 2.75 9H17.25C17.6642 9 18 9.33579 18 9.75C18 10.1642 17.6642 10.5 17.25 10.5H2.75C2.33579 10.5 2 10.1642 2 9.75Z"/>
                </svg>
            </button>
            <button tabindex="-1" on:click={quit} id="close">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <path d="M3.52499 3.71761L3.61612 3.61612C4.07173 3.1605 4.79155 3.13013 5.28239 3.52499L5.38388 3.61612L14 12.233L22.6161 3.61612C23.1043 3.12796 23.8957 3.12796 24.3839 3.61612C24.872 4.10427 24.872 4.89573 24.3839 5.38388L15.767 14L24.3839 22.6161C24.8395 23.0717 24.8699 23.7915 24.475 24.2824L24.3839 24.3839C23.9283 24.8395 23.2085 24.8699 22.7176 24.475L22.6161 24.3839L14 15.767L5.38388 24.3839C4.89573 24.872 4.10427 24.872 3.61612 24.3839C3.12796 23.8957 3.12796 23.1043 3.61612 22.6161L12.233 14L3.61612 5.38388C3.1605 4.92827 3.13013 4.20845 3.52499 3.71761L3.61612 3.61612L3.52499 3.71761Z"/>
                </svg>
            </button>
        {/if}
    </div>
</header>

<style>
    .titlebar {
        background: rgba(9, 13, 20, 0.95);
        color: var(--text-light);
        height: 42px;
        display: flex;
        align-items: center;
        border-bottom: 1px solid rgba(157, 189, 255, 0.14);
        -webkit-app-region: drag;
        padding-left: 12px;
    }

    .brand-mark {
        width: 20px;
        height: 20px;
        border-radius: 6px;
        border: 1px solid rgba(124, 184, 255, 0.36);
        background: #4f9fff;
        display: grid;
        place-items: center;
        margin-right: 10px;
        box-shadow: none;
    }

    .brand-mark span {
        font-size: 11px;
        font-weight: 800;
        color: #f8fbff;
        transform: translateY(-0.5px);
    }

    .title-wrap {
        display: flex;
        align-items: baseline;
        gap: 8px;
    }

    .title {
        color: #ebf4ff;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.015em;
    }

    .version {
        font-size: 10px;
        color: var(--text-muted);
        letter-spacing: 0.06em;
    }

    .window-controls {
        display: flex;
        align-items: center;
        margin-left: auto;
        -webkit-app-region: no-drag;
    }

    .window-controls button {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
    }

    /* Standard Titlebar */

    .type-standard button {
        height: 42px;
        width: 46px;
        transition: background-color 120ms ease, color 120ms ease;
        background-color: transparent;
        color: var(--text-normal);
    }

    .type-standard button svg {
        width: 12px;
        height: 12px;
        fill: currentColor;
    }

    .type-standard button:hover {
        background-color: rgba(84, 161, 255, 0.12);
    }

    .type-standard button:active {
        background-color: rgba(84, 161, 255, 0.2);
    }

    .type-standard button#close:hover {
        background-color: #d05a61;
        color: #fff;
    }

    .type-standard button#close:active {
        background-color: #ba4d54;
        color: #fff;
    }

    /* Mac Titlebar */

    .type-mac {
        justify-content: space-between;
    }

    .type-mac .window-controls {
        order: -1;
        margin: 0 6px;
    }

    .type-mac .window-controls button {
        margin: 0 4px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background-size: auto 12px;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);
    }

    .type-mac .window-controls svg {
        visibility: hidden;
        width: 12px;
        height: 12px;
    }

    .type-mac .window-controls:hover svg {
        visibility: visible;
    }

    .type-mac .window-controls button:not([disabled]):active {
        box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12), inset 0 0 0 12px rgba(0,0,0,0.25);
    }

    .type-mac .window-controls #close {
        margin-left: 6px;
        background-color: #ff5e57;
    }

    .type-mac .window-controls #minimize {
        background-color: #ffbb2e;
    }

    .type-mac .window-controls button[disabled] {
        background-color: var(--bg3-alt);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.012);
    }
</style>