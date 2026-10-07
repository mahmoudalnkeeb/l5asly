# L5asly

[![Check](https://github.com/mahmoudalnkeeb/l5asly/actions/workflows/check.yml/badge.svg)](https://github.com/mahmoudalnkeeb/l5asly/actions/workflows/check.yml)

L5asly tells you whether a video is worth your time, and if it isn't, what it says.

Give it a video upload or a public video URL, and optionally the question you want answered. It transcribes the video and returns:

- **A short brief** that answers your question first, and says so when the video doesn't contain the answer.
- **A verdict:** watch it, watch only the key moments, or skip it, with the reason.
- **A relevance timeline** of which parts matter to you.
- **The full timestamped transcript.**

For YouTube links, a quick check gives a provisional verdict in a few seconds, before anything is downloaded.

Videos can be in Arabic or English, and the brief can be in either language. An optional profile (your background, goals, and preferred explanation style) tailors the brief. It's stored in your browser and sent to the AI services, so don't put anything sensitive in it.

## Quick start

You need Node.js 24+, pnpm 12, and Docker (for Redis).

```bash
pnpm install
cp .env.example .env
docker compose up -d redis
pnpm dev
```

Open `http://localhost:5173`. The app starts in mock mode with built-in sample results, so it works without API keys. To use the real services, set `PROVIDER_MODE=live` and fill in the keys in `.env` ([configuration](docs/reference/configuration.md)).

To run the whole app in Docker, use `docker compose up -d --build` and open `http://localhost:8080` ([deployment](docs/guides/deployment.md)).

L5asly has no accounts: anyone who can reach it can see every summary and spend your API credit. Run it locally or on a private network, not on the open internet ([details](docs/guides/deployment.md#before-exposing-it-to-a-network)).

## Documentation

The [contributor docs](docs/README.md) cover setup, the codebase, the architecture, and the [HTTP API](docs/reference/http-api.md). [AGENTS.md](AGENTS.md) is the coding standard.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, and report security problems privately as described in [SECURITY.md](SECURITY.md).

## Support

If L5asly saves you time, you can [buy me a coffee on Ko-fi](https://ko-fi.com/mahmoudalnakeeb).

## License

[MIT](LICENSE)
