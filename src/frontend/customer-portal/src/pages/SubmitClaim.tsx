import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { submitClaim, uploadDocument } from '../api/claims'
import { FileUpload } from '../components/FileUpload'

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
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 24 }}>
      <h1 style={{ marginBottom: 24, fontSize: 24 }}>Submit New Claim</h1>
      <form onSubmit={handleSubmit}>
        {[
          { label: 'Policy Number', name: 'policy_number', type: 'text' },
          { label: 'Incident Date', name: 'incident_date', type: 'date', max: today },
          { label: 'Claimed Amount (₹)', name: 'claimed_amount', type: 'number' },
        ].map(({ label, name, type, max }) => (
          <div key={name} style={{ marginBottom: 16 }}>
            <label>{label}</label>
            <input type={type} name={name} value={(form as any)[name]} max={max} onChange={handleChange}
              required style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, border: '1px solid #d1d5db', borderRadius: 6 }} />
          </div>
        ))}
        <div style={{ marginBottom: 16 }}>
          <label>Incident Description (min 20 chars)</label>
          <textarea name="incident_description" value={form.incident_description} onChange={handleChange}
            required rows={4} style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, border: '1px solid #d1d5db', borderRadius: 6 }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label>Supporting Document (optional)</label>
          <div style={{ marginTop: 4 }}>
            <FileUpload onFileSelect={setSelectedFile} disabled={loading} />
          </div>
        </div>
        {error && <p style={{ color: '#ef4444' }}>{error}</p>}
        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: '10px 0', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Submitting…' : 'Submit Claim'}
        </button>
      </form>
    </div>
  )
}
