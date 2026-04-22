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
        height: 36px;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        border-radius: 8px;
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
        border-color: rgba(131, 152, 255, 0.25);
        background: linear-gradient(180deg, #5b74ff 0%, #4c64eb 100%);
        color: #f1f5ff;
        box-shadow: none;
    }

    .button.type-primary:hover {
        background: linear-gradient(180deg, #667eff 0%, #536df2 100%);
    }

    .button.type-primary:active {
        background: #4b63e2;
    }

    .button.type-secondary {
        background: rgba(24, 34, 72, 0.86);
        border-color: rgba(115, 137, 211, 0.26);
        color: #d8e6fa;
    }

    .button.type-secondary:hover {
        border-color: rgba(136, 161, 242, 0.42);
        background: rgba(31, 46, 94, 0.94);
    }

    .button.type-secondary:active {
        background: rgba(34, 51, 102, 0.98);
    }
</style>