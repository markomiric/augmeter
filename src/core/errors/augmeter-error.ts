import { SecureLogger } from "../logging/secure-logger";
import { UserNotificationService } from "../notifications/user-notification-service";

/**
 * Standardized error types for consistent error handling
 */
export enum ErrorType {
  AUTHENTICATION = "authentication",
  NETWORK = "network",
  VALIDATION = "validation",
  CONFIGURATION = "configuration",
  STORAGE = "storage",
  API = "api",
  UNKNOWN = "unknown",
}

/**
 * Custom error class with user-friendly messaging and recovery options
 */
export class AugmeterError extends Error {
  constructor(
    public readonly type: ErrorType,
    message: string,
    public readonly userMessage?: string,
    public readonly recoverable: boolean = true,
    public readonly retryAction?: () => void | Promise<void>
  ) {
    super(message);
    this.name = "AugmeterError";

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AugmeterError);
    }
  }

  /**
   * Create authentication error
   */
  static authentication(message: string, userMessage?: string): AugmeterError {
    return new AugmeterError(
      ErrorType.AUTHENTICATION,
      message,
      userMessage || "Authentication failed. Please sign in again.",
      true
    );
  }

  /**
   * Create network error with retry option
   */
  static network(
    message: string,
    userMessage?: string,
    retryAction?: () => void | Promise<void>
  ): AugmeterError {
    return new AugmeterError(
      ErrorType.NETWORK,
      message,
      userMessage || "Network error occurred. Please check your connection.",
      true,
      retryAction
    );
  }

  /**
   * Create validation error
   */
  static validation(message: string, userMessage?: string): AugmeterError {
    return new AugmeterError(
      ErrorType.VALIDATION,
      message,
      userMessage || "Invalid input. Please check your data and try again.",
      true
    );
  }

  /**
   * Create configuration error
   */
  static configuration(message: string, userMessage?: string): AugmeterError {
    return new AugmeterError(
      ErrorType.CONFIGURATION,
      message,
      userMessage || "Configuration error. Please check your settings.",
      true
    );
  }

  /**
   * Create storage error
   */
  static storage(message: string, userMessage?: string): AugmeterError {
    return new AugmeterError(
      ErrorType.STORAGE,
      message,
      userMessage || "Storage error occurred. Please try again.",
      true
    );
  }

  /**
   * Create API error
   */
  static api(message: string, statusCode?: number, userMessage?: string): AugmeterError {
    let defaultUserMessage = "API error occurred. Please try again.";

    if (statusCode) {
      switch (statusCode) {
        case 401:
          defaultUserMessage = "Authentication expired. Please sign in again.";
          break;
        case 403:
          defaultUserMessage = "Access denied. Please check your permissions.";
          break;
        case 404:
          defaultUserMessage = "Service not found. Please try again later.";
          break;
        case 429:
          defaultUserMessage = "Too many requests. Please wait a moment and try again.";
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          defaultUserMessage = "Server error. Please try again later.";
          break;
      }
    }

    return new AugmeterError(
      ErrorType.API,
      `${message} (Status: ${statusCode || "unknown"})`,
      userMessage || defaultUserMessage,
      statusCode !== 403 // Forbidden errors are typically not recoverable
    );
  }

  /**
   * Create unknown error
   */
  static unknown(message: string, originalError?: unknown): AugmeterError {
    const errorMessage =
      originalError instanceof Error ? `${message}: ${originalError.message}` : message;

    return new AugmeterError(
      ErrorType.UNKNOWN,
      errorMessage,
      "An unexpected error occurred. Please try again.",
      true
    );
  }
}

/**
 * Centralized error handler with consistent user feedback
 */
export class ErrorHandler {
  /**
   * Handle any error with appropriate user feedback
   */
  static async handle(error: unknown, context: string): Promise<void> {
    if (error instanceof AugmeterError) {
      await this.handleAugmeterError(error, context);
    } else if (error instanceof Error) {
      await this.handleGenericError(error, context);
    } else {
      await this.handleUnknownError(error, context);
    }
  }

  /**
   * Handle AugmeterError with type-specific user feedback
   */
  private static async handleAugmeterError(error: AugmeterError, context: string): Promise<void> {
    SecureLogger.error(`${context}: ${error.message}`, {
      type: error.type,
      recoverable: error.recoverable,
      userMessage: error.userMessage,
    });

    if (!error.recoverable) {
      await UserNotificationService.showError(error.userMessage || error.message);
      return;
    }

    switch (error.type) {
      case ErrorType.AUTHENTICATION:
        await UserNotificationService.showAuthError(error.userMessage);
        break;

      case ErrorType.NETWORK:
        await UserNotificationService.showNetworkError(error.userMessage, error.retryAction);
        break;

      case ErrorType.CONFIGURATION:
        await UserNotificationService.showConfigError(error.userMessage);
        break;

      case ErrorType.VALIDATION:
        await UserNotificationService.showWarning(error.userMessage || error.message);
        break;

      case ErrorType.STORAGE:
      case ErrorType.API:
      case ErrorType.UNKNOWN:
      default:
        if (error.retryAction) {
          await UserNotificationService.showError(error.userMessage || error.message, {
            text: "Retry",
            action: error.retryAction,
          });
        } else {
          await UserNotificationService.showError(error.userMessage || error.message);
        }
        break;
    }
  }

  /**
   * Handle generic Error
   */
  private static async handleGenericError(error: Error, context: string): Promise<void> {
    SecureLogger.error(`${context}: ${error.message}`, error);
    await UserNotificationService.showError("An unexpected error occurred. Please try again.");
  }

  /**
   * Handle unknown error type
   */
  private static async handleUnknownError(error: unknown, context: string): Promise<void> {
    SecureLogger.error(`${context}: Unknown error`, error);
    await UserNotificationService.showError("An unexpected error occurred. Please try again.");
  }

  /**
   * Handle error silently (only log, no user notification)
   * Use sparingly and only for non-critical operations
   */
  static handleSilently(error: unknown, context: string): void {
    if (error instanceof AugmeterError) {
      SecureLogger.warn(`${context} (silent): ${error.message}`, {
        type: error.type,
        userMessage: error.userMessage,
      });
    } else if (error instanceof Error) {
      SecureLogger.warn(`${context} (silent): ${error.message}`, error);
    } else {
      SecureLogger.warn(`${context} (silent): Unknown error`, error);
    }
  }

  /**
   * Wrap async operations with error handling
   */
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: string,
    silent: boolean = false
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      if (silent) {
        this.handleSilently(error, context);
      } else {
        await this.handle(error, context);
      }
      return null;
    }
  }
}
