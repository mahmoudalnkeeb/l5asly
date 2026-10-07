import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";

import { ApiExceptionFilter } from "./common/api-exception.filter.js";
import { assignRequestId } from "./common/request-id.js";
import { ResponseEnvelopeInterceptor } from "./common/response-envelope.interceptor.js";
import { APP_CONFIG, type AppConfig } from "./config/app-config.js";
import { ConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health/health.controller.js";
import { SummariesModule } from "./summaries/summaries.module.js";

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.logLevel,
          genReqId: assignRequestId,
          redact: {
            paths: ["req.headers.authorization", "req.headers.cookie"],
            censor: "[redacted]",
          },
        },
      }),
    }),
    DatabaseModule,
    BullModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        connection: { url: config.redisUrl },
      }),
    }),
    SummariesModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
