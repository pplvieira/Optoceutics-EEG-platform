import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Set outputFileTracingRoot to silence warning about multiple lockfiles
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
