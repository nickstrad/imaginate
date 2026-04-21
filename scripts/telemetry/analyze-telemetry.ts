/**
 * Analyze the Telemetry table and print actionable findings for improving the agent.
 *
 * Run: npx tsx scripts/analyze-telemetry.ts [--json] [--since=7d] [--limit=1000]
 */
import { prisma } from "@/db";
import { AGENT_CONFIG } from "@/inngest/agent-config";

type Args = { json: boolean; sinceDays: number | null; limit: number };

function parseArgs(argv: string[]): Args {
  const out: Args = { json: false, sinceDays: null, limit: 1000 };
  for (const a of argv.slice(2)) {
    if (a === "--json") out.json = true;
    else if (a.startsWith("--since=")) {
      const v = a.slice("--since=".length);
      const m = v.match(/^(\d+)d$/);
      out.sinceDays = m ? Number(m[1]) : Number(v);
    } else if (a.startsWith("--limit=")) {
      out.limit = Number(a.slice("--limit=".length));
    }
  }
  return out;
}

function pct(n: number, d: number) {
  return d === 0 ? 0 : +((n / d) * 100).toFixed(1);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next !== undefined
    ? +(sorted[base] + rest * (next - sorted[base])).toFixed(2)
    : sorted[base];
}

function stats(values: number[]) {
  if (values.length === 0) {
    return { n: 0, mean: 0, p50: 0, p90: 0, p99: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    n: sorted.length,
    mean: +(sum / sorted.length).toFixed(2),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    p99: quantile(sorted, 0.99),
    max: sorted[sorted.length - 1],
  };
}

async function main() {
  const args = parseArgs(process.argv);

  const where =
    args.sinceDays !== null
      ? {
          createdAt: {
            gte: new Date(Date.now() - args.sinceDays * 86_400_000),
          },
        }
      : {};

  const rows = await prisma.telemetry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: args.limit,
    include: {
      message: {
        select: {
          id: true,
          type: true,
          status: true,
          projectId: true,
          createdAt: true,
        },
      },
    },
  });

  if (rows.length === 0) {
    console.log("No telemetry rows found.");
    return;
  }

  const total = rows.length;
  const buildOk = rows.filter((r) => r.buildSucceeded).length;
  const errored = rows.filter((r) => r.message?.status === "ERROR").length;

  const stepStats = stats(rows.map((r) => r.steps));
  const writeStats = stats(rows.map((r) => r.filesWritten));
  const readStats = stats(rows.map((r) => r.filesRead));
  const cmdStats = stats(rows.map((r) => r.commandsRun));
  const tokStats = stats(
    rows.map((r) => r.totalTokens ?? 0).filter((v) => v > 0)
  );

  const hitStepCap = rows.filter(
    (r) => r.steps >= AGENT_CONFIG.maxSteps
  ).length;
  const hitWriteCap = rows.filter(
    (r) => r.filesWritten >= AGENT_CONFIG.maxWrites
  ).length;
  const hitReadCap = rows.filter(
    (r) => r.filesRead >= AGENT_CONFIG.maxFileReads
  ).length;
  const hitCmdCap = rows.filter(
    (r) => r.commandsRun >= AGENT_CONFIG.maxTerminalRuns
  ).length;

  const zeroWriteRuns = rows.filter((r) => r.filesWritten === 0).length;
  const zeroCmdRuns = rows.filter((r) => r.commandsRun === 0).length;
  const wroteButNotVerified = rows.filter(
    (r) => r.filesWritten > 0 && !r.buildSucceeded
  ).length;

  const findings: string[] = [];

  if (pct(errored, total) > 20) {
    findings.push(
      `HIGH ERROR RATE: ${pct(errored, total)}% of runs ended in ERROR. Inspect prompts and failure modes.`
    );
  }
  if (pct(buildOk, total) < 60) {
    findings.push(
      `LOW VERIFICATION RATE: only ${pct(buildOk, total)}% of runs completed \`tsc --noEmit\` successfully. Consider reinforcing the VERIFY step in the system prompt.`
    );
  }
  if (pct(wroteButNotVerified, total) > 15) {
    findings.push(
      `UNVERIFIED WRITES: ${pct(wroteButNotVerified, total)}% of runs wrote files without a successful tsc --noEmit. The agent is skipping verification.`
    );
  }
  if (pct(hitStepCap, total) > 25) {
    findings.push(
      `STEP CAP SATURATED: ${pct(hitStepCap, total)}% of runs hit maxSteps=${AGENT_CONFIG.maxSteps}. Consider raising the cap or shortening the prompt.`
    );
  }
  if (pct(hitWriteCap, total) > 25) {
    findings.push(
      `WRITE CAP SATURATED: ${pct(hitWriteCap, total)}% of runs hit maxWrites=${AGENT_CONFIG.maxWrites}. Either raise it or push harder on replaceInFile.`
    );
  }
  if (pct(hitReadCap, total) > 25) {
    findings.push(
      `READ CAP SATURATED: ${pct(hitReadCap, total)}% of runs hit maxFileReads=${AGENT_CONFIG.maxFileReads}. Consider increasing or promoting listFiles.`
    );
  }
  if (pct(hitCmdCap, total) > 15) {
    findings.push(
      `TERMINAL CAP SATURATED: ${pct(hitCmdCap, total)}% of runs hit maxTerminalRuns=${AGENT_CONFIG.maxTerminalRuns}.`
    );
  }
  if (pct(zeroWriteRuns, total) > 30) {
    findings.push(
      `MANY NO-OP RUNS: ${pct(zeroWriteRuns, total)}% of runs wrote zero files. Likely the agent bailed or the prompt was ask-like.`
    );
  }
  if (
    tokStats.p90 >
    AGENT_CONFIG.maxOutputTokens * AGENT_CONFIG.maxSteps * 0.9
  ) {
    findings.push(
      `TOKEN USAGE HIGH: p90 totalTokens=${tokStats.p90}. Consider tightening maxOutputTokens.`
    );
  }
  if (writeStats.p50 <= 1 && buildOk / total > 0.8) {
    findings.push(
      `OPPORTUNITY: typical run writes <=1 file with high success; maxWrites=${AGENT_CONFIG.maxWrites} may be over-provisioned.`
    );
  }

  const report = {
    window: args.sinceDays ? `${args.sinceDays}d` : "all-time",
    sampleSize: total,
    rates: {
      buildSucceededPct: pct(buildOk, total),
      erroredPct: pct(errored, total),
      wroteButNotVerifiedPct: pct(wroteButNotVerified, total),
      zeroWritePct: pct(zeroWriteRuns, total),
      zeroCommandPct: pct(zeroCmdRuns, total),
    },
    capSaturation: {
      steps: pct(hitStepCap, total),
      writes: pct(hitWriteCap, total),
      reads: pct(hitReadCap, total),
      terminal: pct(hitCmdCap, total),
    },
    distributions: {
      steps: stepStats,
      filesWritten: writeStats,
      filesRead: readStats,
      commandsRun: cmdStats,
      totalTokens: tokStats,
    },
    findings,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\nTelemetry Analysis — window: ${report.window}, n=${total}\n`);
  console.log("Success / failure");
  console.log(`  buildSucceeded:      ${report.rates.buildSucceededPct}%`);
  console.log(`  errored:             ${report.rates.erroredPct}%`);
  console.log(`  wrote w/o verify:    ${report.rates.wroteButNotVerifiedPct}%`);
  console.log(`  zero-write runs:     ${report.rates.zeroWritePct}%`);
  console.log(`  zero-command runs:   ${report.rates.zeroCommandPct}%`);

  console.log("\nCap saturation (runs that hit the limit)");
  console.log(
    `  steps    >=${AGENT_CONFIG.maxSteps}:  ${report.capSaturation.steps}%`
  );
  console.log(
    `  writes   >=${AGENT_CONFIG.maxWrites}:  ${report.capSaturation.writes}%`
  );
  console.log(
    `  reads    >=${AGENT_CONFIG.maxFileReads}: ${report.capSaturation.reads}%`
  );
  console.log(
    `  terminal >=${AGENT_CONFIG.maxTerminalRuns}:  ${report.capSaturation.terminal}%`
  );

  const fmt = (s: ReturnType<typeof stats>) =>
    `mean=${s.mean} p50=${s.p50} p90=${s.p90} p99=${s.p99} max=${s.max}`;
  console.log("\nDistributions");
  console.log(`  steps:        ${fmt(stepStats)}`);
  console.log(`  filesWritten: ${fmt(writeStats)}`);
  console.log(`  filesRead:    ${fmt(readStats)}`);
  console.log(`  commandsRun:  ${fmt(cmdStats)}`);
  console.log(`  totalTokens:  ${fmt(tokStats)}`);

  console.log("\nFindings");
  if (findings.length === 0) console.log("  (none — system looks healthy)");
  else for (const f of findings) console.log(`  - ${f}`);
  console.log();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
