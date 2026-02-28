import { Controller, Sse } from '@nestjs/common';
import { SseService } from './sse.service';
import { Protected, UserSession } from 'src/common/decorator';
import { UserHeaderRequest } from 'src/common/guards/jwt/jwt.guard';

@Controller('events')
export class SseController {
  constructor(private readonly sseService: SseService) {}

  @Sse('stream')
  @Protected()
  streamEvents(@UserSession() user: UserHeaderRequest) {
    const userId = user.ATPayload.sub;
    console.log(`User ${userId} connected to SSE stream`);
    return this.sseService.subscribeToEvents(userId);
  }
  
}
