import React, { useState } from 'react'
import { uploadDocument } from '../api/claims'
import { apiErrorMessage } from '../api/client'
import { FileUpload } from './FileUpload'
import { Alert, Button, Card, CardBody, Field } from './ui'

interface Props {
  claimId: string
  /** What belongs here, shown next to the label, e.g. "(survey report, photos)". */
  hint: string
  /** Called after a successful upload, so the page can reload its document list. */
  onUploaded: () => void
}

/** Adds a document to an existing claim: the customer's later evidence, or the
 *  assigned surveyor's report. Render it only when the claim's
 *  allowed_actions.upload is true; the server enforces the same rule. */
export function AddDocument({ claimId, hint, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  // Remounts FileUpload after a successful upload, so it stops showing the sent file.
  const [resetKey, setResetKey] = useState(0)

  const upload = async () => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      await uploadDocument(claimId, file)
      setFile(null)
      setResetKey((k) => k + 1)
      onUploaded()
    } catch (e) {
      setError(apiErrorMessage(e, 'The document could not be uploaded. Please try again.'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card className="mt-3">
      <CardBody className="space-y-3">
        <Field label="Add a Document" hint={hint}>
          {(a) => (
            <FileUpload
              key={resetKey}
              id={a.id}
              aria-describedby={a['aria-describedby']}
              onFileSelect={setFile}
              disabled={uploading}
            />
          )}
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button onClick={upload} disabled={!file} loading={uploading}>
          Upload Document
        </Button>
      </CardBody>
    </Card>
  )
}
