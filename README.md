<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

This service works as a WebSocket gateway for counters. It:
- validates `token` through an external auth service;
- keeps WebSocket connections and pushes counter updates;
- consumes events from the Kafka topic `ws_events`;
- returns initial counter values through REST API.

## Environment

Copy `.env.example` to `.env` and fill in the values:
- `AUTH_SERVICE_VALIDATE_URL` - full URL for token validation (for example `http://localhost:9091/auth/validate`);
- `KAFKA_BROKERS` - comma-separated list of Kafka brokers;
- `KAFKA_TOPIC_WS_EVENTS` - incoming events topic (`ws_events` by default);
- `DATABASE_URL` or `DB_*` PostgreSQL parameters.

## REST API

### `GET /counters/initial?clientType=employee|admin`

Headers:
- `Authorization: Bearer <access_token>`

Behavior:
- token is validated through auth service request `GET <AUTH_SERVICE_VALIDATE_URL>?token=<token>` and must return `true`;
- `userId` is taken from token payload;
- `clientType` is taken from query, and if query is not provided - from token payload;
- counters are returned from the `counters` table for (`userId`, `clientType`).

Response example:
```json
{
  "userId": "u-1",
  "clientType": "employee",
  "counters": [
    { "moduleType": "integration", "number": 3 },
    { "moduleType": "risk_object", "number": 9 }
  ]
}
```

Swagger UI:
- `http://<host>:<port>/api/docs`

### `POST /counters/reset`

Headers:
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`

Request body:
```json
{
  "userId": "u-1",
  "clientType": "employee",
  "moduleType": "integration"
}
```

Behavior:
- finds one row by (`userId`, `clientType`, `moduleType`);
- sets `number` to `0`;
- sets `data` to `null`.

Response example:
```json
{
  "userId": "u-1",
  "clientType": "employee",
  "moduleType": "integration",
  "number": 0,
  "data": null
}
```

## WebSocket API

Endpoint:
- `ws://<host>:<port>/ws?token=<token>&client_type=employee|admin`
- `client_type` can be omitted if auth service already returns `clientType` in token payload.

After successful token validation, the client receives:
```json
{
  "connection": "ok",
  "heartbeatIntervalMs": 25000,
  "reconnectBackoffMs": [1000, 2000, 5000, 10000, 20000]
}
```

Heartbeat:
- ping/pong is handled by Socket.IO settings (`pingInterval ~25s`).

Server events:
- `counter:update` - persisted counter update (`valueType = "counter"`)
- `text:update` - non-persistent text payload (`valueType = "text"`)

Connections:
- server supports multiple concurrent connections;
- the same user can have several active sockets at the same time (for example, multiple tabs/devices), updates are sent to all connections for the required `clientType`.

## Frontend WebSocket integration

Below is an example for frontend integration using `socket.io-client`.

1) Install client:
```bash
npm install socket.io-client
```

2) Connect to the WS endpoint:
```ts
import { io } from 'socket.io-client';

const accessToken = '<jwt>';
const clientType = 'employee'; // or 'admin'

const socket = io('http://localhost:8082', {
  path: '/ws',
  transports: ['websocket'],
  query: {
    token: accessToken,
    client_type: clientType,
  },
  // backoff: 1s, 2s, 5s, 10s, 20s (max 20s)
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 20000,
  randomizationFactor: 0,
});
```

3) Handle events:
```ts
socket.on('connect', () => {
  console.log('WS connected:', socket.id);
});

socket.on('connection', (payload) => {
  // Successful handshake:
  // { connection: 'ok', heartbeatIntervalMs: 25000, reconnectBackoffMs: [...] }
  console.log('Handshake payload:', payload);
});

socket.on('counter:update', (payload) => {
  // { userId, companyId, valueType: 'counter', clientType, moduleType, number, data? }
  console.log('Counter update:', payload);
  // update your state/store (Redux/Pinia/Zustand/etc.)
});

socket.on('text:update', (payload) => {
  // { userId, companyId, valueType: 'text', entityId, clientType, moduleType, data }
  console.log('Text update:', payload);
});

socket.on('disconnect', (reason) => {
  console.log('WS disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.error('WS connect error:', error.message);
});
```

