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
    serverComponentsExternalPackages: ['@prisma/client', 'bcrypt'],
    serverActions: {
      bodySizeLimit: '20mb',
    },
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
    ],
  },
  compress: true,
  poweredByHeader: false,
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/supplier-tax', destination: 'http://127.0.0.1:3220/supplier-tax' },
        { source: '/supplier-tax/:path*', destination: 'http://127.0.0.1:3220/supplier-tax/:path*' },
        { source: '/company-finance', destination: 'http://127.0.0.1:3240/company-finance' },
        { source: '/company-finance/:path*', destination: 'http://127.0.0.1:3240/company-finance/:path*' },
      ],
    };
  },
};

export default nextConfig;
