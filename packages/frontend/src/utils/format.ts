/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  if (bytes === -1) return 'Unlimited';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Calculate percentage of quota used
 */
export function calculateQuotaPercentage(used: number, quota: number): number {
  if (quota === -1) return 0; // Unlimited
  if (quota === 0) return 100;
  return Math.min(Math.round((used / quota) * 100), 100);
}

/**
 * Get color based on quota usage percentage
 */
export function getQuotaColor(percentage: number): 'success' | 'warning' | 'error' {
  if (percentage >= 90) return 'error';
  if (percentage >= 75) return 'warning';
  return 'success';
}
