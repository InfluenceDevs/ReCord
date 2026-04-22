<script>
    import Button from "./Button.svelte";
    import {handleKeyboardToggle} from "../stores/controls.js";
    import {createEventDispatcher} from "svelte";

    export let value;
    export let description;
    export let disabled = false;
    export let checked = false;

    let checkbox;

    const dispatch = createEventDispatcher();
    function click() {
        dispatch("click", value);
    }

</script>

<label class="check-container" {...$$restProps}>
    <input bind:this={checkbox} type="checkbox" hidden {disabled} {checked} on:change {value} />
    <div on:keypress={handleKeyboardToggle(checkbox)} tabindex="0" class="check-item" class:disabled>
        <div class="icon">
            <slot name="icon" />
        </div>
        <div class="content">
            <h5>
                <slot>Unknown</slot>
            </h5>
            <span title={description}>{description}</span>
        </div>
        <div class="controls" on:keypress={e => e.stopPropagation()}>
            <Button type="secondary" on:click={click}>Install</Button>
        </div>
    </div>
</label>

<style>
    .check-item {
        display: flex;
        align-items: center;
        border-radius: 8px;
        border: 1px solid rgba(103, 129, 206, 0.18);
        background: rgba(18, 24, 55, 0.82);
        padding: 12px 14px;
        user-select: none;
        box-shadow: none;
        cursor: pointer;
        transition: 140ms ease;
        flex-wrap: nowrap;
        position: relative;
        overflow: hidden;
    }

    .check-container {
        margin-bottom: 10px;
    }

    .check-container:last-child {
        margin: 0;
    }

    .check-item.disabled {
        background: rgba(13, 19, 44, 0.72);
        border-color: rgba(98, 118, 176, 0.25);
        cursor: not-allowed;
    }

    .check-container input:checked + .check-item {
        background: linear-gradient(90deg, rgba(73, 96, 244, 0.96) 0%, rgba(67, 88, 225, 0.94) 100%);
        border-color: rgba(123, 150, 255, 0.55);
    }

    .check-item.disabled .content,
    .check-item.disabled .icon {
        opacity: 0.5;
        pointer-events: none;
    }

    .controls,
    .icon {
        flex: 0 0 auto;
    }

    :global(.icon img) {
        width: 30px;
        height: 30px;
        border-radius: 8px;
    }

    .content {
        display: flex;
        flex-direction: column;
        margin: 0 10px;
        overflow: hidden;
        flex: 1 1 auto;
    }

    .content span,
    .content h5 {
        transition: 100ms ease;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: normal;
    }

    .content span {
        color: var(--text-muted);
        font-size: 12px;
        font-weight: 400;
    }

    .content h5 {
        color: var(--text-normal);
        font-weight: 700;
        font-size: 16px;
        letter-spacing: 0.03em;
        margin: 0;
    }

    .check-item:not(.disabled):hover .content h5 {
        color: var(--text-light);
    }

    .check-item:not(.disabled):hover .content span {
        color: var(--text-normal);
    }

    .check-container input:checked + .check-item .content h5,
    .check-container input:checked + .check-item .content span {
        color: #fff;
    }

    :global(.check-container input:checked + .check-item .button) {
        background: rgba(151, 171, 255, 0.32);
        border-color: transparent !important;
        color: #f5f8ff;
    }

    :global(.check-container input:checked + .check-item .button:active) {
        opacity: 0.8;
    }
</style>
