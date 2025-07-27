import { describe, expect, it } from 'vitest';
import {
  escapeRouteHyphens,
  moveHyphensToEnd,
  isValidRegexPattern,
  processRoutePattern,
} from './route-regex';

describe('Route Regex Utilities', () => {
  describe('escapeRouteHyphens', () => {
    it('should escape hyphens in catch-all routes', () => {
      expect(escapeRouteHyphens('[...better-auth]')).toBe('[...better\\-auth]');
      expect(escapeRouteHyphens('[...my-route]')).toBe('[...my\\-route]');
      expect(escapeRouteHyphens('[...multi-word-route]')).toBe('[...multi\\-word\\-route]');
    });

    it('should escape hyphens in optional catch-all routes', () => {
      expect(escapeRouteHyphens('[[...better-auth]]')).toBe('[[...better\\-auth]]');
      expect(escapeRouteHyphens('[[...my-route]]')).toBe('[[...my\\-route]]');
    });

    it('should not modify routes without hyphens', () => {
      expect(escapeRouteHyphens('[...auth]')).toBe('[...auth]');
      expect(escapeRouteHyphens('[id]')).toBe('[id]');
      expect(escapeRouteHyphens('static-route')).toBe('static-route');
    });

    it('should handle multiple dynamic segments', () => {
      const input = '[...better-auth]/[user-id]';
      const expected = '[...better\\-auth]/[user\\-id]';
      expect(escapeRouteHyphens(input)).toBe(expected);
    });
  });

  describe('moveHyphensToEnd', () => {
    it('should move hyphens to the end of character class', () => {
      expect(moveHyphensToEnd('[...better-auth]')).toBe('[...betterauth-]');
      expect(moveHyphensToEnd('[...my-route]')).toBe('[...myroute-]');
      expect(moveHyphensToEnd('[...multi-word-route]')).toBe('[...multiwordroute--]');
    });

    it('should handle routes without hyphens', () => {
      expect(moveHyphensToEnd('[...auth]')).toBe('[...auth]');
      expect(moveHyphensToEnd('[id]')).toBe('[id]');
    });
  });

  describe('isValidRegexPattern', () => {
    it('should return true for valid regex patterns', () => {
      expect(isValidRegexPattern('test')).toBe(true);
      expect(isValidRegexPattern('[abc]')).toBe(true);
      expect(isValidRegexPattern('[a\\-c]')).toBe(true);
      expect(isValidRegexPattern('[abc-]')).toBe(true);
    });

    it('should return false for invalid regex patterns', () => {
      expect(isValidRegexPattern('[a-]')).toBe(false); // Invalid range
      expect(isValidRegexPattern('[z-a]')).toBe(false); // Range out of order
    });
  });

  describe('processRoutePattern', () => {
    it('should process problematic route patterns', () => {
      const result = processRoutePattern('[...better-auth]');
      // Should return either escaped version or moved hyphens version
      expect(['[...better\\-auth]', '[...betterauth-]']).toContain(result);
    });

    it('should handle routes without issues', () => {
      expect(processRoutePattern('[...auth]')).toBe('[...auth]');
      expect(processRoutePattern('[id]')).toBe('[id]');
    });
  });

  describe('Real-world regex generation simulation', () => {
    it('should generate valid regex patterns after processing', () => {
      const routes = [
        '[...better-auth]',
        '[...my-route]',
        '[[...optional-auth]]',
        '[...multi-word-route]',
      ];

      routes.forEach((route) => {
        const processed = processRoutePattern(route);
        // Simulate the actual regex conversion that would happen in Next.js
        const regexPattern = processed.replace(/\[\.\.\.([^[\]]+)\]/g, '([^/]+?)');
        
        expect(() => new RegExp(regexPattern)).not.toThrow();
      });
    });
  });
});