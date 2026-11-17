const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(
  /\/$/,
  '',
)

export type HealthResponse = {
  status: 'ok'
  service: string
}

export class ApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'service' in value &&
    value.status === 'ok' &&
    typeof value.service === 'string'
  )
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  let response: Response

  try {
    response = await fetch(`${apiBaseUrl}/api/health/`, {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch {
    throw new ApiError('Could not reach the Django API.')
  }

  if (!response.ok) {
    throw new ApiError(`The Django API returned ${response.status}.`)
  }

  const payload: unknown = await response.json()
  if (!isHealthResponse(payload)) {
    throw new ApiError('The Django API returned an unexpected health response.')
  }

  return payload
}

export type Profile = { id: string; supabase_user_id: string; display_name: string; email: string }

export async function getMe(accessToken: string): Promise<Profile> {
  const response = await fetch(`${apiBaseUrl}/api/me/`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new ApiError(response.status === 401 ? 'Your session has expired.' : 'Could not load your profile.')
  return response.json() as Promise<Profile>
}
