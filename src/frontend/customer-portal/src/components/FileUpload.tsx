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
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'
        } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-gray-400 hover:bg-gray-100'}`}
      >
        {selected ? (
          <span className="text-sm text-gray-700 font-medium">
            {selected.name} <span className="text-gray-400">({(selected.size / 1024).toFixed(1)} KB)</span>
          </span>
        ) : (
          <span className="text-sm text-gray-500">
            Drag &amp; drop or click to upload — PDF, JPG, PNG (max 10 MB)
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        className="hidden"
        disabled={disabled}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
