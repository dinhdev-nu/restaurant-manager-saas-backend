import { Controller, Sse } from '@nestjs/common';
import { SseService } from './sse.service';
import { BypassInterceptors, CurrentUser } from 'src/common/decorators';
import { Types } from 'mongoose';

@Controller('events')
export class SseController {
  constructor(private readonly sseService: SseService) {}

  @Sse('stream')
  @BypassInterceptors()
  streamEvents(@CurrentUser("ID") id: Types.ObjectId) {
    console.log(`User ${id} connected to SSE stream`);
    return this.sseService.subscribeToEvents(id.toString());
  }
  
}
