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

Сервис выполняет роль WebSocket-шлюза для счетчиков. Он:
- валидирует `access_token` через внешний auth-сервис;
- держит WebSocket-подключения и отправляет обновления счетчиков;
- читает события из Kafka топика `ws_events`;
- отдает начальные значения счетчиков через REST API.

## Environment

Скопируйте `.env.example` в `.env` и заполните значения:
- `AUTH_SERVICE_VALIDATE_URL` - полный URL валидации access_token;
- `KAFKA_BROKERS` - список брокеров Kafka через запятую;
- `KAFKA_TOPIC_WS_EVENTS` - топик входящих событий (`ws_events` по умолчанию);
- `DATABASE_URL` или параметры `DB_*` для PostgreSQL.

## REST API

### `GET /counters/initial?clientType=employee|admin`

Headers:
- `Authorization: Bearer <access_token>`

Поведение:
- токен валидируется через auth-сервис;
- `userId` берется из payload токена;
- `clientType` берется из query, а если query не передан - из payload токена;
- возвращаются счетчики из таблицы `counters` по связке (`userId`, `clientType`).

Пример ответа:
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

## WebSocket API

Endpoint:
- `ws://<host>:<port>/ws?access_token=<token>&client_type=employee|admin`
- `client_type` можно не передавать, если auth-сервис уже возвращает `clientType` в payload токена.

После успешной валидации токена клиент получает:
```json
{
  "connection": "ok",
  "heartbeatIntervalMs": 25000,
  "reconnectBackoffMs": [1000, 2000, 5000, 10000, 20000]
}
```

Heartbeat:
- ping/pong реализован через настройки Socket.IO (`pingInterval ~25s`).

Серверные события:
- `counter:update`

Соединения:
- сервер поддерживает много одновременных подключений;
- один и тот же пользователь может иметь несколько активных сокетов одновременно (например, несколько вкладок/устройств), обновления отправляются во все его подключения нужного `clientType`.

## Frontend WebSocket integration

Ниже пример для фронта на `socket.io-client`.

1) Установите клиент:
```bash
npm install socket.io-client
```

2) Подключитесь к WS endpoint:
```ts
import { io } from 'socket.io-client';

const accessToken = '<jwt>';
const clientType = 'employee'; // или 'admin'

const socket = io('http://localhost:8082', {
  path: '/ws',
  transports: ['websocket'],
  query: {
    access_token: accessToken,
    client_type: clientType,
  },
  // backoff: 1s, 2s, 5s, 10s, 20s (максимум 20s)
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 20000,
  randomizationFactor: 0,
});
```

3) Обработайте события:
```ts
socket.on('connect', () => {
  console.log('WS connected:', socket.id);
});

socket.on('connection', (payload) => {
  // Успешный handshake:
  // { connection: 'ok', heartbeatIntervalMs: 25000, reconnectBackoffMs: [...] }
  console.log('Handshake payload:', payload);
});

socket.on('counter:update', (payload) => {
  // { userId, clientType, moduleType, number }
  console.log('Counter update:', payload);
  // обновите state/store (Redux/Pinia/Zustand/etc.)
});

socket.on('disconnect', (reason) => {
  console.log('WS disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.error('WS connect error:', error.message);
});
```

4) Heartbeat:
- ping/pong происходит автоматически на уровне Socket.IO;
- на сервере `pingInterval` установлен примерно в `25s`.

5) Важно:
- если токен невалидный, сервер разорвет соединение;
- для пользователя с несколькими вкладками все вкладки получат одинаковое `counter:update`;
- чтобы закрыть соединение при выходе пользователя, вызывайте `socket.disconnect()`.

Пример payload:
```json
{
  "userId": "u-1",
  "clientType": "employee",
  "moduleType": "integration",
  "number": 10
}
```

## Kafka payload

Топик: `ws_events`

Сообщение:
```json
{
  "userId": "u-1",
  "users": [],
  "moduleType": "integration",
  "clientType": "employee"
}
```

Логика обработки:
- если `users` не пустой, обновляются все пользователи из `users`;
- если `users` пустой и заполнен `userId`, обновляется только один пользователь;
- `number` всегда увеличивается на `+1` для (`userId`, `clientType`, `moduleType`);
- после обновления БД событие `counter:update` отправляется в WebSocket-комнаты соответствующих пользователей.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
