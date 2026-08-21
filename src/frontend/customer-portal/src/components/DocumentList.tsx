import React from 'react'
import { Download } from 'lucide-react'
import { Button, EmptyState } from './ui'

/** Structural, not an imported ClaimDocument: that type lives in api/claims.ts
 *  on customer-portal and types/index.ts on internal-portal, and this file must
 *  stay byte-identical. Both portals' real type satisfies this shape. */
export interface DocumentListItem {
  id: string
  filename: string
  mime_type: string
  file_size_bytes: number
}

interface Props {
  documents: DocumentListItem[]
  onDownload: (doc: DocumentListItem) => void | Promise<void>
}

export function DocumentList({ documents, onDownload }: Props) {
  if (documents.length === 0) {
    return <EmptyState variant="inline" title="No documents attached." />
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {documents.map((doc) => (
        <li key={doc.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-fg">{doc.filename}</div>
            <div className="mt-0.5 text-xs text-fg-muted">
              {doc.mime_type} ·{' '}
              <span className="tabular-nums">{(doc.file_size_bytes / 1024).toFixed(1)} KB</span>
            </div>
          </div>
          <Button
            variant="link"
            size="sm"
            onClick={() => onDownload(doc)}
            icon={<Download aria-hidden className="h-4 w-4" />}
          >
            Download
          </Button>
        </li>
      ))}
    </ul>
  )
}
