module.exports = {
  apps: [{
    name: 'smart-sdfy',
    script: 'npx',
    args: 'next start -p 3003',
    cwd: '/root/smart',
    env: {
      DATABASE_URL: 'postgresql://smartsdfy:smartsdfy123@localhost:5432/smartsdfy?schema=public'
    }
  }]
};
