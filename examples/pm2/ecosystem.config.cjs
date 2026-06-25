module.exports = {
  apps: [
    {
      name: 'screenpool',
      script: 'screenpool',
      args: 'server --port 3000 --pool-size 4 --browser chrome@stable --memory-limit 512 --output-dir /var/lib/screenpool/output',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 30000,
      listen_timeout: 15000,
      max_memory_restart: '768M',
      env: {
        NODE_ENV: 'production',
        SCREENPOOL_OUTPUT_DIR: '/var/lib/screenpool/output',
        PUPPETEER_CACHE_DIR: '/var/cache/puppeteer',
      },
    },
  ],
};
