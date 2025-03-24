/**
 * Logger module for EPUB compression
 */

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
    data?: any;
}

export class Logger {
    private static instance: Logger;
    private logs: LogEntry[] = [];
    private readonly maxLogs: number = 1000;

    private constructor() { }

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    private formatTimestamp(): string {
        return new Date().toISOString();
    }

    private addLog(level: LogLevel, message: string, data?: any) {
        const logEntry: LogEntry = {
            level,
            message,
            timestamp: this.formatTimestamp(),
            data
        };

        this.logs.push(logEntry);

        // Keep logs under the maximum limit
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }

        // Also log to console in development
        if (process.env.NODE_ENV === 'development') {
            const consoleMessage = `[${logEntry.timestamp}] ${level}: ${message}`;
            switch (level) {
                case LogLevel.DEBUG:
                    console.debug(consoleMessage, data);
                    break;
                case LogLevel.INFO:
                    console.info(consoleMessage, data);
                    break;
                case LogLevel.WARN:
                    console.warn(consoleMessage, data);
                    break;
                case LogLevel.ERROR:
                    console.error(consoleMessage, data);
                    break;
            }
        }
    }

    debug(message: string, data?: any) {
        this.addLog(LogLevel.DEBUG, message, data);
    }

    info(message: string, data?: any) {
        this.addLog(LogLevel.INFO, message, data);
    }

    warn(message: string, data?: any) {
        this.addLog(LogLevel.WARN, message, data);
    }

    error(message: string, data?: any) {
        this.addLog(LogLevel.ERROR, message, data);
    }

    getLogs(): LogEntry[] {
        return [...this.logs];
    }

    clearLogs() {
        this.logs = [];
    }

    getLogsByLevel(level: LogLevel): LogEntry[] {
        return this.logs.filter(log => log.level === level);
    }

    getRecentLogs(count: number = 10): LogEntry[] {
        return this.logs.slice(-count);
    }
}

export const logger = Logger.getInstance();