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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 md:px-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="mb-5 text-sm text-blue-500 hover:text-blue-700 font-medium"
        >
          ← Back to Dashboard
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Submit New Claim</h1>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { label: 'Policy Number', name: 'policy_number', type: 'text' },
              { label: 'Incident Date', name: 'incident_date', type: 'date', max: today },
              { label: 'Claimed Amount (₹)', name: 'claimed_amount', type: 'number' },
            ].map(({ label, name, type, max }) => (
              <div key={name}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type={type}
                  name={name}
                  value={(form as any)[name]}
                  max={max}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Incident Description{' '}
                <span className="text-gray-400 font-normal">(min 20 chars)</span>
              </label>
              <textarea
                name="incident_description"
                value={form.incident_description}
                onChange={handleChange}
                required
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Supporting Document{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <FileUpload onFileSelect={setSelectedFile} disabled={loading} />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-sm font-medium rounded-md transition-colors disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting…' : 'Submit Claim'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
