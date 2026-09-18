import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig(async ({ command }) => {
  const plugins = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    react(),
  ];

  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    // Cloudflare Cron Triggers reach Nitro's cloudflare-module preset via a
    // "cloudflare:scheduled" hook, not a hand-written `scheduled` export —
    // see src/lib/nitro-scheduled.server.ts for why this is required.
    plugins.push(nitro({ preset: "cloudflare-module", plugins: ["./src/lib/nitro-scheduled.server.ts"] }));
  }

  return {
    plugins,
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
    server: {
      host: "::",
      port: 8080,
      allowedHosts: [".trycloudflare.com"],
    },
  };
});
