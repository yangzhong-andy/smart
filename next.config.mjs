import { readFileSync } from 'fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  // 放宽请求体大小，避免带多图添加产品时 413 / 请求体过大
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

export default nextConfig;

