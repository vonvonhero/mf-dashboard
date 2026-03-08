import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    "apps/web": {
      ignoreDependencies: ["postcss"],
    },
    "apps/crawler": {
      ignore: ["src/hooks/helpers.ts"],
    },
    "apps/simulator": {
      ignoreDependencies: ["postcss"],
    },
    "apps/mcp": {
      ignoreDependencies: ["@libsql/client"],
    },
  },
};

export default config;
