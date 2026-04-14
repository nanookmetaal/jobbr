/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enables lightweight standalone output for Docker
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
