import React, { useRef, useState } from 'react'
import { UploadCloud, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { ErrorText } from './ui'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
const MAX_BYTES = 10 * 1024 * 1024

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Only JPEG, PNG, and PDF files are allowed.'
  if (file.size > MAX_BYTES) return 'File must be under 10 MB.'
  return null
}

interface Props {
  /** The chosen file, or null when the choice is cleared or fails validation. */
  onFileSelect: (file: File | null) => void
  disabled?: boolean
  id?: string
  'aria-describedby'?: string
}

export function FileUpload({ onFileSelect, disabled, id, ...aria }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selected, setSelected] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = (file: File) => {
    const err = validateFile(file)
    // The parent is told about a refused file too: it used to keep the previously
    // chosen one and upload it, although this box no longer showed it.
    if (err) { setError(err); setSelected(null); onFileSelect(null); return }
    setError(null)
    setSelected(file)
    onFileSelect(file)
  }

  const clear = () => {
    setError(null)
    setSelected(null)
    onFileSelect(null)
  }

  const open = () => !disabled && inputRef.current?.click()

  return (
    <div>
      {/* role="button" + tabIndex + Enter/Space rather than a <label htmlFor>
          wrapper: a label would change native click delegation, and this
          dropzone must keep its own onClick semantics. */}
      <div
        {...aria}
        id={id}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onDragEnter={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setIsDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() }
        }}
        className={cn(
          'flex flex-col items-center gap-2 rounded-card border-2 border-dashed p-6 text-center transition-colors',
          isDragging ? 'border-brand-500 bg-info-soft' : 'border-line-strong bg-surface-muted',
          disabled
            ? 'cursor-not-allowed opacity-60'
            : 'cursor-pointer hover:border-fg-subtle hover:bg-surface-hover'
        )}
      >
        <UploadCloud aria-hidden className="h-6 w-6 text-fg-subtle" />
        {selected ? (
          <span className="text-sm font-medium text-fg">
            {selected.name}{' '}
            <span className="text-fg-subtle tabular-nums">
              ({(selected.size / 1024).toFixed(1)} KB)
            </span>
          </span>
        ) : (
          <span className="text-sm text-fg-muted">
            {/* "Drag & drop" is meaningless on a phone. */}
            <span className="hidden sm:inline">Drag &amp; drop or click to upload</span>
            <span className="sm:hidden">Tap to upload</span>
            {' — '}PDF, JPG, PNG (max 10 MB)
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        className="hidden"
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          // Reset, so picking the same file again (after removing it) still fires onChange.
          e.target.value = ''
          if (f) handleFile(f)
        }}
      />
      {selected && !disabled && (
        <button
          type="button"
          onClick={clear}
          className="mt-1 inline-flex items-center gap-1 text-xs text-link hover:text-link-hover hover:underline"
        >
          <X aria-hidden className="h-3 w-3" />
          Remove file
        </button>
      )}
      {error && <ErrorText className="mt-1">{error}</ErrorText>}
    </div>
  )
}
