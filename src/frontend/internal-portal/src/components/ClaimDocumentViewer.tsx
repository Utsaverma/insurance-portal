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

  if (documents.length === 0) return <p className="text-sm text-gray-500">No documents attached.</p>

  return (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
      {documents.map((doc) => (
        <li key={doc.id} className="flex items-center justify-between px-4 py-3 bg-white">
          <div>
            <div className="text-sm font-medium text-gray-900">{doc.filename}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {doc.mime_type} · {(doc.file_size_bytes / 1024).toFixed(1)} KB
            </div>
          </div>
          <button
            onClick={() => handleDownload(doc)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Download
          </button>
        </li>
      ))}
    </ul>
  )
}
