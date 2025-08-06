import { Injectable, NestMiddleware } from '@nestjs/common';
import helmet from 'helmet';

@Injectable()
export class HelmetMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    helmet(
      // Configure helmet options here if needed
    )(req, res, next);
  }
}
