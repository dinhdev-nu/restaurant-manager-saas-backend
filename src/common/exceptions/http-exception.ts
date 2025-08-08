import { HttpException, HttpStatus } from "@nestjs/common";

export class HttpExceptionConfig extends HttpException {
    public readonly statusCode: number;

    constructor(message: string, htttpStatus: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR, statusCode?: number) {
        super(message, htttpStatus);
        this.statusCode = statusCode || htttpStatus;
    }
}

export class ForbiddenException extends HttpExceptionConfig {
    constructor(message: string = "Forbidden", statusCode: number = HttpStatus.FORBIDDEN) {
        super(message, HttpStatus.FORBIDDEN, statusCode);
    }
}

export class BadRequestException extends HttpExceptionConfig {
    constructor(message: string = "Bad Request", statusCode: number = HttpStatus.BAD_REQUEST) {
        super(message, HttpStatus.BAD_REQUEST, statusCode);
    }
}

export class UnauthorizedException extends HttpExceptionConfig {
    constructor(message: string = "Unauthorized", statusCode: number = HttpStatus.UNAUTHORIZED) {
        super(message, HttpStatus.UNAUTHORIZED, statusCode);
    }
}

export class NotFoundException extends HttpExceptionConfig {
    constructor(message: string = "Not Found", statusCode: number = HttpStatus.NOT_FOUND) {
        super(message, HttpStatus.NOT_FOUND, statusCode);
    }
}

export class InternalServerErrorException extends HttpExceptionConfig {
    constructor(message: string = "Internal Server Error", statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR) {
        super(message, HttpStatus.INTERNAL_SERVER_ERROR, statusCode);
    }
}