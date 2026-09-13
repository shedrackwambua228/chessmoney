export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(Array.isArray(body?.message) ? body.message.join('. ') : body?.message ?? 'The server is unavailable. Try again.', response.status)
  if (!body) throw new ApiError('The server returned an invalid response.', response.status)
  return body as T
}
