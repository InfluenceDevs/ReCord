<script>
    export let value = 0;
    export let max = 100;
    let className;
    export {className as class};
</script>

<div class="progress-bar {className}" {...$$restProps}>
    <div class="progress-fill" style="width: {(value / max) * 100}%;"></div>
</div>

<style>
    .progress-bar {
        width: 100%;
        height: 8px;
        border-radius: 999px;
        overflow: hidden;
        border: 1px solid rgba(153, 185, 241, 0.24);
        background-color: #111111;
    }

    .progress-fill {
        height: 100%;
        border-radius: 999px;
        overflow: hidden;
        transition: 500ms ease width, 150ms ease background-color;
        transform-origin: left;
        background: #7eb5ff;
    }

    :global(.progress-bar.error .progress-fill) {
        background-color: var(--danger);
    }

    :global(.progress-bar.success .progress-fill) {
        background-color: #3ac172;
    }
</style>