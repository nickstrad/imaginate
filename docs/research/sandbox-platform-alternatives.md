# Sandbox Platform Alternatives

Research date: 2026-04-26

Question: Given this repo's current E2B usage, which sandbox platforms are worth creating experimental interfaces for, and what gaps or switching reasons matter?

This is research context, not a plan or source-of-truth contract. Pricing, limits, and platform capabilities are likely to change; verify vendor docs before using this for implementation or procurement.

## Repo Context

Imaginate currently uses E2B for generated-code execution and live previews:

- `src/inngest/functions.ts` creates an `imaginate-dev` E2B sandbox, executes the coding agent, ensures the preview server is running, then stores a `sandboxUrl`.
- `scripts/agent-local.ts` can create a sandbox from a template or reconnect to an existing sandbox ID for local agent runs.
- `src/lib/agents/tools.ts` depends on command execution, streamed stdout/stderr, file reads/writes, and verification commands.
- `src/lib/sandbox/preview.ts` assumes a public host for port `3000` and can restart the Next dev server.
- `sandbox-templates/nextjs/` defines the current E2B template around a Node/Next/shadcn environment.
- `src/agent/ports/sandbox-gateway.ts` already sketches the right abstraction boundary: acquire a sandbox handle with `sandboxId`, `commands.run`, `files.read/write`, `setTimeout`, and `getHost`.

The main E2B pain is not basic capability. It is lifecycle: only `sandboxUrl` is persisted today, expired sandboxes break old previews, and revival requires recreating project state from durable app data.

## Current Baseline: E2B

E2B remains a strong fit for the current architecture because its SDK maps directly to the repo's needs: sandbox creation/reconnect, command execution, file operations, custom templates, timeouts, and public preview hosts.

Pricing and limits found during research:

- Hobby: `$0/month + usage`, one-time `$100` credits, up to 1-hour sandbox sessions, 20 concurrent sandboxes.
- Pro: `$150/month + usage`, custom CPU/RAM, up to 24-hour sessions, 100 concurrent sandboxes by default with purchasable concurrency up to 1,100.
- Listed usage pricing: about `$0.000014/vCPU-second` and `$0.0000045/GiB-second`.

Sources:

