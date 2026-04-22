<script>
    export let type = "secondary";

    const types = ["primary", "secondary"];
</script>

<button
    class="button {types.includes(type) ? `type-${type}` : "type-secondary"}"
    type="button"
    on:keypress
    on:click|preventDefault|stopPropagation
    {...$$restProps}
>
    <span>
        <slot></slot>
    </span>
</button>

<style>
    .button {
        width: auto;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        transition: 150ms ease;
        cursor: pointer;
        padding: 0 12px;
        height: 28px;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 400;
        border-radius: 2px;
    }

    .button[disabled] {
        opacity: .5;
        pointer-events: none;
    }

    .button span {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .button.type-primary {
        background-color: var(--accent);
        color: #fff;
    }

    .button.type-primary:hover {
        background-color: var(--accent-hover);
    }

    .button.type-primary:active {
        background-color: #274f8a;
    }

    .button.type-secondary {
        background-color: var(--bg3);
        color: var(--text-normal);
    }

    .button.type-secondary:hover {
        background-color: var(--bg3-alt);
    }

    .button.type-secondary:active {
        background-color: var(--bg4);
    }
</style>
