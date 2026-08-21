import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { submitClaim, uploadDocument } from '../api/claims'
import { FileUpload } from '../components/FileUpload'
import { CONTENT_WIDTH } from '../components/layout/shell'
import {
  Alert,
  Button,
  Card,
  CardBody,
  Field,
  Input,
  PageContainer,
  PageHeader,
  Textarea,
} from '../components/ui'

export function SubmitClaim() {
  const navigate = useNavigate()
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({ policy_number: '', incident_date: '', incident_description: '', claimed_amount: '' })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.incident_description.length < 20) { setError('Description must be at least 20 characters.'); return }
    setError('')
    setLoading(true)
    try {
      const claim = await submitClaim({ ...form, claimed_amount: Number(form.claimed_amount) })
      if (selectedFile) await uploadDocument(claim.id, selectedFile)
      navigate(`/claims/${claim.id}`)
    } catch {
      setError('Failed to submit claim. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageContainer width={CONTENT_WIDTH}>
      <div className="max-w-content-sm">
        <PageHeader title="Submit New Claim" backTo="/dashboard" backLabel="Back to Dashboard" />
        <Card>
          <CardBody size="lg">
            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { label: 'Policy Number', name: 'policy_number', type: 'text' },
                { label: 'Incident Date', name: 'incident_date', type: 'date', max: today },
                { label: 'Claimed Amount (₹)', name: 'claimed_amount', type: 'number' },
              ].map(({ label, name, type, max }) => (
                <Input
                  key={name}
                  label={label}
                  type={type}
                  name={name}
                  value={(form as Record<string, string>)[name]}
                  max={max}
                  onChange={handleChange}
                  required
                />
              ))}
              <Textarea
                label="Incident Description"
                hint="(min 20 chars)"
                name="incident_description"
                value={form.incident_description}
                onChange={handleChange}
                required
                rows={4}
              />
              {/* FileUpload manages its own error text, so Field only supplies
                  the label wiring — but that wiring is the point: no label in
                  either portal had htmlFor before this. */}
              <Field label="Supporting Document" hint="(optional)">
                {(a) => (
                  <FileUpload
                    id={a.id}
                    aria-describedby={a['aria-describedby']}
                    onFileSelect={setSelectedFile}
                    disabled={loading}
                  />
                )}
              </Field>
              {error && <Alert tone="danger">{error}</Alert>}
              <Button type="submit" size="lg" fullWidth loading={loading}>
                {loading ? 'Submitting…' : 'Submit Claim'}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </PageContainer>
  )
}
