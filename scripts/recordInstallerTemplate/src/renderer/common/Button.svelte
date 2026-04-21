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
        border: 1px solid transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
        cursor: pointer;
        padding: 0 22px;
        height: 38px;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        border-radius: 9px;
        position: relative;
        overflow: hidden;
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
        border-color: rgba(131, 189, 255, 0.35);
        background: #55a7ff;
        color: #02111f;
        box-shadow: none;
    }

    .button.type-primary:hover {
        background: #69b2ff;
    }

    .button.type-primary:active {
        background: #4f9aee;
    }

    .button.type-secondary {
        background: rgba(21, 31, 45, 0.92);
        border-color: rgba(141, 183, 255, 0.2);
        color: #d8e6fa;
    }

    .button.type-secondary:hover {
        border-color: rgba(141, 183, 255, 0.34);
        background: rgba(26, 39, 56, 0.96);
    }

    .button.type-secondary:active {
        background: rgba(30, 45, 64, 0.98);
    }
</style>