import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@wta/contracts"],
  output: 'export',
};

export default nextConfig;
