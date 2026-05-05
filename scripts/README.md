# Scripts

## Local agent CLI

`agent:local` runs the same planner/executor runtime used by the Inngest agent
without starting the Next app, tRPC route, or Inngest dev server. It creates an
E2B sandbox by default, streams runtime events to the terminal, then prints the
final output, verification rows, files written, token usage, sandbox URL, and a
follow-up command.

```bash
npm run agent:local -- "add a dark mode toggle"
```

Use `--prompt` when quoting is easier or when building commands from shell
scripts:

```bash
npm run agent:local -- --prompt "fix the failing project list test"
```

Use a different sandbox template when you need one:

```bash
npm run agent:local -- --sandbox-template imaginate-dev "add a settings page"
```

Use `--json` for JSONL event/output records:

```bash
npm run agent:local -- --json --prompt "summarize the messages module"
```

### Multiple turns

At the end of a successful coding run, the CLI prints a follow-up command with
the sandbox id already filled in:

```txt
Follow-up command
npm run agent:local -- --sandbox-id sbx_abc123 "<next prompt>"
```

Run that command with a new prompt to continue against the same sandbox:

```bash
npm run agent:local -- --sandbox-id sbx_abc123 "now add tests for it"
```

You can also pass the sandbox id manually:

```bash
npm run agent:local -- --sandbox-id sbx_abc123 --prompt "explain what changed"
```

The sandbox stays alive according to the E2B timeout configured by the runtime,
so follow-up turns work while that sandbox is still available.

### Local directory mode

Use `--local <dir>` to run against a directory on your machine instead of an
E2B sandbox. Reads, writes, and shell commands all execute against `<dir>`
(absolute or `~`-relative). Mutually exclusive with `--sandbox-id`;
`--sandbox-template` is ignored. Sandbox URL / preview / follow-up output is
skipped.

```bash
mkdir -p ~/Desktop/test-sandbox
npm run agent:local -- --local ~/Desktop/test-sandbox "add a README"
```

The per-run debug log (`logs/local-<unixMs>.jsonl`) is written under the
current working directory, so `cd` into the project root (or wherever you want
the logs to land) before invoking.
