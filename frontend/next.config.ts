import type { NextConfig } from "next";

const backend =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3010";

const nextConfig: NextConfig = {
  // 浏览器只开了 13000 时，同源 /api/vouchers 转发到 orchestrator。
  // 链上 tokenURI 还写着已停用的 :3001，不能让前端直连那个地址。
  // /agents 市场页已下线，直接访问时回到首页。
  async redirects() {
    return [{ source: "/agents", destination: "/", permanent: false }];
  },
  async rewrites() {
    return [
      {
        source: "/api/vouchers/:path*",
        destination: `${backend}/api/vouchers/:path*`,
      },
    ];
  },
};

export default nextConfig;
