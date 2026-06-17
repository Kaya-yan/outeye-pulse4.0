export function shouldShowRetryAction(status: string) {
  return status === 'failed' || status === 'cancelled';
}
