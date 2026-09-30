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
    if (err.response?.status === 401) {
      localStorage.removeItem('eclaims_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default apiClient
