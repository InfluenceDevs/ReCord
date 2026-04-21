<script>
    import "focus-visible";

    // import Page from "./containers/Page.svelte";
    import Titlebar from "./common/Titlebar.svelte";
    import Footer from "./common/Footer.svelte";
    import Router from "svelte-spa-router";
    import routes from "./routes";
</script>

<div class="main-window platform-{process.platform || "win32"}">
    <Titlebar macButtons={process.platform === "darwin"} />
    <main class="installer-body">
        <div class="sections">
            <Router {routes} />
        </div>
        <Footer />
    </main>
</div>

<style>
    :global([data-focus-visible-added]) {
        box-shadow: 0 0 0 2px var(--focus-ring) !important;
    }

    :root {
        --bg0: #070b10;
        --bg1: #0d131c;
        --bg2: #141c27;
        --bg3: #1a2331;
        --bg4: #223043;

        --text-light: #f5f9ff;
        --text-normal: #d5e0ef;
        --text-muted: #88a0bd;
        --text-link: #92c0ff;

        --accent: #55a7ff;
        --accent-hover: #70b6ff;
        --accent-faded: rgba(85, 167, 255, 0.2);
        --focus-ring: rgba(105, 179, 255, 0.45);

        --danger: #ff6c72;
        --danger-hover: #ff7f86;
        --danger-faded: rgba(255, 108, 114, 0.3);

        --line: rgba(158, 190, 255, 0.12);
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
        border: 1px solid var(--line);
        border-radius: 10px;
        width: 100%;
        height: 100%;
        word-break: break-word;
        background: linear-gradient(165deg, #0d141e 0%, #0a1018 54%, #090d14 100%);
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
        flex-direction: column;
        z-index: 1;
        padding: 12px;
        background: transparent;
        flex: 1;
    }

    .installer-body::before,
    .installer-body::after {
        content: "";
        position: absolute;
        pointer-events: none;
        z-index: 0;
        border-radius: 999px;
        filter: blur(30px);
    }

    .installer-body::before {
        width: 220px;
        height: 220px;
        top: -120px;
        left: -70px;
        background: rgba(76, 157, 255, 0.23);
    }

    .installer-body::after {
        width: 220px;
        height: 220px;
        bottom: -130px;
        right: -90px;
        background: rgba(34, 85, 155, 0.18);
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
        padding: 12px 12px 0;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: rgba(12, 19, 29, 0.82);
        backdrop-filter: blur(2px);
    }

    .sections {
        flex: 1 1 auto;
        overflow-y: auto;
        overflow-x: hidden;
        position: relative;
        min-height: 0;
        z-index: 1;
    }
</style>