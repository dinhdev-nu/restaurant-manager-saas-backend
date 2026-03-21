import { Module } from "@nestjs/common";
import { HealthController } from "./health.controler";


@Module({
    controllers: [HealthController],
})
export class HealthModule {}