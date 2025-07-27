/**
 * Utility functions for handling route regex patterns with proper escaping
 */

/**
 * Escapes hyphens in dynamic route segments to prevent regex syntax errors
 * 
 * In regular expressions, hyphens within character classes [] are treated as 
 * range operators (e.g., [a-z]). When dynamic route slugs contain hyphens,
 * they need to be properly escaped to avoid "Range out of order" errors.
 * 
 * @param routePattern - The route pattern to escape
 * @returns The escaped route pattern
 * 
 * @example
 * ```ts
 * escapeRouteHyphens('[...better-auth]') // Returns '[...better\-auth]'
 * escapeRouteHyphens('[...my-route]')    // Returns '[...my\-route]'
 * ```
 */
export function escapeRouteHyphens(routePattern: string): string {
  // Escape hyphens that are within dynamic route brackets
  // This regex matches [...segment-name] patterns and escapes hyphens within them
  return routePattern.replace(/(\[\.\.\.?)([^[\]]*-[^[\]]*)\]/g, (match, prefix, content) => {
    // Escape hyphens in the content part
    const escapedContent = content.replace(/-/g, '\\-');
    return `${prefix}${escapedContent}]`;
  });
}

/**
 * Alternative approach: Move hyphens to the end of character classes
 * This is another valid way to handle hyphens in regex character classes
 * 
 * @param routePattern - The route pattern to process
 * @returns The processed route pattern with hyphens moved to the end
 */
export function moveHyphensToEnd(routePattern: string): string {
  return routePattern.replace(/(\[\.\.\.?)([^[\]]*-[^[\]]*)\]/g, (match, prefix, content) => {
    // Remove hyphens from the middle and add them at the end
    const withoutHyphens = content.replace(/-/g, '');
    const hyphenCount = (content.match(/-/g) || []).length;
    const hyphens = '-'.repeat(hyphenCount);
    return `${prefix}${withoutHyphens}${hyphens}]`;
  });
}

/**
 * Test function to validate regex patterns
 * 
 * @param pattern - The regex pattern to test
 * @returns True if the pattern is valid, false otherwise
 */
export function isValidRegexPattern(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Processes route patterns to ensure they generate valid regex
 * 
 * @param routePattern - The original route pattern
 * @returns A processed route pattern that will generate valid regex
 */
export function processRoutePattern(routePattern: string): string {
  // First, try escaping hyphens
  const escaped = escapeRouteHyphens(routePattern);
  
  // Test if the escaped pattern would generate valid regex
  // Note: This is a simplified test - the actual regex generation happens elsewhere
  const testPattern = escaped.replace(/\[\.\.\.([^[\]]+)\]/g, '([^/]+?)');
  
  if (isValidRegexPattern(testPattern)) {
    return escaped;
  }
  
  // Fallback to moving hyphens to the end
  return moveHyphensToEnd(routePattern);
}