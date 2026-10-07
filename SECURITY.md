# Security

## Reporting a vulnerability

Please don't open a public issue for a security problem. Report it privately through [GitHub's private vulnerability reporting](https://github.com/mahmoudalnkeeb/l5asly/security/advisories/new) instead. Include the steps to reproduce it and the impact you expect.

You should get a reply within a week. Once a fix is released, the advisory is published with credit to you, unless you'd rather stay anonymous.

## Supported versions

Only the latest commit on `main` gets security fixes.

## Deployment model

L5asly is built to be self-hosted by one person or a small trusted group. It has no accounts, so anyone who can reach it can see, retry, and delete every summary and spend the configured API credit. Reports that depend only on this, such as "an unauthenticated user can delete a summary", are expected behavior rather than vulnerabilities. [Deployment](docs/guides/deployment.md#before-exposing-it-to-a-network) explains how to run it safely.

Issues that still apply in that model are in scope, for example:

- Reading or writing files outside the data directory
- Running commands on the host through crafted URLs or uploads
- Making the server fetch internal network addresses
- Leaking provider API keys
- Cross-site scripting in the web app
