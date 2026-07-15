export function getApiUrl(value: string): string {
  const url = new URL(value);

  if (url.username || url.password || url.search || url.hash) {
    throw new Error('The Viewpress API URL must not contain credentials, a query, or a fragment.');
  }

  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('The Viewpress API URL must use HTTPS unless it is localhost.');
  }

  return url.toString().replace(/\/$/, '');
}
