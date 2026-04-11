import { urlValidator } from './url-validator.service';
import { logger } from './logger.service';
import type { ValidationResult } from '../../shared/types';

/**
 * Security Service
 * Analyzes URLs for security risks and determines blocking decisions
 * Requirements: REQ-FUN-001.5, REQ-FUN-001.6, REQ-FUN-001.7, REQ-FUN-001.8
 */

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface SecurityAnalysis {
  riskLevel: RiskLevel;
  shouldBlock: boolean;
  validationResult: ValidationResult;
  riskFactors: string[];
  recommendations: string[];
}

class SecurityService {
  /**
   * Analyze URL for security risks
   * Combines all security checks and determines risk level
   */
  public async analyzeURL(url: string): Promise<SecurityAnalysis> {
    logger.debug('Security', 'Analyzing URL', { url });

    // Get validation result
    const validationResult = await urlValidator.validateURL(url);

    // Calculate risk level
    const riskFactors: string[] = [];
    let riskScore = 0;

    // Critical: Validation errors (dangerous protocols, invalid format)
    if (!validationResult.isValid) {
      riskScore += 100; // Critical
      riskFactors.push(...validationResult.errors);
    }

    // Analyze warnings for risk factors
    for (const warning of validationResult.warnings) {
      if (warning.includes('IP address')) {
        riskScore += 20;
        riskFactors.push('Uses IP address instead of domain');
      }

      if (warning.includes('subdomain depth')) {
        riskScore += 30;
        riskFactors.push('Suspicious subdomain depth');
      }

      if (warning.includes('entropy')) {
        riskScore += 40;
        riskFactors.push('Domain appears randomly generated');
      }

      if (warning.includes('insecure HTTP')) {
        riskScore += 10;
        riskFactors.push('Uses insecure HTTP protocol');
      }
    }

    // Determine risk level based on score
    const riskLevel = this.calculateRiskLevel(riskScore);

    // Determine if URL should be blocked
    const shouldBlock = this.shouldBlockURL(riskLevel, validationResult);

    // Generate recommendations
    const recommendations = this.generateRecommendations(riskLevel, validationResult);

    const analysis: SecurityAnalysis = {
      riskLevel,
      shouldBlock,
      validationResult,
      riskFactors,
      recommendations,
    };

    logger.info('Security', 'URL analysis completed', {
      url,
      riskLevel,
      shouldBlock,
      riskScore,
    });

    return analysis;
  }

  /**
   * Calculate risk level from risk score
   */
  private calculateRiskLevel(riskScore: number): RiskLevel {
    if (riskScore >= 100) {
      return RiskLevel.CRITICAL;
    } else if (riskScore >= 50) {
      return RiskLevel.HIGH;
    } else if (riskScore >= 20) {
      return RiskLevel.MEDIUM;
    } else {
      return RiskLevel.LOW;
    }
  }

  /**
   * Determine if URL should be blocked
   * CRITICAL: Always block
   * HIGH: Block by default (user can override)
   * MEDIUM/LOW: Allow with warnings
   */
  private shouldBlockURL(riskLevel: RiskLevel, validationResult: ValidationResult): boolean {
    // Always block critical risks (invalid URLs, dangerous protocols)
    if (riskLevel === RiskLevel.CRITICAL) {
      return true;
    }

    // Block if validation failed
    if (!validationResult.isValid) {
      return true;
    }

    // High risk: recommend blocking but allow user override
    // This will be handled in UI layer
    if (riskLevel === RiskLevel.HIGH) {
      return false; // Don't auto-block, but show strong warning
    }

    // Medium/Low risk: allow with warnings
    return false;
  }

  /**
   * Generate security recommendations based on analysis
   */
  private generateRecommendations(
    riskLevel: RiskLevel,
    validationResult: ValidationResult
  ): string[] {
    const recommendations: string[] = [];

    if (riskLevel === RiskLevel.CRITICAL) {
      recommendations.push('This URL is blocked due to critical security risks');
      recommendations.push('Do not proceed with this download');
    }

    if (riskLevel === RiskLevel.HIGH) {
      recommendations.push('This URL has high security risks');
      recommendations.push('Verify the source before proceeding');
      recommendations.push('Consider using a trusted alternative');
    }

    if (riskLevel === RiskLevel.MEDIUM) {
      recommendations.push('This URL has some security concerns');
      recommendations.push('Proceed with caution');
    }

    // Protocol-specific recommendations
    if (validationResult.protocol === 'http:') {
      recommendations.push('Use HTTPS version if available for better security');
    }

    // Domain-specific recommendations
    if (validationResult.warnings.some(w => w.includes('IP address'))) {
      recommendations.push('Verify this is a legitimate service');
    }

    if (validationResult.warnings.some(w => w.includes('entropy'))) {
      recommendations.push('Domain name appears suspicious - verify legitimacy');
    }

    return recommendations;
  }

  /**
   * Quick check if URL is safe (for internal use)
   */
  public async isURLSafe(url: string): Promise<boolean> {
    const analysis = await this.analyzeURL(url);
    return !analysis.shouldBlock && analysis.riskLevel !== RiskLevel.HIGH;
  }

  /**
   * Get risk level for URL (without full analysis)
   */
  public async getRiskLevel(url: string): Promise<RiskLevel> {
    const analysis = await this.analyzeURL(url);
    return analysis.riskLevel;
  }
}

// Export singleton instance
export const securityService = new SecurityService();
