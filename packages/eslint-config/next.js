import pluginNext from "@next/eslint-plugin-next";
import { config as baseConfig } from "./base.js";

export const nextJsConfig = [
  ...baseConfig,
  {
    plugins: { "@next/next": pluginNext },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
    },
  },
];
