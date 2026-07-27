# Purge Chat

Purge Chat is a real-time chat application built around short-lived rooms and disappearing conversation history. It is designed for private, temporary exchanges where the conversation should not remain available indefinitely.

The app combines live messaging, room expiration, owner-controlled backup, and client-side encryption so that a room can be used for a limited window and then disappear cleanly.

## What the app does

- Creates temporary chat rooms with a configurable lifespan.
- Supports live messaging in a room through WebSockets.
- Removes a room automatically when its lifetime expires.
- Allows the room owner to create an encrypted backup before the room closes.
- Lets the owner purge a room manually.
- Supports restoring encrypted backups locally in the browser with a secret key.

## Core principles

- Short-lived conversations by default
- Minimal persistence beyond the active room window
- Private by design
- Client-side encryption before sensitive content is uploaded

## Technology stack

- Next.js for the web application
- React and TypeScript for the frontend
- Socket.IO for real-time communication
- Drizzle ORM with MySQL for persistence
- Upstash Redis for room metadata caching
- Tailwind CSS and shadcn/ui for the interface

## Required environment variables

Set the following environment variables before running the app:

```bash
DATABASE_URL=your_mysql_connection_string
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
```

Optional:

```bash
PORT=3000
HOSTNAME=localhost
```

## Getting started

Install dependencies:

```bash
pnpm install
```

Start the development server:

```bash
pnpm dev
```

The app will run locally on the configured port, typically 3000.

## Useful commands

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm db:push
```

## Project structure

- app/ contains the Next.js routes and page components
- components/ contains reusable UI components
- db/ contains the schema and database setup
- lib/ contains encryption, identity, Redis, and room lifecycle helpers
- server.ts starts the HTTP server and Socket.IO layer

## How the room lifecycle works

1. A room is created with an expiration time.
2. Messages are stored while the room remains active.
3. If the room reaches its expiration time and is not backed up, it is purged.
4. If the owner creates a backup, the room can remain active for the current session while preserving an encrypted snapshot for later restore.

## Netlify deployment notes

This project is now set up to build as a Next.js application, but the chat features still depend on external services for persistence and realtime behavior:

- MySQL database via DATABASE_URL
- Upstash Redis via UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
- A Socket.IO-compatible host if you want full realtime messaging beyond the fallback polling behavior

For Netlify, configure the environment variables in the site dashboard under Site settings → Environment variables.

Recommended deployment flow:

1. Connect the repository to Netlify.
2. Set the build command to pnpm build.
3. Set the publish directory to .next.
4. Add the required environment variables.
5. Deploy.

If you want the realtime experience to be fully hosted outside Netlify, point NEXT_PUBLIC_SOCKET_URL to your own Socket.IO server.

## Notes on security

The backup flow uses client-side encryption before the data is sent to the server. The server stores the encrypted payload, but it does not have the secret key needed to decrypt it. That means the restoration process depends on the user retaining the backup key.
