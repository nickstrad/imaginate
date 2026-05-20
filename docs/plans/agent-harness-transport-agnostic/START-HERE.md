# START HERE

PRD is ready at [`prd.md`](./prd.md).

## Next step

Run:

```
/imaginate-workflow-3-tracer-bullets
```

That skill reads `prd.md` and writes vertical-slice ticket files (with `blocked_by` dependencies) into this same folder, plus a `README.md` index.

## Open questions to resolve before or during ticketing

See the **Open questions** section at the bottom of `prd.md`:

1. Folder placement of `executeWithLadder` — `src/agent/application/` vs. new `src/agent/primitives/` (architecture-doc change).
2. Whether Inngest's `wrapPhase` should map `"acquire-workspace"` to the legacy `step.run("get-sandbox-id", …)` ID for in-flight replay safety.
3. Whether `Workspace.kind` includes `"readonly"` in this PR or waits for the first read-only transport.
