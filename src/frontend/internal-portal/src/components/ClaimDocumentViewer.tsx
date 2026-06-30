import React from 'react'
import type { ClaimDocument } from '../types'
import { downloadDocument } from '../api/claims'

interface Props {
  claimId: string
  documents: ClaimDocument[]
}

export function ClaimDocumentViewer({ claimId, documents }: Props) {
  const handleDownload = async (doc: ClaimDocument) => {
    const blob = await downloadDocument(claimId, doc.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = doc.filename; a.click()
    URL.revokeObjectURL(url)
  }

  if (documents.length === 0) return <p style={{ color: '#6b7280' }}>No documents attached.</p>

  return (
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {documents.map((doc) => (
        <li key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
          <div>
            <div style={{ fontWeight: 500 }}>{doc.filename}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{doc.mime_type} · {(doc.file_size_bytes / 1024).toFixed(1)} KB</div>
          </div>
          <button onClick={() => handleDownload(doc)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontWeight: 600 }}>
            Download
          </button>
        </li>
      ))}
    </ul>
  )
}
