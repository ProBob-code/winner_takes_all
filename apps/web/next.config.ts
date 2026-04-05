import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@wta/contracts"],
  typedRoutes: true
};

export default nextConfig;
