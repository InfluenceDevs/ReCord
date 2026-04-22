# ReCord Plugin Framework Later

Keep this in-repo until the project grows beyond a solo-dev workflow.

Current decision:

- Build the first plugin framework inside the ReCord repo.
- Do not split into a separate repository yet.

Why:

- Faster iteration as a solo developer.
- Easier refactors while the API is still unstable.
- Lower maintenance overhead.

Suggested first structure:

- `packages/plugin-runtime` for loading and sandbox boundaries.
- `packages/plugin-sdk` for public APIs and types.
- `packages/plugin-cli` for scaffold/build/publish commands.
- `packages/plugin-template` for starter plugins.

Non-negotiables for v1:

- Manifest with `id`, `name`, `version`, `author`, `minRecVersion`, `minSdkVersion`.
- Permission model for network, file access, and native bridges.
- Clear compatibility checks and disable-on-mismatch behavior.
- Signed or at least checksummed packages before public distribution.

Split into a separate repo later when:

- external plugin count grows,
- the SDK release cadence differs from core,
- docs/examples start creating too much noise in the main repo.
