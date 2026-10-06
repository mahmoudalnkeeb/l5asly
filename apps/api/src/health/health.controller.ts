import { Controller, Get, Inject } from "@nestjs/common";

import { APP_CONFIG, type AppConfig } from "../config/app-config.js";

interface HealthStatus {
  status: "ok";
  providerMode: AppConfig["providerMode"];
}

@Controller("health")
export class HealthController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get()
  check(): HealthStatus {
    return { status: "ok", providerMode: this.config.providerMode };
  }
}
