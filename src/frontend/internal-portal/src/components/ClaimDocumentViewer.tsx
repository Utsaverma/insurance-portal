import React, { useState } from 'react'
import type { ClaimDocument } from '../types'
import { downloadDocument } from '../api/claims'
import { DocumentList, type DocumentListItem } from './DocumentList'
import { Alert } from './ui'

interface Props {
  claimId: string
  documents: ClaimDocument[]
}

export function ClaimDocumentViewer({ claimId, documents }: Props) {
  const [error, setError] = useState('')

  const handleDownload = async (doc: DocumentListItem) => {
    setError('')
    try {
      const blob = await downloadDocument(claimId, doc.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = doc.filename; a.click()
      // Deferred: revoking in the same tick can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setError(`Could not download ${doc.filename}. Please try again.`)
    }
  }

  return (
    <>
      <DocumentList documents={documents} onDownload={handleDownload} />
      {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
    </>
  )
}
