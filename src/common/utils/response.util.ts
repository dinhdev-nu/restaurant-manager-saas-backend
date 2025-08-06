import { Response } from "express";
import { ResponseDTO } from "../interfaces/response.interface";
import { HttpStatus } from "@nestjs/common";

export const ResponseToClient = {
  success: (res: Response, data: any, message?: string) => {
    return res.status(HttpStatus.OK).json({
      status: "success",
      code: 2000,
      message: message || "Request was successful",
      metadata: data
    });
  },

  error: (res: Response, dto: ResponseDTO, httpCode = 500) => {
    return res.status(httpCode).json(dto);
  }
}
