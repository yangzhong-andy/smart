import { readFileSync } from 'fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  // 关键：让 Prisma 不被 webpack 打包，运行时直接从 node_modules 加载引擎文件
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
    optimizePackageImports: [
      '@prisma/client',
      'lucide-react',
      '@radix-ui/react-icons',
    ],
  },
  compress: true,
  poweredByHeader: false,
};

export default nextConfig;
