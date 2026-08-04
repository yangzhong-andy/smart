// Keep this legacy single-app config aligned with the shared production PM2
// config. In particular, NextAuth must receive the same secret on every
// restart or existing sessions become invalid and the app refuses to start.
const sharedConfig = require('/root/ecosystem.config.js');
const sharedEnv = sharedConfig.apps.find((app) => app.name === 'smart-sdfy')?.env || {};

module.exports = {
  apps: [{
    name: 'smart-sdfy',
    script: '/usr/bin/npx',
    args: 'next start -p 3003',
    cwd: '/root/smart-sdfy',
    env: {
      ...sharedEnv,
      APP_NAME: 'sdfy',
      DATABASE_URL: sharedEnv.DATABASE_URL,
      NEXTAUTH_URL: sharedEnv.NEXTAUTH_URL,
      NODE_ENV: 'production',
    },
  }],
};