- [E2B pricing](https://e2b.dev/pricing)
- [E2B billing and limits](https://e2b.dev/docs/billing)
- [E2B rate limits](https://e2b.dev/docs/sandbox/rate-limits)

## Top Experimental Interfaces

### 1. Vercel Sandbox

Why it is worth testing:

- Closest near-term E2B replacement if the app is already deployed on Vercel.
- Supports `Sandbox.create()`, `Sandbox.get()`, command execution, file writes, public domains for exposed ports, snapshots, configurable resources, runtime images, env vars, and network firewall.
- Network policy controls are attractive for generated or untrusted code.
- High published concurrency on Pro makes it interesting for multi-user agent workloads.

Potential gaps versus E2B:

- Pro/Enterprise max runtime is currently listed as 5 hours, shorter than E2B Pro's 24 hours.
- Current docs list only `iad1` availability for Sandbox.
- Preview ports need to be registered explicitly for `sandbox.domain(port)`.
- The template story is snapshot/source/runtime based rather than identical to the current E2B template flow.
- Pricing docs had a discrepancy during research: Vercel's main pricing page listed Sandbox memory at `$0.0212/GB-hour`, while Sandbox pricing docs listed `$0.0424/GB-hour`.

Pricing and limits found during research:

- Hobby includes 5 active CPU hours/month, 420 GB-hours memory/month, 5,000 creations/month, 20 GB transfer/month, 15 GB lifetime storage, 10 concurrent sandboxes, and 45-minute max runtime.
- Pro lists Active CPU at `$0.128/hour`, creations at `$0.60/1M`, transfer at `$0.15/GB`, storage at `$0.08/GB-month`, 2,000 concurrent sandboxes, and 5-hour max runtime.

Sources:

- [Vercel Sandbox pricing and limits](https://vercel.com/docs/vercel-sandbox/pricing)
- [Vercel pricing](https://vercel.com/pricing)
- [Vercel Sandbox SDK reference](https://vercel.com/docs/vercel-sandbox/sdk-reference)
- [Vercel Sandbox system specifications](https://vercel.com/docs/vercel-sandbox/system-specifications)
- [Vercel Sandbox firewall](https://vercel.com/docs/vercel-sandbox/concepts/firewall)

Recommendation: Prototype first. It is the best candidate for reducing platform sprawl while preserving the current agent workflow.

### 2. CodeSandbox SDK

Why it is worth testing:

- Best fit if the product goal becomes durable, resumable generated projects rather than short-lived execution.
- Built around programmable dev environments, VM snapshot/restore, hibernation, forking/cloning, Docker prebuild snapshots, Git-backed persistence, and preview URLs.
- The SDK examples align closely with agent workflows: create sandbox, run code, wait for port, get preview URL, fork, and hibernate.

Potential gaps versus E2B:

- Free/low-tier SDK limits are lower for serious multi-user usage.
- Pricing is workspace/credit-shaped, so cost modeling is less direct than raw per-second infrastructure.
- File, command, and preview APIs should be validated in a spike against this repo's `SandboxGateway` shape.

Pricing and limits found during research:

- Free Build plan: 40 monthly VM credit hours, CodeSandbox SDK lite, 10 concurrent SDK VM sandboxes, 20 new SDK sandboxes/hour, 1,000 SDK requests/hour, up to 4 vCPU/8 GiB RAM.
- Scale: from `$170/month/workspace`, 160 monthly VM credit hours, on-demand VM credits at `$0.15/hour`, 250 concurrent VMs, 1,000 new sandboxes/hour, 10,000 SDK requests/hour.

Sources:

- [CodeSandbox pricing](https://codesandbox.io/pricing)
- [CodeSandbox SDK](https://codesandbox.io/sdk)
- [CodeSandbox SDK launch post](https://codesandbox.io/blog/codesandbox-sdk)

Recommendation: Prototype second, specifically around project revival, hibernation, preview stability, and forked alternate agent attempts.

### 3. Daytona

Why it is worth testing:

- Similar raw compute economics to E2B.
- Supports programmatic sandboxes, snapshots, OCI/Docker images, preview URLs, resources, regions, env vars, and network controls.
- Stopped sandboxes preserve filesystem state; archived sandboxes move filesystem state to cheaper object storage.
- Warm sandbox pools may improve startup for common snapshots.

Potential gaps versus E2B:

- Default resources are smaller: 1 vCPU, 1 GiB RAM, 3 GiB disk.
- Published org-level maximums are 4 vCPU, 8 GiB RAM, 10 GiB disk unless increased.
- Smaller ecosystem signal than E2B, Vercel, or CodeSandbox for JS coding-agent products.
- Needs hands-on validation of command streaming, file API ergonomics, and preview URL stability.

Pricing and limits found during research:

- Usage pricing listed at `$0.000014/vCPU-second`, `$0.0000045/GiB-second`, and `$0.00000003/GiB-second` for storage after the free storage allowance.
- Daytona advertises `$200` in free compute.

Sources:

- [Daytona pricing](https://www.daytona.io/pricing)
- [Daytona sandboxes](https://www.daytona.io/docs/en/sandboxes)
- [Daytona snapshots](https://www.daytona.io/docs/en/snapshots)

Recommendation: Prototype third if cost and persistent lifecycle become the main switching drivers.

## Worth Watching: Cloudflare Sandbox SDK

Cloudflare Sandbox SDK is promising but more platform-coupled than the top three.

Why it is interesting:

- Built on Cloudflare Containers and generally available as of April 2026.
- Provides command execution, files, background processes, preview URLs, code interpreters, terminals, backups/restores, file watching, R2-backed storage patterns, and custom Docker images.
- Pricing is attractive if the team is comfortable with Workers, Durable Objects, and Cloudflare container deployment.

Potential gaps versus E2B:

- Production preview URLs require a custom domain with wildcard DNS routing.
- The integration shape is Cloudflare-native, not a simple vendor SDK dropped into the current server runtime.
- Container disk is ephemeral when instances sleep; persistence requires backup/restore or external storage design.
- Current instance limits top out at 4 vCPU, 12 GiB RAM, and 20 GB disk unless account limits are increased.

Pricing and limits found during research:

- Requires Workers Paid plan.
- Containers include 375 vCPU-minutes/month, 25 GiB-hours memory/month, and 200 GB-hours disk/month.
- Overages: `$0.000020/vCPU-second`, `$0.0000025/GiB-second`, `$0.00000007/GB-second`; NA/EU egress is listed at `$0.025/GB` after 1 TB included.

Sources:

- [Cloudflare Sandbox SDK](https://developers.cloudflare.com/sandbox/)
- [Cloudflare Sandbox API](https://developers.cloudflare.com/sandbox/api/)
- [Cloudflare Containers pricing](https://developers.cloudflare.com/containers/pricing/)
- [Cloudflare Container limits](https://developers.cloudflare.com/containers/platform-details/limits/)

Recommendation: Revisit if Imaginate wants Cloudflare-native scale or lower container economics enough to justify platform-specific routing and persistence work.

## Suggested Experiment Shape

Do not switch providers directly from this research. First add one experimental adapter behind `SandboxGateway` and measure:

- Cold start to command-ready.
- Time to install or restore the generated Next/shadcn environment.
- Time to preview-ready for port `3000`.
- File read/write throughput and payload limits.
- Command streaming fidelity and timeout behavior.
- Reconnect/resume behavior after process retries.
- Revival behavior after sandbox expiry, stop, hibernate, or archive.
- Cost per successful agent run and per revived project.

Suggested order:

1. Vercel Sandbox for near-drop-in parity and platform consolidation.
2. CodeSandbox SDK for hibernation, forks, and durable generated-project UX.
3. Daytona for E2B-like economics plus stop/archive lifecycle.
4. Cloudflare Sandbox SDK only if the team is ready to evaluate Workers/Containers as part of the product architecture.

## Agent Notes

- Treat vendor prices and limits as stale by default. Re-check official docs before planning or coding against them.
- The existing `SandboxGateway` port is the right seam for experiments; avoid adding provider calls directly to application code.
- If a provider is selected, update source-of-truth architecture docs only for durable repo structure or dependency-direction changes, not for vendor research findings.
