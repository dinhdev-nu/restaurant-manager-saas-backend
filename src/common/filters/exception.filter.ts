import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { ResponseDTO } from '../interfaces/response.interface';
import { Response } from 'express';
import { ResponseToClient } from '../utils/response.util';
import { HttpExceptionConfig } from '../exceptions/http-exception';

@Catch(HttpException)
export class HTTP_ExceptionFilter<T> implements ExceptionFilter {
  catch(exception: T, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const ex = exception as HttpExceptionConfig;
    const status = ex.getStatus(); // http status code
    const message = ex.getResponse();
    const code = ex.statusCode || status; // Code custom 


    const errorRessponse: ResponseDTO = {
      status: 'error',
      code: code,
      message: typeof message === 'string' ? message : (message as any).message || 'An error occurred',
      metadata: null,
    }

    ResponseToClient.error(response, errorRessponse, status);
  }
}