4) Heartbeat:
- ping/pong is handled automatically by Socket.IO;
- server `pingInterval` is set to about `25s`.

5) Important:
- if token is invalid, server closes the connection;
- for a user with multiple tabs, all tabs will receive the same `counter:update`;
- to close the connection on user logout, call `socket.disconnect()`.

Payload example:
```json
{
  "userId": "u-1",
  "companyId": "4fbe5fd8-e9ec-4fd3-97a8-8d31edfa0678",
  "valueType": "counter",
  "clientType": "employee",
  "moduleType": "integration",
  "number": 10,
  "data": {
    "status": "approved",
    "source": "risk-check"
  }
}
```

## Kafka payload

Topic: `ws_events`

Message:
```json
{
  "userId": "u-1",
  "users": ["u-1", "u-2"],
  "companyId": "4fbe5fd8-e9ec-4fd3-97a8-8d31edfa0678",
  "valueType": "counter",
  "moduleType": "integration",
  "clientType": "employee",
  "data": {
    "status": "approved",
    "entityId": "risk-object-17"
  }
}
```

Examples:

`counter` event for one user (`userId`):
```json
{
  "userId": "u-1",
  "companyId": "4fbe5fd8-e9ec-4fd3-97a8-8d31edfa0678",
  "valueType": "counter",
  "moduleType": "integration",
  "clientType": "employee"
}
```

`counter` event for multiple users (`users`):
```json
{
  "users": ["u-1", "u-2", "u-3"],
  "companyId": "4fbe5fd8-e9ec-4fd3-97a8-8d31edfa0678",
  "valueType": "counter",
  "moduleType": "risk_object",
  "clientType": "admin",
  "data": {
    "status": "created",
    "entityId": "risk-object-22"
  }
}
```

`text` event for one user (`entityId` and `data` are required and not persisted):
```json
{
  "userId": "u-1",
  "companyId": "4fbe5fd8-e9ec-4fd3-97a8-8d31edfa0678",
  "valueType": "text",
  "entityId": "integration-connection-42",
  "moduleType": "integration",
  "clientType": "employee",
  "data": {
    "title": "New integration alert",
    "message": "Connection requires re-authorization"
  }
}
```

`text` event for multiple users:
```json
{
  "users": ["u-10", "u-11"],
  "companyId": "7bd2ce0c-b857-4f8a-8939-84845cd6dd8f",
  "valueType": "text",
  "entityId": "risk-object-501",
  "moduleType": "risk_object",
  "clientType": "admin",
  "data": {
    "title": "Review required",
    "message": "Risk object #501 needs approval"
  }
}
```

Processing logic:
- if `users` is not empty, all users from `users` are updated;
- if `users` is empty and `userId` is provided, only one user is updated;
- `companyId` is required and must be a UUID;
- `valueType` is required and must be either `counter` or `text`;
- for `valueType = counter`: `number` is incremented by `+1` for (`userId`, `companyId`, `clientType`, `moduleType`);
- for `valueType = counter`: `data` is optional; if present, it is saved to DB and sent in `counter:update`;
- for `valueType = text`: payload is not saved to DB and is sent immediately to clients as `text:update`; `entityId` and `data` are required.

## Database schema

The service uses PostgreSQL and stores counters in the `counters` table.

### Table: `counters`

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `serial` / `int` | no | Primary key |
| `user_id` | `varchar` | no | Target user identifier |
| `client_type` | `varchar` | no | Client scope (`employee` or `admin`) |
| `module_type` | `varchar` | no | Module scope (for example `integration`, `risk_object`) |
| `company_id` | `uuid` | no | Company scope from Kafka message |
| `number` | `int` | no | Counter value |
| `data` | `jsonb` | yes | Optional payload from Kafka event |

### Constraints

- Primary key: `id`
- Unique constraint: `uq_counters_scope` on (`user_id`, `client_type`, `module_type`, `company_id`)

### Update rules

- Kafka event with `valueType = counter` increments `number` by `+1` for the matching scope row.
- If `data` is present in a `counter` event, `data` is saved/updated in the same row.
- Kafka event with `valueType = text` is not persisted and is emitted directly to WebSocket clients.
- `POST /counters/reset` sets `number = 0` and `data = null` for the selected (`userId`, `clientType`, `moduleType`) row.

