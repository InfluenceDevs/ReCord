<script>
    import "focus-visible";

    // import Page from "./containers/Page.svelte";
    import Titlebar from "./common/Titlebar.svelte";
    import Footer from "./common/Footer.svelte";
    import Router from "svelte-spa-router";
    import {location} from "svelte-spa-router";
    import routes from "./routes";

    const steps = [
        { id: 1, label: "License" },
        { id: 2, label: "Install" },
        { id: 3, label: "Complete" }
    ];

    $: currentStep = (() => {
        if ($location === "/") return 1;
        if ($location.startsWith("/actions") || $location.startsWith("/setup/")) return 2;
        if ($location.startsWith("/install") || $location.startsWith("/repair") || $location.startsWith("/uninstall")) return 3;
        return 1;
    })();
</script>

<div class="main-window platform-{process.platform || "win32"}">
    <Titlebar macButtons={process.platform === "darwin"} />
    <main class="installer-body">
        <aside class="sidebar">
            <div class="sidebar-logo" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36" width="22" height="16">
                    <path fill="currentColor" d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,33.15-1.71,57.61.54,81.72h0A105.73,105.73,0,0,0,32.71,96.36A77.7,77.7,0,0,0,39.62,85.11a68.42,68.42,0,0,1-10.89-5.19c.92-.69,1.81-1.41,2.67-2.16,21,9.58,43.94,9.58,64.66,0,.87.76,1.76,1.48,2.67,2.16a68.68,68.68,0,0,1-10.9,5.19,77,77,0,0,0,6.92,11.25A105.25,105.25,0,0,0,126.6,81.72h0C129.24,53.79,122.09,29.56,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,52.91s5-12.78,11.43-12.78,11.57,5.73,11.46,12.78S48.86,65.69,42.45,65.69Zm42.24,0c-6.27,0-11.43-5.69-11.43-12.78s5-12.78,11.43-12.78,11.57,5.73,11.46,12.78S91.1,65.69,84.69,65.69Z"/>
                </svg>
            </div>

            <nav class="steps" aria-label="Installer steps">
                {#each steps as step}
                    <div class="step" class:active={step.id === currentStep} class:completed={step.id < currentStep}>
                        <span class="step-index">{step.id}</span>
                        <span class="step-label">{step.label}</span>
                    </div>
                {/each}
            </nav>
        </aside>

        <section class="sections">
            <div class="route-shell">
                <Router {routes} />
            </div>
            <Footer />
        </div>
    </main>
</div>

<style>
    :global([data-focus-visible-added]) {
        box-shadow: 0 0 0 2px var(--focus-ring) !important;
    }

    :root {
        --bg0: #0b1230;
        --bg1: #0f1738;
        --bg2: #121c43;
        --bg3: #16214d;
        --bg4: #1e2c63;

        --text-light: #f5f8ff;
        --text-normal: #c8d5f0;
        --text-muted: #8293bf;
        --text-link: #92c0ff;

        --accent: #4b63ff;
        --accent-hover: #5a71ff;
        --accent-faded: rgba(90, 113, 255, 0.24);
        --focus-ring: rgba(105, 179, 255, 0.45);

        --danger: #ff6c72;
        --danger-hover: #ff7f86;
        --danger-faded: rgba(255, 108, 114, 0.3);

        --line: rgba(130, 156, 230, 0.16);
    }

    :global(html),
    :global(body),
    :global(#app) {
        overflow: hidden;
        margin: 0;
        height: 100%;
        width: 100%;
    }

    :global(*),
    :global(*::after),
    :global(*::before) {
        box-sizing: border-box;
        -webkit-user-drag: none;
        font-family: "Space Grotesk", "Sora", "Plus Jakarta Sans", "Segoe UI Variable", sans-serif;
        user-select: none;
        outline: none;
    }

    :global(a) {
        color: var(--text-link);
        text-decoration: none;
    }

    :global(::selection) {
        background-color: rgba(125, 170, 255, 0.45);
        color: var(--text-light);
    }

    :global(::-webkit-scrollbar) {
        width: 8px;
        height: 8px;
    }

    :global(::-webkit-scrollbar-thumb) {
        background-color: rgba(156, 182, 255, 0.26);
        border-radius: 999px;
        border: 2px solid transparent;
        background-clip: content-box;
    }

    :global(::-webkit-scrollbar-thumb:hover) {
        background-color: rgba(156, 182, 255, 0.42);
    }

    :global(::-webkit-scrollbar-thumb:active) {
        background-color: rgba(156, 182, 255, 0.54);
    }

    :global(::-webkit-scrollbar-corner) {
        display: none;
    }

    .main-window {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        contain: strict;
        box-shadow: none;
        border: 1px solid rgba(107, 129, 205, 0.26);
        border-radius: 10px;
        width: 100%;
        height: 100%;
        word-break: break-word;
        background: linear-gradient(180deg, #0a1437 0%, #0a1231 100%);
    }

    .main-window.platform-darwin {
        border-radius: 0;
        box-shadow: none;
        width: 100%;
        height: 100%;
        margin: 0;
    }

    .installer-body {
        overflow: hidden;
        position: relative;
        display: flex;
        flex-direction: row;
        z-index: 1;
        padding: 14px;
        background: transparent;
        flex: 1;
        gap: 14px;
    }

    .sidebar {
        width: 170px;
        flex: 0 0 170px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: linear-gradient(180deg, rgba(8, 17, 52, 0.92) 0%, rgba(7, 14, 43, 0.9) 100%);
        display: flex;
        flex-direction: column;
        padding: 14px 10px;
    }

    .sidebar-logo {
        color: #8ea3ff;
        margin: 4px 6px 16px;
        opacity: 0.95;
    }

    .steps {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .step {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #7f92be;
        border-radius: 8px;
        padding: 10px 10px;
        border: 1px solid transparent;
    }

    .step.active {
        color: #dce6ff;
        background: rgba(85, 105, 203, 0.34);
        border-color: rgba(118, 143, 235, 0.38);
    }

    .step.completed {
        color: #93a9da;
    }

    .step-index {
        width: 20px;
        height: 20px;
        border-radius: 999px;
        border: 1px solid rgba(128, 149, 212, 0.45);
        background: rgba(13, 26, 66, 0.88);
        display: grid;
        place-items: center;
        font-size: 11px;
        font-weight: 700;
        color: #c3d1f9;
        flex: 0 0 auto;
    }

    .step.active .step-index {
        background: #90a8ff;
        color: #0f1d4a;
        border-color: transparent;
    }

    .step-label {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.01em;
    }

    .sections {
        flex: 1 1 auto;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-width: 0;
        z-index: 1;
    }

    .route-shell {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: linear-gradient(180deg, rgba(6, 14, 40, 0.95) 0%, rgba(4, 11, 34, 0.96) 100%);
        padding: 12px;
    }

    :global(.page) {
        flex: 1 1 auto;
        overflow-y: auto;
        overflow-x: hidden;
        display: flex;
        flex-direction: column;
        position: relative;
        width: 100%;
        min-height: 0;
        padding: 12px 14px 0;
        border-radius: 10px;
        border: 1px solid rgba(96, 120, 200, 0.18);
        background: rgba(7, 14, 36, 0.88);
        backdrop-filter: blur(2px);
    }
</style>
