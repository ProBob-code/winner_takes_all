/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@wta/contracts"],
  output: "standalone",
};

export default nextConfig;
