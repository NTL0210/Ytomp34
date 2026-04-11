import { logger } from './logger.service';

/**
 * Error Handler Service
 * Categorizes errors and provides user-friendly messages
 * Requirements: REQ-NFR-005.1, REQ-NFR-005.2, REQ-NFR-005.3
 */

export enum ErrorCategory {
  VALIDATION = 'validation',
  NETWORK = 'network',
  RESOURCE = 'resource',
  SECURITY = 'security',
  SYSTEM = 'system',
  UNKNOWN = 'unknown',
}

export enum RecoveryAction {
  RETRY = 'retry',
  PROMPT = 'prompt',
  ABORT = 'abort',
  DISPLAY = 'display',
}

export interface ErrorInfo {
  category: ErrorCategory;
  message: string;
  userMessage: string;
  recoveryAction: RecoveryAction;
  technicalDetails?: string;
  code?: string;
}

class ErrorHandlerService {
  /**
   * Handle error and return categorized error info
   */
  public handleError(error: any, context?: string): ErrorInfo {
    logger.error('ErrorHandler', 'Handling error', { error, context });

    const errorInfo = this.categorizeError(error);
    errorInfo.userMessage = this.generateUserMessage(errorInfo, context);

    logger.info('ErrorHandler', 'Error categorized', {
      category: errorInfo.category,
      recoveryAction: errorInfo.recoveryAction,
    });

    return errorInfo;
  }

  /**
   * Categorize error based on type and message
   */
  private categorizeError(error: any): ErrorInfo {
    const message = error.message || error.toString();
    const code = error.code || '';

    // Network errors
    if (this.isNetworkError(error, message, code)) {
      return {
        category: ErrorCategory.NETWORK,
        message,
        userMessage: '',
        recoveryAction: RecoveryAction.RETRY,
        code,
        technicalDetails: error.stack,
      };
    }

    // Resource errors (disk space, permissions)
    if (this.isResourceError(error, message, code)) {
      return {
        category: ErrorCategory.RESOURCE,
        message,
        userMessage: '',
        recoveryAction: RecoveryAction.PROMPT,
        code,
        technicalDetails: error.stack,
      };
    }

    // Security errors
    if (this.isSecurityError(error, message)) {
      return {
        category: ErrorCategory.SECURITY,
        message,
        userMessage: '',
        recoveryAction: RecoveryAction.ABORT,
        code,
        technicalDetails: error.stack,
      };
    }

    // Validation errors
    if (this.isValidationError(error, message)) {
      return {
        category: ErrorCategory.VALIDATION,
        message,
        userMessage: '',
        recoveryAction: RecoveryAction.DISPLAY,
        code,
        technicalDetails: error.stack,
      };
    }

    // System errors
    if (this.isSystemError(error, message, code)) {
      return {
        category: ErrorCategory.SYSTEM,
        message,
        userMessage: '',
        recoveryAction: RecoveryAction.ABORT,
        code,
        technicalDetails: error.stack,
      };
    }

    // Unknown errors
    return {
      category: ErrorCategory.UNKNOWN,
      message,
      userMessage: '',
      recoveryAction: RecoveryAction.DISPLAY,
      code,
      technicalDetails: error.stack,
    };
  }

  /**
   * Check if error is network-related
   */
  private isNetworkError(error: any, message: string, code: string): boolean {
    const networkCodes = ['ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH'];
    const networkKeywords = ['network', 'timeout', 'connection', 'dns', 'fetch failed'];

    return (
      networkCodes.includes(code) ||
      networkKeywords.some(keyword => message.toLowerCase().includes(keyword))
    );
  }

  /**
   * Check if error is resource-related
   */
  private isResourceError(error: any, message: string, code: string): boolean {
    const resourceCodes = ['ENOSPC', 'EACCES', 'EPERM', 'EMFILE', 'ENFILE'];
    const resourceKeywords = ['disk space', 'permission denied', 'no space', 'quota exceeded'];

    return (
      resourceCodes.includes(code) ||
      resourceKeywords.some(keyword => message.toLowerCase().includes(keyword))
    );
  }

  /**
   * Check if error is security-related
   */
  private isSecurityError(error: any, message: string): boolean {
    const securityKeywords = [
      'dangerous',
      'threat',
      'malware',
      'virus',
      'blocked',
      'forbidden',
      'unauthorized',
      'path traversal',
    ];

    return securityKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }

  /**
   * Check if error is validation-related
   */
  private isValidationError(error: any, message: string): boolean {
    const validationKeywords = [
      'invalid',
      'validation',
      'required',
      'format',
      'must be',
      'expected',
    ];

    return validationKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }

  /**
   * Check if error is system-related
   */
  private isSystemError(error: any, message: string, code: string): boolean {
    const systemCodes = ['ENOENT', 'EISDIR', 'ENOTDIR', 'EINVAL'];
    const systemKeywords = ['system error', 'internal error', 'unexpected error'];

    return (
      systemCodes.includes(code) ||
      systemKeywords.some(keyword => message.toLowerCase().includes(keyword))
    );
  }

  /**
   * Generate user-friendly error message
   */
  private generateUserMessage(errorInfo: ErrorInfo, context?: string): string {
    const contextPrefix = context ? `${context}: ` : '';

    switch (errorInfo.category) {
      case ErrorCategory.NETWORK:
        return `${contextPrefix}Network error. Please check your internet connection and try again.`;

      case ErrorCategory.RESOURCE:
        if (errorInfo.code === 'ENOSPC') {
          return `${contextPrefix}Insufficient disk space. Please free up some space and try again.`;
        }
        if (errorInfo.code === 'EACCES' || errorInfo.code === 'EPERM') {
          return `${contextPrefix}Permission denied. Please check file permissions or try a different location.`;
        }
        return `${contextPrefix}Resource error. ${errorInfo.message}`;

      case ErrorCategory.SECURITY:
        return `${contextPrefix}Security threat detected. This operation has been blocked for your safety.`;

      case ErrorCategory.VALIDATION:
        return `${contextPrefix}${errorInfo.message}`;

      case ErrorCategory.SYSTEM:
        return `${contextPrefix}System error occurred. Please try again or restart the application.`;

      case ErrorCategory.UNKNOWN:
      default:
        return `${contextPrefix}An unexpected error occurred: ${errorInfo.message}`;
    }
  }

  /**
   * Determine if error should trigger retry
   */
  public shouldRetry(errorInfo: ErrorInfo): boolean {
    return errorInfo.recoveryAction === RecoveryAction.RETRY;
  }

  /**
   * Determine if error should prompt user
   */
  public shouldPrompt(errorInfo: ErrorInfo): boolean {
    return errorInfo.recoveryAction === RecoveryAction.PROMPT;
  }

  /**
   * Determine if operation should abort
   */
  public shouldAbort(errorInfo: ErrorInfo): boolean {
    return errorInfo.recoveryAction === RecoveryAction.ABORT;
  }
}

// Export singleton instance
export const errorHandlerService = new ErrorHandlerService();
