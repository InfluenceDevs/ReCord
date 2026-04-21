<script>
    export let hasMargin = undefined; // eslint-disable-line no-undef-init
    export let type = "paragraph";
    let className = undefined; // eslint-disable-line no-undef-init
    export {className as class};
</script>

{#if type === "header"}
    <h3 class="header {className}" class:has-margin={hasMargin} {...$$restProps}>
        <slot/>
    </h3>
    {:else if type === "paragraph"}
    <p class="paragraph {className}" class:has-margin={hasMargin} {...$$restProps}>
        <slot/>
    </p>
    {:else if type === "subtext"}
    <span class="subtext {className}" class:has-margin={hasMargin} {...$$restProps}>
        <slot/>
    </span>
{/if}

<style>
    .header,
    .paragraph,
    .subtext {
        margin: 0;
        line-height: normal;
    }

    .has-margin {
        margin-bottom: 10px;
    }

    .header {
        color: var(--text-light);
        font-weight: 700;
        font-size: 20px;
        letter-spacing: -0.01em;
    }

    .paragraph {
        color: var(--text-normal);
        font-weight: 400;
        font-size: 13px;
    }

    .subtext {
        color: var(--text-muted);
        font-weight: 400;
        font-size: 11px;
        letter-spacing: 0.02em;
    }
</style>