import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => ({
  server: {
    host: "127.0.0.1",
    port: 4175,
    strictPort: true,
    fs: {
      deny: [
        ".env",
        ".env.*",
        "**/.local/**",
        "**/local-backend/**",
        "**/.git/**",
        "**/*.{pem,crt}",
      ],
    },
  },
  resolve: { dedupe: ["react", "react-dom"] },
  plugins: [
    tsconfigPaths(),
    tailwind(),
    tanstackStart({ server: { entry: "server" } }),
    react(),
    ...(command === "build"
      ? [
          nitro({
            preset: process.env["VERCEL"] ? "vercel" : "node-server",
            // Vercel image optimizer for library uploads (see optimizedImage in catalog.functions).
            vercel: {
              config: {
                version: 3,
                images: {
                  sizes: [256, 640, 1080],
                  domains: [],
                  formats: ["image/webp"],
                  minimumCacheTTL: 86400,
                  remotePatterns: [
                    { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/**" },
                  ],
                },
              },
            },
          }),
        ]
      : []),
  ],
}));
