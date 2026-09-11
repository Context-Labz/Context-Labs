import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for the Cloud Run Dockerfile (standalone server output)
  output: "standalone",
};

export default nextConfig;
