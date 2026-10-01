import axios from 'axios'

const apiClient = axios.create({
  // Same-origin API: nginx (and the Vite dev proxy) route /api/* to the backend services.
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('eclaims_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    // A 401 means the session is over, except on the login call itself: there it
    // means "wrong password", and the login page has to stay put to say so. The
    // hard redirect used to reload that page and wipe the form and its error.
    const isLoginCall = String(err.config?.url ?? '').endsWith('/auth/login')
    if (err.response?.status === 401 && !isLoginCall) {
      localStorage.removeItem('eclaims_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

/** A readable message from a failed call. FastAPI sends `detail` as a string for
 *  business-rule errors (400/403/404) but as a list of `{msg}` objects for request
 *  validation errors (422), and React cannot render that list as-is. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
  if (typeof detail === 'string' && detail) return detail
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => d?.msg)
      .filter((m): m is string => typeof m === 'string')
      .map((m) => m.replace(/^Value error, /, ''))
    if (msgs.length) return msgs.join(' ')
  }
  return fallback
}

/** The HTTP status of a failed call, or undefined if the server never answered. */
export function apiErrorStatus(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined
}

export default apiClient
