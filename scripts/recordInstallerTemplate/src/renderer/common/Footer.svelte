<script>
    const electron = require("electron");

    import Button from "./Button.svelte";
    import ButtonGroup from "./ButtonGroup.svelte";
    import SocialLinks from "./SocialLinks.svelte";
    import {canGoForward, canGoBack, nextPage, state} from "../stores/navigation";
    import {push, pop, location} from "svelte-spa-router";

    let nextButtonContent = "Next";

    async function goToNext() {
        state.direction = 1;
        if ($nextPage) push($nextPage);
        else electron.remote.app.exit();
    }

    function goBack() {
        state.direction = -1;
        pop();
    }

    $: if ($location.startsWith("/setup/")) {
        const action = $location.slice(7);
        const actionText = action[0].toUpperCase() + action.slice(1);
        nextButtonContent = actionText;
    }
    else {
        nextButtonContent = "Next";
    }
    
    function navigatePage() {
        if ((event.key === "ArrowRight" && event.ctrlKey) && $canGoForward) {
            goToNext();
        }
        else if ((event.key === "ArrowLeft" && event.ctrlKey) && $canGoBack) {
            goBack();
        }
    }

</script>

<svelte:window on:keydown={navigatePage} />

<footer class="install-footer">
    <SocialLinks/>
    <span class="shortcut-hint">Ctrl+Left / Ctrl+Right</span>
    <ButtonGroup>
        <Button type="secondary" disabled={!$canGoBack} on:click={goBack}>Back</Button>
        <Button type="primary" disabled={!$canGoForward} on:click={goToNext}>{#if $nextPage}{nextButtonContent}{:else}Close{/if}</Button>
    </ButtonGroup>
</footer>

<style>
    .install-footer {
        width: 100%;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        flex: 0 0 auto;
        margin-top: 10px;
        padding: 10px 0 0;
        border-top: 1px solid rgba(158, 190, 255, 0.12);
        gap: 10px;
    }

    .shortcut-hint {
        margin-left: auto;
        margin-right: 10px;
        font-size: 10px;
        color: var(--text-muted);
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
</style>