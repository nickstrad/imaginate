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
  {
    type: "feature-view",
    pattern: "src/features/*/presentation/**/components/**",
  },
  { type: "feature-view", pattern: "src/features/*/presentation/**/views/**" },
  {
    type: "feature-container",
    pattern: "src/features/*/presentation/**/containers/**",
  },
  { type: "features", pattern: "src/features/**" },
  // More specific platform pattern must come before the generic platform
  // entry so eslint-plugin-boundaries classifies these files first.
  { type: "platform-trpc-client", pattern: "src/platform/trpc-client/**" },
  { type: "platform", pattern: "src/platform/**" },
  { type: "shared", pattern: "src/shared/**" },
  { type: "generated", pattern: "src/generated/**" },
  { type: "app", pattern: "src/app/**" },
  { type: "ui", pattern: "src/ui/**" },
];

// Allow-list per element. Mirrors "Direction of dependencies" in
// docs/architecture/architecture.md.
const to = (...types) => [{ to: { type: types } }];
const elementRules = [
  {
    from: { type: "app" },
    allow: to(
      "app",
      "interfaces",
      "features",
      "feature-view",
      "feature-container",
      "platform-trpc-client",
      "ui",
      "shared",
      "generated"
    ),
  },
  {
    from: { type: "interfaces" },
    allow: to(
      "interfaces",
      "agent-application",
      "agent-adapters",
      "agent-ports",
      "features",
      "platform",
      "platform-trpc-client",
      "shared",
      "ui",
      "generated"
    ),
  },
  {
    from: { type: "features" },
    allow: to(
      "features",
      "feature-view",
      "feature-container",
      "agent-application",
      "agent-ports",
      "platform",
      "platform-trpc-client",
      "ui",
      "shared",
      "generated"
    ),
  },
  {
    from: { type: "feature-container" },
    allow: to(
      "features",
      "feature-view",
      "feature-container",
      "agent-application",
      "agent-ports",
      "platform",
      "platform-trpc-client",
      "ui",
      "shared",
      "generated"
    ),
  },
  {
    from: { type: "feature-view" },
    allow: to("feature-view", "ui", "shared", "generated"),
  },
  {
    from: { type: "agent-adapters" },
    allow: to(
      "agent-adapters",
      "agent-ports",
      "agent-domain",
      "platform",
      "shared",
      "generated"
    ),
  },
  {
    from: { type: "agent-application" },
    allow: to("agent-application", "agent-domain", "agent-ports", "shared"),
  },
  {
    from: { type: "agent-ports" },
    allow: to("agent-ports", "agent-domain", "shared"),
  },
  {
    from: { type: "agent-domain" },
    allow: to("agent-domain", "shared"),
  },
  {
    from: { type: "agent-testing" },
    allow: to(
      "agent-testing",
      "agent-domain",
      "agent-ports",
      "agent-application",
      "shared"
    ),
  },
  {
    from: { type: "platform" },
    allow: to("platform", "platform-trpc-client", "shared", "generated"),
  },
  {
    // The typed React tRPC client lives here so any layer (features, app,
    // interfaces) can consume `useTRPC` without violating direction-of-
    // dependencies. It type-imports `AppRouter` from `interfaces/trpc/routers`,
    // so this element is allowed to reach into `interfaces` — no other slice
    // of `platform/` is.
    from: { type: "platform-trpc-client" },
    allow: to(
      "platform-trpc-client",
      "platform",
      "interfaces",
      "shared",
      "generated"
    ),
  },
  {
    from: { type: "ui" },
    allow: to("ui", "shared"),
  },
  {
    from: { type: "shared" },
    allow: to("shared"),
  },
  {
    from: { type: "generated" },
    allow: to("generated"),
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
    files: [
      "src/features/*/presentation/**/components/**/*.{ts,tsx}",
      "src/features/*/presentation/**/views/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@tanstack/react-query",
              message:
                "Dumb views must not fetch data. Move data wiring to a sibling containers/ file.",
            },
            {
              name: "next/navigation",
              message:
                "Dumb views must not route. Move navigation to a sibling containers/ file.",
            },
            {
              name: "sonner",
              message:
                "Dumb views must not toast. Surface errors via props from the container.",
            },
          ],
          patterns: [
            {
              group: ["@/platform/trpc-client", "@/platform/trpc-client/*"],
              message:
                "Dumb views must not call useTRPC. Move data wiring to a sibling containers/ file.",
            },
          ],
        },
      ],
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
            "Import from '{{to.type}}' is not allowed in '{{from.type}}'. See docs/architecture/architecture.md.",
          rules: elementRules,
        },
      ],
    },
  },
];

export default eslintConfig;
