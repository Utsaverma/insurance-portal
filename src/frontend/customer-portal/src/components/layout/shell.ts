/** The single content measure for this portal. Header, every PageContainer and
 *  the AppShell Suspense fallback all use it, so the wordmark lines up with
 *  every page title and lazy navigation causes no width jump.
 *  customer-portal = 'md' (56rem) · internal-portal = 'xl' (72rem) */
import type { PageContainerProps } from '../ui'
export const CONTENT_WIDTH: NonNullable<PageContainerProps['width']> = 'md'
