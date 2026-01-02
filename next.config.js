/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse']
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }
    
    // Fix PDF.js worker issue
    config.module.rules.push({
      test: /\.worker\.mjs$/,
      type: 'javascript/auto',
    });
    
    return config;
  },
}

module.exports = nextConfig
