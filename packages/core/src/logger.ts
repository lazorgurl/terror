import { PURPLE, RESET } from "./theme.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const TERROR_PREFIX = `${PURPLE}terror${RESET}`;

export class Logger {
  private minLevel: number;

  constructor(private level: LogLevel = "info") {
    this.minLevel = LEVEL_PRIORITY[level];
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    if (LEVEL_PRIORITY[level] < this.minLevel) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message: `[${TERROR_PREFIX}] ${message}`,
      ...data,
    };

    process.stderr.write(JSON.stringify(entry) + "\n");
  }

  debug(message: string, data?: Record<string, unknown>) {
    this.log("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>) {
    this.log("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.log("warn", message, data);
  }

  error(message: string, data?: Record<string, unknown>) {
    this.log("error", message, data);
  }
}
