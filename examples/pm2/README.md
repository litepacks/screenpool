# PM2 deployment

```bash
npm install -g screenpool
npx @puppeteer/browsers install chrome@stable

pm2 start examples/pm2/ecosystem.config.cjs
pm2 logs screenpool
pm2 reload screenpool --kill-timeout 30000
pm2 save && pm2 startup
```

Local install:

```js
script: './node_modules/.bin/screenpool',
cwd: __dirname,
interpreter: 'none',
```
