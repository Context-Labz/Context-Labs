import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Run Dockerfile needs standalone. Vercel sets VERCEL=1 and should
  // use the default Next output instead.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
};

export default nextConfig;
