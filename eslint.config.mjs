import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

// Architecture contract — see docs/architecture/architecture.md.
// Element types and the allow-list below mirror the dependency graph in that
// doc. Update them together.
const boundaryElements = [
  // Target elements (final architecture).
  { type: "agent-domain", pattern: "src/agent/domain/**" },
  { type: "agent-application", pattern: "src/agent/application/**" },
  { type: "agent-ports", pattern: "src/agent/ports/**" },
  { type: "agent-adapters", pattern: "src/agent/adapters/**" },
  { type: "agent-testing", pattern: "src/agent/testing/**" },
  { type: "interfaces", pattern: "src/interfaces/**" },
  { type: "features", pattern: "src/features/**" },
  { type: "platform", pattern: "src/platform/**" },
  { type: "shared", pattern: "src/shared/**" },
  { type: "generated", pattern: "src/generated/**" },
  { type: "app", pattern: "src/app/**" },
  { type: "ui", pattern: "src/ui/**" },

  // Legacy elements — temporary escape hatches during the
  // agent-core-architecture migration. Each entry names the chunk that
  // removes it. Chunk 5 deletes this whole block.
  // removed by chunk 03
  { type: "legacy-lib-agents", pattern: "src/lib/agents/**" },
  // removed by chunk 03
  { type: "legacy-lib", pattern: "src/lib/**" },
  // removed by chunk 04
  { type: "legacy-modules", pattern: "src/modules/**" },
  // removed by chunk 04
  { type: "legacy-inngest", pattern: "src/inngest/**" },
  // removed by chunk 04
  { type: "legacy-trpc", pattern: "src/trpc/**" },
];

const targetTypes = [
  "app",
  "interfaces",
  "agent-domain",
  "agent-application",
  "agent-ports",
  "agent-adapters",
  "agent-testing",
  "features",
  "platform",
  "ui",
  "shared",
  "generated",
];

const legacyTypes = [
  "legacy-lib-agents",
  "legacy-lib",
  "legacy-modules",
  "legacy-inngest",
  "legacy-trpc",
];

// Allow-list per element. Mirrors "Direction of dependencies" in
// docs/architecture/architecture.md. Legacy elements are unrestricted to
// avoid lint churn while chunks 2-4 migrate code; chunk 5 deletes them.
const elementRules = [
  {
    from: ["app"],
    allow: [
      "interfaces",
      "features",
      "ui",
      "shared",
      "generated",
      ...legacyTypes,
    ],
  },
  {
    from: ["interfaces"],
    allow: [
      "agent-application",
      "agent-adapters",
      "agent-ports",
      "features",
      "platform",
      "shared",
      "ui",
      "generated",
      ...legacyTypes,
    ],
  },
  {
    from: ["features"],
    allow: [
      "agent-application",
      "agent-ports",
      "platform",
      "ui",
      "shared",
      "generated",
      ...legacyTypes,
    ],
  },
  {
    from: ["agent-adapters"],
    allow: ["agent-ports", "agent-domain", "platform", "shared", "generated"],
  },
  {
    from: ["agent-application"],
    allow: ["agent-domain", "agent-ports", "shared"],
  },
  {
    from: ["agent-ports"],
    allow: ["agent-domain", "shared"],
  },
  {
    from: ["agent-domain"],
    allow: ["shared"],
  },
  {
    from: ["agent-testing"],
    allow: ["agent-domain", "agent-ports", "agent-application", "shared"],
  },
  {
    from: ["platform"],
    allow: ["shared", "generated"],
  },
  {
    from: ["ui"],
    // legacy-lib allowed temporarily for `@/lib/utils` (cn/clsx helper).
    // removed by chunk 03 once `src/lib/utils` moves to `src/shared`.
    allow: ["shared", "ui", "legacy-lib"],
  },
  {
    from: ["shared"],
    allow: ["shared"],
  },
  {
    from: ["generated"],
    allow: ["generated"],
  },
  // Legacy: unrestricted during migration. Removed by chunk 5.
  {
    from: legacyTypes,
    allow: [...targetTypes, ...legacyTypes],
  },
];

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ["src/generated/prisma/**"],
  },
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": boundaryElements,
      "boundaries/include": ["src/**/*"],
      "import/resolver": {
        typescript: { alwaysTryTypes: true, project: "./tsconfig.json" },
        node: true,
      },
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message:
            "Import from '${dependency.type}' is not allowed in '${file.type}'. See docs/architecture/architecture.md.",
          rules: elementRules,
        },
      ],
    },
  },
];

export default eslintConfig;
