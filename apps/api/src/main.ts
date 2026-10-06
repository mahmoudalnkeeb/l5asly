import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module.js";
import { configureApp } from "./app.setup.js";
import { APP_CONFIG, type AppConfig } from "./config/app-config.js";

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  bufferLogs: true,
});
const config = app.get<AppConfig>(APP_CONFIG);
configureApp(app, config);

await app.listen(config.port);
app
  .get(Logger)
  .log(
    { port: config.port, providerMode: config.providerMode },
    "l5sly API is listening",
  );
