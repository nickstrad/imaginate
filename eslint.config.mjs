import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

// Architecture contract — see docs/architecture/architecture.md.
// Element types and the allow-list below mirror the dependency graph in that
// doc. Update them together.
const boundaryElements = [
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
];

// Allow-list per element. Mirrors "Direction of dependencies" in
// docs/architecture/architecture.md.
const elementRules = [
  {
    from: ["app"],
    allow: ["app", "interfaces", "features", "ui", "shared", "generated"],
  },
  {
    from: ["interfaces"],
    allow: [
      "interfaces",
      "agent-application",
      "agent-adapters",
      "agent-ports",
      "features",
      "platform",
      "shared",
      "ui",
      "generated",
    ],
  },
  {
    from: ["features"],
    allow: [
      "features",
      "agent-application",
      "agent-ports",
      "platform",
      "ui",
      "shared",
      "generated",
    ],
  },
  {
    from: ["agent-adapters"],
    allow: [
      "agent-adapters",
      "agent-ports",
      "agent-domain",
      "platform",
      "shared",
      "generated",
    ],
  },
  {
    from: ["agent-application"],
    allow: ["agent-application", "agent-domain", "agent-ports", "shared"],
  },
  {
    from: ["agent-ports"],
    allow: ["agent-ports", "agent-domain", "shared"],
  },
  {
    from: ["agent-domain"],
    allow: ["agent-domain", "shared"],
  },
  {
    from: ["agent-testing"],
    allow: [
      "agent-testing",
      "agent-domain",
      "agent-ports",
      "agent-application",
      "shared",
    ],
  },
  {
    from: ["platform"],
    allow: ["platform", "shared", "generated"],
  },
  {
    from: ["ui"],
    allow: ["ui", "shared"],
  },
  {
    from: ["shared"],
    allow: ["shared"],
  },
  {
    from: ["generated"],
    allow: ["generated"],
  },
];

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ["src/generated/prisma/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/ui/components/ui/**/*.{ts,tsx}", "src/ui/hooks/use-mobile.ts"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
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
