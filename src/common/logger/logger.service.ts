// src/logger/logger.service.ts
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LoggerService {
  private readonly logDir: string;
  private readonly logMaxSizeMB: number;
  private readonly logFileNamePattern: string;

  constructor() {
    this.logDir = process.env.LOG_DIR || 'logs';
    this.logMaxSizeMB = parseInt(process.env.LOG_MAX_SIZE || '5') || 5;
    this.logFileNamePattern = process.env.LOG_FILE_NAME || 'log_xxx.log';

    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  writeLog(message: string): void {
    let idx = 1;
    let currentFileName = this.logFileNamePattern.replace('xxx', idx.toString());
    let fullPath = path.join(this.logDir, currentFileName);

    while (this.isFileSizeExceeded(fullPath)) {
      idx++;
      currentFileName = this.logFileNamePattern.replace('xxx', idx.toString());
      fullPath = path.join(this.logDir, currentFileName);
    }

    fs.appendFileSync(fullPath, message + '\n', { encoding: 'utf8' });
  }

  private isFileSizeExceeded(filePath: string): boolean {
    const maxSizeBytes = this.logMaxSizeMB * 1024 * 1024;
    return fs.existsSync(filePath) && fs.statSync(filePath).size >= maxSizeBytes;
  }
}
