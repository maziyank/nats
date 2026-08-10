/**
 * Safe formula evaluator for salary components.
 * Supports: numbers, +, -, *, /, parentheses, and variables BASE, GROSS, AMOUNT.
 * No function calls or property access allowed.
 */
export function evaluateFormula(
    formula: string,
    vars: Record<string, number>
): number {
    const cleaned = formula.trim();
    if (!cleaned) return 0;

    // Replace variable names with numeric literals
    let expression = cleaned.toUpperCase();
    for (const [key, value] of Object.entries(vars)) {
        const re = new RegExp(`\\b${key.toUpperCase()}\\b`, 'g');
        expression = expression.replace(re, String(Number(value) || 0));
    }

    // Only allow digits, operators, parentheses, decimal points, whitespace
    if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
        throw new Error(`Invalid formula: ${formula}`);
    }

    try {
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${expression});`)();
        if (typeof result !== 'number' || !Number.isFinite(result)) {
            throw new Error(`Formula did not evaluate to a number: ${formula}`);
        }
        return result;
    } catch {
        throw new Error(`Failed to evaluate formula: ${formula}`);
    }
}
