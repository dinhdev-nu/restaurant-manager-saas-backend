import { Controller, Get } from "@nestjs/common";
import { BypassInterceptors, Public } from "src/common/decorators";

@Controller('health')
export class HealthController {
    @Get()
    @Public()
    @BypassInterceptors()
    checkHealth() {
        return { status: 'ok' };
    }
}