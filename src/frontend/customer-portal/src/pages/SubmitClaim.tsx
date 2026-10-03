import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMyPolicies, submitClaim, uploadDocument, type Claim, type Policy } from '../api/claims'
import { apiErrorMessage } from '../api/client'
import { FileUpload } from '../components/FileUpload'
import { CONTENT_WIDTH } from '../components/layout/shell'
import { formatCurrency, formatDate } from '../lib/format'
import {
  Alert,
  Button,
  Card,
  CardBody,
  Field,
  Input,
  PageContainer,
  PageHeader,
  Select,
  Textarea,
} from '../components/ui'

/** Today in the customer's own time zone, as YYYY-MM-DD. toISOString() gives the
 *  UTC date, which is yesterday or tomorrow for part of every day elsewhere. */
function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function SubmitClaim() {
  const navigate = useNavigate()
  const today = localToday()
  const [form, setForm] = useState({ policy_number: '', incident_date: '', incident_description: '', claimed_amount: '' })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Set once the claim exists on the server. If its document then fails to upload,
  // the form retries the upload only: submitting again would file the claim twice.
  const [created, setCreated] = useState<Claim | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // The policies held in the customer's name; 'error' falls back to typing the number.
  const [policies, setPolicies] = useState<Policy[] | 'error' | null>(null)

  useEffect(() => {
    getMyPolicies()
      .then((list) => {
        setPolicies(list)
        const current = list.find((p) => p.in_force) ?? list[0]
        if (current) setForm((f) => (f.policy_number ? f : { ...f, policy_number: current.policy_number }))
      })
      .catch(() => setPolicies('error'))
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  const policy = Array.isArray(policies) ? policies.find((p) => p.policy_number === form.policy_number) : undefined

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.incident_description.trim().length < 20) { setError('Description must be at least 20 characters.'); return }
    setError('')
    setLoading(true)

    let claim = created
    if (!claim) {
      try {
        claim = await submitClaim({ ...form, claimed_amount: Number(form.claimed_amount) })
        setCreated(claim)
      } catch (err) {
        setError(apiErrorMessage(err, 'Failed to submit claim. Please try again.'))
        setLoading(false)
        return
      }
    }

    try {
      if (selectedFile) await uploadDocument(claim.id, selectedFile)
      navigate(`/claims/${claim.id}`)
    } catch (err) {
      setUploadError(apiErrorMessage(err, 'The document could not be uploaded.'))
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
              {policies === 'error' ? (
                <Input
                  label="Policy Number"
                  name="policy_number"
                  value={form.policy_number}
                  maxLength={50}
                  onChange={handleChange}
                  disabled={!!created}
                  required
                />
              ) : (
                <div className="space-y-1.5">
                  {/* Only policies held in the customer's name are listed; the
                      server checks the policy covered the incident date. */}
                  <Select
                    label="Policy"
                    name="policy_number"
                    value={form.policy_number}
                    onChange={handleChange}
                    disabled={!!created || policies === null}
                    required
                  >
                    <option value="">
                      {policies === null ? 'Loading your policies…' : policies.length ? '— choose a policy —' : 'No policies in your name'}
                    </option>
                    {policies?.map((p) => (
                      <option key={p.policy_number} value={p.policy_number}>
                        {p.policy_number} · {p.insured_item}
                        {p.in_force ? '' : ` (ended ${formatDate(p.effective_to)})`}
                      </option>
                    ))}
                  </Select>
                  {policy && (
                    <p className="text-xs text-fg-muted">
                      {policy.product}, in force {formatDate(policy.effective_from)} – {formatDate(policy.effective_to)}.
                      Cover up to {formatCurrency(policy.coverage_limit)}, deductible {formatCurrency(policy.deductible)}.
                    </p>
                  )}
                </div>
              )}
              {[
                { label: 'Incident Date', name: 'incident_date', type: 'date', max: today },
                // step: without it a number input only accepts whole dollars.
                // max: the largest amount the claims database can hold.
                { label: 'Claimed Amount (USD)', name: 'claimed_amount', type: 'number', min: '0.01', max: '9999999999.99', step: '0.01' },
              ].map(({ label, name, type, max, min, step }) => (
                <Input
                  key={name}
                  label={label}
                  type={type}
                  name={name}
                  value={(form as Record<string, string>)[name]}
                  max={max}
                  min={min}
                  step={step}
                  onChange={handleChange}
                  disabled={!!created}
                  required
                />
              ))}
              <Textarea
                label="Incident Description"
                hint="(min 20 chars)"
                name="incident_description"
                value={form.incident_description}
                onChange={handleChange}
                disabled={!!created}
                required
                rows={4}
                maxLength={5000}
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
              {created && uploadError !== null ? (
                <>
                  <Alert tone="warning">
                    Claim {created.claim_number} was submitted, but its document was not attached:{' '}
                    {/[.!?]$/.test(uploadError) ? uploadError : `${uploadError}.`}{' '}
                    Choose another file to try again, or continue without one.
                  </Alert>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="submit" size="lg" fullWidth loading={loading} disabled={!selectedFile}>
                      {loading ? 'Uploading…' : 'Attach Document'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      fullWidth
                      disabled={loading}
                      onClick={() => navigate(`/claims/${created.id}`)}
                    >
                      Continue Without a Document
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {error && <Alert tone="danger">{error}</Alert>}
                  <Button type="submit" size="lg" fullWidth loading={loading}>
                    {loading ? 'Submitting…' : 'Submit Claim'}
                  </Button>
                </>
              )}
            </form>
          </CardBody>
        </Card>
      </div>
    </PageContainer>
  )
}
