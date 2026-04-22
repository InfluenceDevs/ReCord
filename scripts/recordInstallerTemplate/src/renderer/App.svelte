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
        </section>
    </main>
</div>

<style>
    :global([data-focus-visible-added]) {
        box-shadow: 0 0 0 4px var(--accent-faded) !important;
    }

    :root {
        --bg1: #040405;
        --bg2: #0c0d10;
        --bg2-alt: #101116;
        --bg3: #14151b;
        --bg3-alt: #191a21;
        --bg4: #20212b;

        --text-light: #f1f1f1;
        --text-normal: #bfc4c9;
        --text-muted: #95989d;
        --text-link: #5a88ce;

        --accent: #3a71c1;
        --accent-hover: #2f5b9d;
        --accent-faded: rgba(58, 113, 193, 0.4);

        --danger: #c13a3a;
        --danger-hover: #992e2e;
        --danger-faded: rgba(193, 58, 58, 0.4);
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
        font-family: "Inter", sans-serif;
        user-select: none;
        outline: none;
    }

    :global(a) {
        color: var(--accent);
        text-decoration: none;
    }

    :global(::selection) {
        background-color: var(--accent-faded);
        color: var(--text-normal);
    }

    :global(::-webkit-scrollbar) {
        width: 4px;
        height: 4px;
    }

    :global(::-webkit-scrollbar-thumb) {
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
    }

    :global(::-webkit-scrollbar-thumb:hover) {
        background-color: rgba(255, 255, 255, 0.075);
    }

    :global(::-webkit-scrollbar-thumb:active) {
        background-color: rgba(255, 255, 255, 0.1);
    }

    :global(::-webkit-scrollbar-corner) {
        display: none;
    }

    .main-window {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        contain: strict;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.25);
        width: 100%;
        height: 100%;
        word-break: break-word;
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
        padding: 20px;
        background: radial-gradient(var(--bg2) 50%, var(--bg2-alt));
        flex: 1;
        gap: 10px;
    }

    .sidebar {
        width: 128px;
        flex: 0 0 128px;
        border: 1px solid rgba(255, 255, 255, 0.04);
        border-radius: 2px;
        background: rgba(0, 0, 0, 0.15);
        display: flex;
        flex-direction: column;
        padding: 8px 7px;
    }

    .sidebar-logo {
        color: var(--accent);
        margin: 2px 4px 10px;
        opacity: 0.8;
    }

    .steps {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .step {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--text-muted);
        border-radius: 2px;
        padding: 7px 8px;
        border: 1px solid transparent;
    }

    .step.active {
        color: var(--text-light);
        background: rgba(58, 113, 193, 0.22);
        border-color: rgba(58, 113, 193, 0.35);
    }

    .step.completed {
        color: var(--text-normal);
    }

    .step-index {
        width: 18px;
        height: 18px;
        border-radius: 2px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: var(--bg3);
        display: grid;
        place-items: center;
        font-size: 10px;
        font-weight: 600;
        color: var(--text-normal);
        flex: 0 0 auto;
    }

    .step.active .step-index {
        background: var(--accent);
        color: #fff;
        border-color: transparent;
    }

    .step-label {
        font-size: 12px;
        font-weight: 400;
        letter-spacing: 0;
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
        border: 1px solid rgba(255, 255, 255, 0.04);
        border-radius: 2px;
        background: rgba(0, 0, 0, 0.12);
        padding: 8px;
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
        padding: 10px 10px 0;
        border-radius: 0;
        border: none;
        background: transparent;
        backdrop-filter: none;
    }
</style>
