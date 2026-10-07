# Deployment

Each service has its own Docker image, and `compose.yaml` runs them together:

```bash
cp .env.example .env
docker compose up -d --build
```

Open `http://localhost:8080`. Compose runs three containers:

| Service | What it runs | Data |
| --- | --- | --- |
| `web` | nginx serves the built React app and proxies `/api` to the API (`apps/web/nginx.conf`). The only service exposed to the host besides Redis | |
| `api` | The NestJS API and the queue worker in one process | `api-data` volume (database and uploads) |
| `redis` | The BullMQ queue, with `maxmemory-policy noeviction` | `redis-data` volume |

Provider keys and `PROVIDER_MODE` come from `.env`. Compose overrides the settings that differ inside a container, such as `REDIS_URL` and `DATABASE_PATH`. See [Configuration](../reference/configuration.md) for every variable.

## Running without Docker

- Use a Redis server with `maxmemory-policy noeviction`. BullMQ requires it.
- Give `DATABASE_PATH` and `UPLOAD_DIR` persistent disk.
- The API serves only `/api`. Put something in front of it that serves `apps/web/dist` and proxies `/api`, as `apps/web/nginx.conf` does.

## Limits

The database file, uploaded media, and some job locking live on one host, so you can't run several API instances behind a load balancer yet. See [Limits of the current design](../architecture/overview.md#limits-of-the-current-design).
