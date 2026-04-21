<script>
    export let group;
    export let value;

    let checkbox;
</script>

<label class="radio-container">
    <input bind:this={checkbox} type="radio" hidden bind:group on:change {value}>
    <div tabindex="-1" class="radio-item" {...$$restProps}>
        <div>
            <slot name="icon"></slot>
            <slot></slot>
        </div>
    </div>
</label>

<style>
    .radio-item {
        display: flex;
        align-items: center;
        border-radius: 10px;
        border: 1px solid rgba(145, 184, 255, 0.24);
        background: rgba(19, 28, 40, 0.86);
        padding: 12px 14px;
        color: var(--text-normal);
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.02em;
        user-select: none;
        box-shadow: none;
        cursor: pointer;
        transition: border-color 130ms ease, background-color 130ms ease, color 130ms ease;
        min-height: 46px;
    }

    .radio-item > div {
        display: flex;
        align-items: center;
        position: relative;
        z-index: 1;
    }

    .radio-container {
        margin: 0;
    }

    .radio-item:hover {
        color: var(--text-light);
        border-color: rgba(145, 184, 255, 0.44);
        background: rgba(24, 35, 50, 0.9);
    }

    :global(.radio-item svg) {
        width: 16px;
        height: 16px;
        margin-right: 11px;
        opacity: 0.92;
    }

    .radio-container input:checked + .radio-item {
        color: #f7fbff;
        border-color: rgba(92, 168, 255, 0.65);
        background: rgba(29, 44, 62, 0.95);
    }
</style>