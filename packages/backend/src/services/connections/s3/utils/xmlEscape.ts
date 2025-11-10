/**
 * Escapes special XML characters to prevent XML injection
 * @param str The string to escape
 * @returns The XML-safe string
 */
export function escapeXml(str: string | number | bigint | undefined | null): string {
    if (str === undefined || str === null) {
        return '';
    }

    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
