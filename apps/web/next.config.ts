import type { NextConfig } from 'next';
import { getApiOrigin } from './lib/env';

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: '/accept-invitation', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
    ];
  },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${getApiOrigin()}/api/v1/:path*` }];
  },
};

export default nextConfig;
