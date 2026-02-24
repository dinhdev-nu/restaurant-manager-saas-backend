import { Injectable } from '@nestjs/common';
import { filter, finalize, map, Subject } from 'rxjs';
import { SseEvent } from './dto/sse-event.dto';

@Injectable()
export class SseService {

  private eventsStreams = new Subject<SseEvent>();

  sendEventToUser(event: SseEvent) {
    this.eventsStreams.next(event);
  }

  // Phương thức này sẽ trả về một Observable mà client có thể đăng ký để nhận các sự kiện SSE
  subscribleToEvents(userId: string) {
    return this.eventsStreams.asObservable().pipe(
      filter((e: SseEvent) => e.userId === userId),
      map((e: SseEvent) => ({ data: e.data, type: e.type } as MessageEvent)),



      finalize(() => console.log(`User ${userId} unsubscribed from SSE events`))
    )
  }

}
