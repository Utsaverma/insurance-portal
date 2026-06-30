import React, { useRef, useState } from 'react'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
const MAX_BYTES = 10 * 1024 * 1024

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Only JPEG, PNG, and PDF files are allowed.'
  if (file.size > MAX_BYTES) return 'File must be under 10 MB.'
  return null
}

interface Props {
  onFileSelect: (file: File) => void
  disabled?: boolean
}

export function FileUpload({ onFileSelect, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selected, setSelected] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = (file: File) => {
    const err = validateFile(file)
    if (err) { setError(err); setSelected(null); return }
    setError(null)
    setSelected(file)
    onFileSelect(file)
  }

  return (
    <div>
      <div
        onDragEnter={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setIsDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? '#3b82f6' : '#d1d5db'}`,
          borderRadius: 8,
          padding: 24,
          textAlign: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: isDragging ? '#eff6ff' : '#f9fafb',
        }}
      >
        {selected ? (
          <span>{selected.name} ({(selected.size / 1024).toFixed(1)} KB)</span>
        ) : (
          <span style={{ color: '#6b7280' }}>Drag & drop or click to upload (PDF, JPG, PNG — max 10 MB)</span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        style={{ display: 'none' }}
        disabled={disabled}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
      {error && <p style={{ color: '#ef4444', marginTop: 4, fontSize: 13 }}>{error}</p>}
    </div>
  )
}
