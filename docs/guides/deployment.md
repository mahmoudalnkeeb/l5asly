# Deployment

Each service has its own Docker image, and `compose.yaml` runs them together:

```bash
cp .env.example .env
docker compose up -d --build
```

Open `http://localhost:8080`. Compose runs three containers:

| Service | What it runs | Data |
| --- | --- | --- |
| `web` | nginx serves the built React app and proxies `/api` to the API (`apps/web/nginx.conf`). The only service exposed to the host besides Redis, which listens on `127.0.0.1` only | |
| `api` | The NestJS API and the queue worker in one process | `api-data` volume (database and uploads) |
| `redis` | The BullMQ queue, with `maxmemory-policy noeviction` | `redis-data` volume |

Provider keys and `PROVIDER_MODE` come from `.env`. Compose overrides the settings that differ inside a container, such as `REDIS_URL` and `DATABASE_PATH`. See [Configuration](../reference/configuration.md) for every variable.

## Before exposing it to a network

L5asly has no accounts. Anyone who can reach it can see, retry, and delete every summary, and every job they start spends your Deepgram and LLM credit. Run it on your own machine or a private network, or put it behind something that authenticates users, such as a VPN, Tailscale, or a reverse proxy with login. Don't publish it to the internet as is.

## Upgrading from `l5sly.db`

Earlier versions named the database `l5sly.db`. The default is now `l5asly.db`, so an existing deployment starts with an empty library until you rename it. Stop the API first, and rename the `-wal` and `-shm` files along with the database, because they can hold writes that aren't in the main file yet. With Compose:

```bash
docker compose stop api
```

```bash
docker compose run --rm --no-deps api sh -c 'for file in data/l5sly.db*; do mv "$file" "data/l5asly.db${file#data/l5sly.db}"; done'
```

Without Docker, rename the same files in your data directory, or set `DATABASE_PATH` to the old name.

## Running without Docker

- Use a Redis server with `maxmemory-policy noeviction`. BullMQ requires it.
- Give `DATABASE_PATH` and `UPLOAD_DIR` persistent disk.
- The API serves only `/api`. Put something in front of it that serves `apps/web/dist` and proxies `/api`, as `apps/web/nginx.conf` does.

## Limits

The database file, uploaded media, and some job locking live on one host, so you can't run several API instances behind a load balancer yet. See [Limits of the current design](../architecture/overview.md#limits-of-the-current-design).
