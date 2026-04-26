import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@wta/contracts"],
};

export default nextConfig;
