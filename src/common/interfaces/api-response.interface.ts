import { ErrorCode } from "../constants/error-code.constant";

export interface ApiErrorRessponse {
    success: boolean;
    errorCode: ErrorCode;
    message: string;
    details: unknown | null;
    path: string;
    correlationId: string;
    timestamp: string;
}

export interface ApiSuccessResponse<T> {
    success: boolean;
    statusCode: number;
    message: string;
    data: T;
    correlationId: string;
    timestamp: string;
}
