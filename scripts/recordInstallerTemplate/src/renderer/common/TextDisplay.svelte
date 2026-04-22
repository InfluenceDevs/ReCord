<script>
    import Button from "./Button.svelte";
    import LoadingPage from "../pages/Loading.svelte";
    import {beforeUpdate, afterUpdate} from "svelte";
    export let value;
    export let element;
    export let autoscroll;

    let scroller;

    let copyInputContainer;
    let copyButtonActive = false;
    let copyButtonVisible = false;

    // Copy button
    function copyDisplayContents() {
        copyButtonActive = true;
        const range = document.createRange();
        range.selectNode(element);
        window.getSelection().addRange(range);
        document.execCommand("Copy");
        document.getSelection().removeAllRanges();
        setTimeout(() => {
            copyButtonActive = false;
        }, 500);
    }

    function handleKeyboardCopyToggle() {
        if (event.key === "Enter" || event.key === " ") copyDisplayContents();
    }

    // Autoscroll

    beforeUpdate(() => {
        autoscroll = scroller && (scroller.offsetHeight + scroller.scrollTop) > (scroller.scrollHeight - 20);
    });

    afterUpdate(() => {
        if (scroller && autoscroll) scroller.scrollTo(0, scroller.scrollHeight);
    });
</script>

{#if value}
    <article
        bind:this={element}
        on:mousemove={() => copyButtonVisible = true}
        on:mouseleave={() => copyButtonVisible = false}
        class="text-display{value ? "" : " loading"}"
    >
        <div bind:this={scroller} on:scroll={() => copyButtonVisible = false} class="display-inner" tabindex="0">
            {value}
        </div>
        <div bind:this={copyInputContainer} class="copy-input" class:visible={copyButtonVisible}>
            {#if copyButtonActive}
                <Button tabindex="0" type="primary" on:keypress={handleKeyboardCopyToggle} on:click={copyDisplayContents}>Copied!</Button>
            {:else}
                <Button tabindex="0" type="secondary" on:keypress={handleKeyboardCopyToggle} on:click={copyDisplayContents}>Copy</Button>
            {/if}
        </div>
    </article>
{:else}
    <LoadingPage />
{/if}

<style>
    .text-display {
        position: relative;
        display: flex;
        flex: 1;
        min-height: 0;
        margin-bottom: 10px;
        background: rgba(17, 25, 56, 0.82);
        border: 1px solid rgba(152, 185, 242, 0.12);
        box-shadow: none;
        border-radius: 8px;
    }

    .text-display .display-inner {
        color: var(--text-normal);
        font-size: 12px;
        line-height: 1.7;
        word-wrap: normal;
        white-space: pre-wrap;
        user-select: text;
        height: 100%;
        width: 100%;
        overflow: auto;
        padding: 14px;
        border-radius: inherit;
    }

    .text-display.loading {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    /* Copy Button */

    .copy-input {
        position: absolute;
        bottom: 10px;
        right: 10px;
    }

    :global(.copy-input .button) {
        border: 1px solid rgba(158, 189, 245, 0.38) !important;
        box-shadow: none;
    }

    :global(.copy-input .button.type-secondary) {
        background: rgba(15, 22, 49, 0.98) !important;
    }

    :global(.copy-input .button:hover) {
        color: var(--text-light) !important;
    }

    :global(.copy-input .button:not(.type-primary)) {
        opacity: 0;
    }

    :global(.copy-input.visible .button),
    :global(.display-inner.focus-visible + .copy-input .button),
    :global(.copy-input .button.focus-visible) {
        opacity: 1;
    }
</style>
