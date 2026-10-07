# L5asly contributor docs

L5asly turns a video upload or a public video URL into a personalized brief, a timestamped transcript, and a recommendation on whether the video is worth watching. This directory explains how the code is organized and how to work on it. The product itself is described in the [root README](../README.md).

## Start here

If you are new to the codebase, read these in order. Together they take about 30 minutes.

1. [Getting started](onboarding/getting-started.md): install, configure, and run the app locally.
2. [Codebase tour](onboarding/codebase-tour.md): what lives where, and why.
3. [Architecture overview](architecture/overview.md): how the web app, API, queue, and database fit together.
4. [Common tasks](onboarding/common-tasks.md): step-by-step guides for the changes you will make most often.

## Architecture

- [Overview](architecture/overview.md): system diagram, request flow, and key decisions.
- [Summary jobs](architecture/summary-jobs.md): the queue, the processing pipeline, checkpoints, retries, and cleanup.
- [Providers](architecture/providers.md): speech-to-text, SystemOne (Jev), and LLM integrations, plus mock mode.
- [Persistence](architecture/persistence.md): the Turso database, schema upgrades, and repository rules.

## Guides

- [Backend conventions](guides/backend-conventions.md): how NestJS is used in the API (modules, pipes, interceptors, errors, logging).
- [Frontend](guides/frontend.md): the React app's structure, data fetching, and API client.
- [Testing](guides/testing.md): what to test, where tests live, and how to run them.
- [Deployment](guides/deployment.md): running the app with Docker Compose or on your own host.

## Reference

- [HTTP API](reference/http-api.md): endpoints, request and response shapes.
- [Configuration](reference/configuration.md): every environment variable.
- [Error codes](reference/error-codes.md): API error codes and job failure codes.

## Proposals

- [Optimization review](proposals/optimization-review.md): performance work that has been identified but not done yet.

## Ground rules

[AGENTS.md](../AGENTS.md) defines the coding standard for all TypeScript in this repository. Read it before your first pull request. These docs explain how the codebase applies it; they don't repeat it.

When you change behavior that a page here describes, update that page in the same pull request.
