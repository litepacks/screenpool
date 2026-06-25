# Docker notes

Use root `Dockerfile` and `docker-compose.yml`:

```bash
docker compose up -d --build
```

## Scaling

Run multiple containers behind a reverse proxy (nginx/caddy). Each container runs its own Chromium pool — do not use PM2 cluster mode inside a container.

## Volumes

- `/data` — render output (`SCREENPOOL_OUTPUT_DIR`)

## Memory

Set container limit (`768M`) + app `memory.limitMb: 512` for dual protection.
