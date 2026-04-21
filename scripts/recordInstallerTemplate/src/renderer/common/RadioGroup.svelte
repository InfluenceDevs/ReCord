<script>
    import {handleArrowKeys} from "../stores/controls.js";
    export let index = 0;

    let container;
</script>

<div
    on:keydown={handleArrowKeys(container)}
    bind:this={container}
    tabindex="0"
    selected-index={index}
    style="--index: {index};"
    class="radio-group"
    {...$$restProps}
>
    <slot />
    <div class="selection-indicator"></div>
</div>

<style>
    .radio-group {
        position: relative;
        display: flex;
        flex-direction: column;
        border-radius: 14px;
        transition: 150ms ease;
        gap: 10px;
    }

    .selection-indicator {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 46px;
        background: rgba(85, 126, 255, 0.16);
        border: 1px solid rgba(135, 168, 255, 0.44);
        border-radius: 12px;
        transition: 250ms ease;
        z-index: 0;
        transform: translateY(calc((100% + 10px) * var(--index)));
        box-shadow: none;
    }
</style>