import { SecureLogger } from "../logging/secure-logger";
import { UserNotificationService } from "../notifications/user-notification-service";

/**
 * Standardized error types for consistent error handling
 */
export enum ErrorType {
  AUTHENTICATION = "authentication",
  NETWORK = "network",
  TIMEOUT = "timeout",
  VALIDATION = "validation",
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
      userMessage || "Your Augment connection expired. Connect again to refresh credits.",
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
      userMessage || "Couldn't reach Augment. Check your connection and try again.",
      true,
      retryAction
    );
  }

  /**
   * Create timeout error (non-retriable by design; surfaces a slow upstream
   * rather than masking it with backoff storms)
   */
  static timeout(message: string, userMessage?: string): AugmeterError {
    return new AugmeterError(
      ErrorType.TIMEOUT,
      message,
      userMessage || "Augment took too long to respond. Check your connection and try again.",
      true
    );
  }

  /**
   * Create validation error
   */
  static validation(message: string, userMessage?: string): AugmeterError {
    return new AugmeterError(
      ErrorType.VALIDATION,
      message,
      userMessage || "That value isn't valid. Check it and try again.",
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
      case ErrorType.TIMEOUT:
        await UserNotificationService.showNetworkError(error.userMessage, error.retryAction);
        break;

      case ErrorType.VALIDATION:
        await UserNotificationService.showWarning(error.userMessage || error.message);
        break;

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
    await UserNotificationService.showError(`Couldn't ${context.toLowerCase()}. Try again.`);
  }

  /**
   * Handle unknown error type
   */
  private static async handleUnknownError(error: unknown, context: string): Promise<void> {
    SecureLogger.error(`${context}: Unknown error`, error);
    await UserNotificationService.showError(`Couldn't ${context.toLowerCase()}. Try again.`);
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
