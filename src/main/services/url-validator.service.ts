import { URL } from 'url';
import { logger } from './logger.service';
import type { ValidationResult } from '../../shared/types';

/**
 * URL Validator Service
 * Validates URLs for security and format compliance
 * Requirements: REQ-FUN-001.2, REQ-FUN-001.3, REQ-FUN-001.4, REQ-FUN-001.5, 
 *               REQ-FUN-001.6, REQ-FUN-001.7, REQ-FUN-001.8
 */

// Protocol whitelists and blacklists
const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const DANGEROUS_PROTOCOLS = [
  'file:',
  'javascript:',
  'data:',
  'blob:',
  'about:',
  'chrome:',
  'chrome-extension:',
  'vbscript:',
];

// IP address regex patterns
const IPV4_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_PATTERN = /^\[?([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}\]?$/;

class URLValidatorService {
  /**
   * Validate a URL and return detailed validation result
   * Must complete in < 100ms (REQ-NFR-001.2)
   */
  public async validateURL(urlString: string): Promise<ValidationResult> {
    const startTime = Date.now();
    const result: ValidationResult = {
      isValid: true,
      warnings: [],
      errors: [],
      protocol: '',
      domain: '',
    };

    try {
      // Basic format validation
      if (!urlString || typeof urlString !== 'string') {
        result.isValid = false;
        result.errors.push('URL must be a non-empty string');
        return result;
      }

      // Trim whitespace
      urlString = urlString.trim();

      // Parse URL
      let parsedURL: URL;
      try {
        parsedURL = new URL(urlString);
      } catch (error) {
        result.isValid = false;
        result.errors.push('Invalid URL format');
        return result;
      }

      result.protocol = parsedURL.protocol;
      result.domain = parsedURL.hostname;

      // Protocol validation
      const protocolCheck = this.validateProtocol(parsedURL.protocol);
      if (!protocolCheck.valid) {
        result.isValid = false;
        result.errors.push(protocolCheck.error!);
      }
      if (protocolCheck.warning) {
        result.warnings.push(protocolCheck.warning);
      }

      // Domain validation
      const domainCheck = this.validateDomain(parsedURL.hostname);
      if (!domainCheck.valid) {
        result.isValid = false;
        result.errors.push(domainCheck.error!);
      }
      result.warnings.push(...domainCheck.warnings);

      // IP address detection
      if (this.isIPAddress(parsedURL.hostname)) {
        result.warnings.push('URL uses IP address instead of domain name');
      }

      // Subdomain depth check
      const subdomainDepth = this.getSubdomainDepth(parsedURL.hostname);
      if (subdomainDepth > 3) {
        result.warnings.push(`Suspicious subdomain depth: ${subdomainDepth} levels`);
      }

      // Domain entropy check (detect random/suspicious domains)
      const entropy = this.calculateDomainEntropy(parsedURL.hostname);
      if (entropy > 3.5) {
        result.warnings.push(`High domain entropy (${entropy.toFixed(2)}): may be randomly generated`);
      }

      // Performance check
      const duration = Date.now() - startTime;
      if (duration > 100) {
        logger.warning('URLValidator', 'Validation exceeded 100ms threshold', { 
          duration, 
          url: urlString 
        });
      }

      logger.debug('URLValidator', 'URL validation completed', { 
        url: urlString, 
        isValid: result.isValid,
        duration,
      });

      return result;
    } catch (error) {
      logger.error('URLValidator', 'Unexpected error during validation', { error, url: urlString });
      result.isValid = false;
      result.errors.push('Internal validation error');
      return result;
    }
  }

  /**
   * Validate protocol against whitelist and blacklist
   */
  private validateProtocol(protocol: string): { valid: boolean; error?: string; warning?: string } {
    // Check blacklist first (security critical)
    if (DANGEROUS_PROTOCOLS.includes(protocol.toLowerCase())) {
      return {
        valid: false,
        error: `Dangerous protocol detected: ${protocol}`,
      };
    }

    // Check whitelist
    if (!ALLOWED_PROTOCOLS.includes(protocol.toLowerCase())) {
      return {
        valid: false,
        error: `Protocol not allowed: ${protocol}. Only HTTP and HTTPS are supported.`,
      };
    }

    // Warn about HTTP (not HTTPS)
    if (protocol.toLowerCase() === 'http:') {
      return {
        valid: true,
        warning: 'Using insecure HTTP protocol. HTTPS is recommended.',
      };
    }

    return { valid: true };
  }

  /**
   * Validate domain format according to RFC 3986
   */
  private validateDomain(domain: string): { valid: boolean; error?: string; warnings: string[] } {
    const warnings: string[] = [];

    if (!domain || domain.length === 0) {
      return { valid: false, error: 'Domain is empty', warnings };
    }

    // Check domain length (RFC 1035: max 253 characters)
    if (domain.length > 253) {
      return { valid: false, error: 'Domain exceeds maximum length (253 characters)', warnings };
    }

    // Skip validation for IP addresses
    if (this.isIPAddress(domain)) {
      return { valid: true, warnings };
    }

    // RFC 3986 domain validation
    // Domain labels separated by dots
    const labels = domain.split('.');

    // Must have at least 2 labels (e.g., example.com)
    if (labels.length < 2) {
      return { valid: false, error: 'Domain must have at least two labels (e.g., example.com)', warnings };
    }

    // Validate each label
    for (const label of labels) {
      // Label length: 1-63 characters
      if (label.length === 0 || label.length > 63) {
        return { valid: false, error: `Invalid label length: ${label}`, warnings };
      }

      // Label must start and end with alphanumeric
      if (!/^[a-zA-Z0-9]/.test(label) || !/[a-zA-Z0-9]$/.test(label)) {
        return { valid: false, error: `Label must start and end with alphanumeric: ${label}`, warnings };
      }

      // Label can contain alphanumeric and hyphens
      if (!/^[a-zA-Z0-9-]+$/.test(label)) {
        return { valid: false, error: `Label contains invalid characters: ${label}`, warnings };
      }
    }

    // Check TLD (top-level domain)
    const tld = labels[labels.length - 1];
    if (!/^[a-zA-Z]{2,}$/.test(tld)) {
      warnings.push('TLD should be at least 2 letters');
    }

    return { valid: true, warnings };
  }

  /**
   * Check if hostname is an IP address (IPv4 or IPv6)
   */
  private isIPAddress(hostname: string): boolean {
    // Remove brackets for IPv6
    const cleaned = hostname.replace(/^\[|\]$/g, '');
    
    return IPV4_PATTERN.test(cleaned) || IPV6_PATTERN.test(cleaned);
  }

  /**
   * Calculate subdomain depth
   * Example: www.sub.example.com = 2 subdomains (www, sub)
   */
  private getSubdomainDepth(domain: string): number {
    if (this.isIPAddress(domain)) {
      return 0;
    }

    const labels = domain.split('.');
    
    // Assume last 2 labels are domain + TLD (e.g., example.com)
    // Everything before that is subdomains
    return Math.max(0, labels.length - 2);
  }

  /**
   * Calculate Shannon entropy of domain name
   * Higher entropy may indicate randomly generated domains (phishing, malware)
   * Typical legitimate domains have entropy < 3.5
   */
  private calculateDomainEntropy(domain: string): number {
    // Remove TLD for entropy calculation
    const labels = domain.split('.');
    const domainWithoutTLD = labels.slice(0, -1).join('.');
    
    if (domainWithoutTLD.length === 0) {
      return 0;
    }

    // Calculate character frequency
    const freq: { [key: string]: number } = {};
    for (const char of domainWithoutTLD.toLowerCase()) {
      freq[char] = (freq[char] || 0) + 1;
    }

    // Calculate Shannon entropy
    let entropy = 0;
    const len = domainWithoutTLD.length;
    
    for (const char in freq) {
      const p = freq[char] / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Quick validation check (returns boolean only)
   */
  public async isValidURL(urlString: string): Promise<boolean> {
    const result = await this.validateURL(urlString);
    return result.isValid;
  }
}

// Export singleton instance
export const urlValidator = new URLValidatorService();
