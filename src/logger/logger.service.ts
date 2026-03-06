import { LoggerService, Injectable } from "@nestjs/common";
import { AppConfigService } from "src/config/config.service";
import * as winston from "winston";
import 'winston-daily-rotate-file';


@Injectable()
export class AppLoggerService implements LoggerService {
    private readonly logger: winston.Logger;

    constructor(
      private readonly config: AppConfigService
    ) {
      const logConfig = this.config.log;

      this.logger = winston.createLogger({
        level: logConfig.level,
        format: winston.format.combine(
          winston.format.errors({ stack: true }),
          winston.format.timestamp(),
        ),
        transports: [
          new winston.transports.Console({
            silent: this.config.isProduction,
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.printf((info) => {
                const { timestamp, level, message, correlationId, stack, ...meta } = info;
                const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
                let log = `[${timestamp}] [${level}] [${correlationId || 'N/A'}] - ${message} - ${metaStr ? ' ' + metaStr : ''}`;
                if (stack) log += `\n${stack}`;
                return log;
              })
            )
          }),

          new winston.transports.DailyRotateFile({
            dirname: logConfig.dir,
            filename: `${logConfig.fileName}-%DATE%.log`,
            datePattern: "YYYY-MM-DD",
            zippedArchive: true,
            maxSize: logConfig.maxSize + "m",
            maxFiles: logConfig.maxFiles + "d",
            format: winston.format.json()
          }),

          new winston.transports.DailyRotateFile({
            dirname: logConfig.dir,
            filename: "error-%DATE%.log",
            datePattern: "YYYY-MM-DD",
            zippedArchive: true,
            maxSize: logConfig.maxSize + "m",
            maxFiles: logConfig.maxFiles + "d",
            level: 'error',
            format: winston.format.json()
          })
        ]
      })
    }

    log(message: string, meta: Record<string, any> = {}) {
        this.logger.info(message, meta);
    }

    error(message: string, meta: Record<string, any> = {}) {
        this.logger.error(message, meta);
    }

    warn(message: string, meta: Record<string, any> = {}) {
        this.logger.warn(message, meta);
    }

    debug(message: string, meta: Record<string, any> = {}) {
        this.logger.debug(message, meta);
    }

    verbose(message: string, meta: Record<string, any> = {}) {
        this.logger.verbose(message, meta);
    }
}