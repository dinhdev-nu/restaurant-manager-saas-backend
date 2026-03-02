import { ValidationPipe } from "@nestjs/common";

export class ValidationPipeConfig extends ValidationPipe {
  constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  }
}