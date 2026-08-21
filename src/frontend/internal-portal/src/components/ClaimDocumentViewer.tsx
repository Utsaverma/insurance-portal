import React from 'react'
import type { ClaimDocument } from '../types'
import { downloadDocument } from '../api/claims'
import { DocumentList, type DocumentListItem } from './DocumentList'

interface Props {
  claimId: string
  documents: ClaimDocument[]
}

export function ClaimDocumentViewer({ claimId, documents }: Props) {
  const handleDownload = async (doc: DocumentListItem) => {
    const blob = await downloadDocument(claimId, doc.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = doc.filename; a.click()
    URL.revokeObjectURL(url)
  }

  return <DocumentList documents={documents} onDownload={handleDownload} />
}
