import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Upload, FileText, Check, AlertCircle, Loader2, 
  Save, RotateCcw, ZoomIn, ZoomOut, Eye, Code, MousePointer2, ChevronLeft, ChevronRight
} from 'lucide-react'
import InteractiveImageViewer from '../components/InteractiveImageViewer'
import { readJsonOrText } from '../utils/http'

// Field configuration
const FIELDS = [
  { key: 'invoiceNumber', label: 'Invoice Number', required: true },
  { key: 'invoiceDate', label: 'Invoice Date', required: true },
  { key: 'dueDate', label: 'Due Date' },
  { key: 'vendorName', label: 'Vendor Name' },
  { key: 'vendorTaxId', label: 'Vendor Tax ID' },
  { key: 'customerName', label: 'Customer Name' },
  { key: 'customerTaxId', label: 'Customer Tax ID' },
  { key: 'amount', label: 'Net Amount' },
  { key: 'taxAmount', label: 'Tax Amount' },
  { key: 'totalAmount', label: 'Total Amount', required: true },
  { key: 'currency', label: 'Currency' },
  { key: 'iban', label: 'IBAN' },
]

function UserUpload() {
  const MAX_UPLOAD_BYTES = 3 * 1024 * 1024 // 3MB

  const [file, setFile] = useState(null)
  const [filePreview, setFilePreview] = useState(null)
  const [extractedData, setExtractedData] = useState(null)
  const [formData, setFormData] = useState({})
  const [rawText, setRawText] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showSaveSuccessModal, setShowSaveSuccessModal] = useState(false)
  const [viewMode, setViewMode] = useState('preview') // 'preview' or 'text'
  const [zoom, setZoom] = useState(100)
  const [selectedField, setSelectedField] = useState(null)
  const [fieldPositions, setFieldPositions] = useState({}) // Store click positions
  const [selectedTextCount, setSelectedTextCount] = useState(0) // Track how many words selected
  const [currentPage, setCurrentPage] = useState(0)
  const saveSuccessTimerRef = useRef(null)

  // If we reset after save, keep a short-lived success banner on the fresh upload screen
  useEffect(() => {
    try {
      const msg = sessionStorage.getItem('upload_success_banner')
      if (msg) {
        sessionStorage.removeItem('upload_success_banner')
        setSuccess(msg)
        const t = setTimeout(() => setSuccess(null), 2500)
        return () => clearTimeout(t)
      }
    } catch {
      // ignore storage errors
    }
  }, [])

  const onDrop = useCallback(async (acceptedFiles) => {
    const uploadedFile = acceptedFiles[0]
    if (!uploadedFile) return

    // Enforce 3MB max to keep save/training payloads safe (base64 adds overhead)
    if (uploadedFile.size > MAX_UPLOAD_BYTES) {
      setError(`File too large. Max allowed is 3MB. Your file is ${(uploadedFile.size / (1024 * 1024)).toFixed(2)}MB.`)
      return
    }

    setFile(uploadedFile)
    setError(null)
    setSuccess(null)
    setExtractedData(null)

    // Preview will be set from API response (handles both images and PDFs)
    setFilePreview(null)

    // Extract data
    await extractData(uploadedFile)
  }, [])

  const extractData = async (uploadedFile) => {
    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', uploadedFile)

      const response = await fetch('/api/v1/extract', {
        method: 'POST',
        body: formData,
      })

      const { data, text } = await readJsonOrText(response)

      if (!response.ok) {
        const message =
          (data && (data.error || data.message)) ||
          (text ? text.slice(0, 400) : null) ||
          `Extraction failed (${response.status})`
        throw new Error(message)
      }

      setExtractedData(data)
      setRawText(data.raw_text || '')
      setCurrentPage(0)
      
      // Set preview from API response (handles both images and PDFs converted to images)
      // If multi-page PDF is present, use page 0 preview initially
      if (data.pages && data.pages.length > 0) {
        const p0 = data.pages[0]
        const mimeType = p0.file_preview_mime || 'image/png'
        setFilePreview(`data:${mimeType};base64,${p0.file_preview}`)
      } else if (data.file_preview) {
        const mimeType = data.file_preview_mime || 'image/png'
        const base64Image = `data:${mimeType};base64,${data.file_preview}`
        setFilePreview(base64Image)
      } else if (uploadedFile.type.startsWith('image/')) {
        // Fallback: use object URL for images if API didn't return preview
        setFilePreview(URL.createObjectURL(uploadedFile))
      }
      
      // Initialize form data with extracted values
      const initialForm = {}
      FIELDS.forEach(field => {
        const fieldData = data[field.key]
        if (fieldData && fieldData.value) {
          initialForm[field.key] = fieldData.value
        } else {
          initialForm[field.key] = ''
        }
      })
      setFormData(initialForm)

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFieldChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }))
  }

  // Handle value selection from image click
  const handleValueSelect = (fieldKey, position, selectedText) => {
    // Check if we have selected text and a selected field
    if (selectedText && selectedText.trim() && selectedField) {
      // User has a field selected and clicked on text boxes - replace value in that field only
      setFormData(prev => ({
        ...prev,
        [selectedField]: selectedText.trim()  // Replace, don't append
      }))
      if (position) {
        setFieldPositions(prev => ({
          ...prev,
          [selectedField]: position
        }))
      }
    } else if (fieldKey) {
      // User clicked on a structured field box
      setSelectedField(fieldKey)
      setFieldPositions(prev => ({
        ...prev,
        [fieldKey]: position
      }))
      const input = document.querySelector(`input[data-field="${fieldKey}"]`)
      if (input) {
        input.focus()
        input.select()
      }
    }
  }
  
  // Clear selections when field changes
  const handleFieldFocus = (fieldKey) => {
    setSelectedField(fieldKey)
    // This will trigger useEffect in InteractiveImageViewer to clear selections
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      if (file && file.size > MAX_UPLOAD_BYTES) {
        throw new Error(`File too large. Max allowed is 3MB.`)
      }

      // Optionally send original file bytes for future training/reprocessing
      // (kept as base64 to avoid multipart for this endpoint)
      let fileBase64 = null
      let fileMime = null
      let fileOriginalName = null
      if (file) {
        fileMime = file.type || null
        fileOriginalName = file.name || null
        fileBase64 = await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = () => {
            const result = reader.result
            if (typeof result === 'string') {
              // data:<mime>;base64,<payload>
              const idx = result.indexOf('base64,')
              resolve(idx >= 0 ? result.slice(idx + 7) : null)
            } else {
              resolve(null)
            }
          }
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(file)
        })
      }

      const response = await fetch('/api/v1/submissions/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file?.name || 'unknown',
          extracted: formData,
          raw_text: rawText,
          original_extraction: extractedData,
          field_positions: fieldPositions, // Include click positions for learning
          file_base64: fileBase64,
          file_mime: fileMime,
          file_original_name: fileOriginalName,
        }),
      })

      const { data, text } = await readJsonOrText(response)

      if (!response.ok) {
        const message =
          (data && (data.error || data.message)) ||
          (text ? text.slice(0, 400) : null) ||
          `Failed to save (${response.status})`
        throw new Error(message)
      }

      setShowSaveSuccessModal(true)
      
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (saveSuccessTimerRef.current) {
      clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = null
    }
    setFile(null)
    setFilePreview(null)
    setExtractedData(null)
    setFormData({})
    setRawText('')
    setError(null)
    setSuccess(null)
    setShowSaveSuccessModal(false)
    setSelectedField(null)
    setFieldPositions({})
    setSelectedTextCount(0)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.gif', '.webp']
    },
    maxFiles: 1,
    maxSize: 16 * 1024 * 1024, // 16MB
  })

  const getConfidenceClass = (confidence) => {
    if (confidence >= 0.8) return 'high'
    if (confidence >= 0.5) return 'medium'
    return 'low'
  }

  // No file uploaded yet
  if (!file) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Upload Invoice</h1>
          <p className="page-subtitle">
            Upload a PDF or image file to extract invoice data
          </p>
        </div>

        <div className="card">
          <div className="card-body">
            <div 
              {...getRootProps()} 
              className={`dropzone ${isDragActive ? 'active' : ''}`}
            >
              <input {...getInputProps()} />
              <Upload className="dropzone-icon" size={64} />
              <div className="dropzone-title">
                {isDragActive ? 'Drop file here' : 'Drag & drop or click to upload'}
              </div>
              <div className="dropzone-subtitle">
                Supports PDF, PNG, JPG, TIFF • Max 16MB
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {loading && (
        <div className="page-overlay" role="status" aria-live="polite">
          <div className="page-overlay-card">
            <Loader2 className="spinner" style={{ width: 42, height: 42 }} />
            <div className="page-overlay-title">AI is reading your invoice…</div>
            <div className="page-overlay-sub">
              We’re detecting fields and drawing selectable boxes. This can take up to ~30 seconds for scanned PDFs.
            </div>
          </div>
        </div>
      )}

      {showSaveSuccessModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Save successful">
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Check size={18} color="var(--success)" />
                Thanks — saved!
              </h3>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)' }}>
                Your corrections help the AI learn faster. We’ll use this submission to improve future extractions.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-primary"
                onClick={() => {
                  // Show a short banner after reset (optional, for reassurance)
                  try {
                    sessionStorage.setItem('upload_success_banner', 'Saved. Thanks for helping improve the AI.')
                  } catch {
                    // ignore
                  }
                  handleReset()
                }}
              >
                Back to Upload
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="page-header">
        <h1 className="page-title">Extract Invoice Data</h1>
        {file && (
          <p className="page-subtitle">
            {file.name}
          </p>
        )}
      </div>

      {error && (
        <div className="toast error" style={{ marginBottom: '1rem' }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="toast success" style={{ marginBottom: '1rem' }}>
          <Check size={20} />
          <span>{success}</span>
        </div>
      )}

      <div className="extraction-layout">
        {/* Preview Panel */}
        <div className="preview-panel">
          <div className="preview-header">
            <div className="tabs" style={{ margin: 0, flex: 1, maxWidth: 300 }}>
              <button 
                className={`tab ${viewMode === 'preview' ? 'active' : ''}`}
                onClick={() => setViewMode('preview')}
              >
                <Eye size={14} style={{ marginRight: 6 }} />
                Preview
              </button>
              <button 
                className={`tab ${viewMode === 'text' ? 'active' : ''}`}
                onClick={() => setViewMode('text')}
              >
                <Code size={14} style={{ marginRight: 6 }} />
                Raw Text
              </button>
            </div>
            {viewMode === 'preview' && filePreview && (
              <div style={{ 
                fontSize: '0.75rem', 
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <MousePointer2 size={14} />
                <span>
                  {selectedField 
                    ? `Click words to fill "${FIELDS.find(f => f.key === selectedField)?.label || selectedField}"`
                    : 'Click a field first, then click words to fill it'}
                </span>
                {selectedTextCount > 0 && selectedField && (
                  <span style={{ 
                    color: 'var(--accent)',
                    fontWeight: '600',
                    marginLeft: '8px'
                  }}>
                    {selectedTextCount} word{selectedTextCount > 1 ? 's' : ''} selected
                  </span>
                )}
              </div>
            )}
            
            {viewMode === 'preview' && filePreview && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button 
                  className="btn btn-ghost btn-sm"
                  onClick={() => setZoom(z => Math.max(50, z - 25))}
                >
                  <ZoomOut size={16} />
                </button>
                <span style={{ 
                  color: 'var(--text-muted)', 
                  fontSize: '0.8rem',
                  minWidth: 50,
                  textAlign: 'center'
                }}>
                  {zoom}%
                </span>
                <button 
                  className="btn btn-ghost btn-sm"
                  onClick={() => setZoom(z => Math.min(200, z + 25))}
                >
                  <ZoomIn size={16} />
                </button>
              </div>
            )}

            {/* Multi-page navigation (PDF) */}
            {viewMode === 'preview' && extractedData?.pages?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 10 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    const nextIdx = Math.max(0, currentPage - 1)
                    const p = extractedData.pages[nextIdx]
                    if (!p) return
                    setCurrentPage(nextIdx)
                    setFilePreview(`data:${p.file_preview_mime || 'image/png'};base64,${p.file_preview}`)
                  }}
                  disabled={currentPage <= 0}
                  title="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>

                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 72, textAlign: 'center' }}>
                  {currentPage + 1}
                  {typeof extractedData.page_count === 'number' ? ` / ${extractedData.page_count}` : ''}
                </span>

                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    // Only navigate within available previews (pages array is capped)
                    const maxIdx = extractedData.pages.length - 1
                    const nextIdx = Math.min(maxIdx, currentPage + 1)
                    const p = extractedData.pages[nextIdx]
                    if (!p) return
                    setCurrentPage(nextIdx)
                    setFilePreview(`data:${p.file_preview_mime || 'image/png'};base64,${p.file_preview}`)
                  }}
                  disabled={currentPage >= extractedData.pages.length - 1}
                  title="Next page"
                >
                  <ChevronRight size={16} />
                </button>

                {extractedData.pages_truncated && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    (previews limited)
                  </span>
                )}
              </div>
            )}
          </div>
          
          <div className="preview-content">
            {viewMode === 'preview' ? (
              filePreview ? (
                <>
                  <InteractiveImageViewer
                    imageSrc={filePreview}
                    extractedData={
                      extractedData?.pages?.length
                        ? {
                            ...extractedData,
                            ...extractedData.pages[currentPage],
                            all_extracted_text: extractedData.pages[currentPage]?.all_extracted_text || [],
                            preview_image_width: extractedData.pages[currentPage]?.preview_image_width,
                            preview_image_height: extractedData.pages[currentPage]?.preview_image_height,
                          }
                        : extractedData
                    }
                  onValueSelect={handleValueSelect}
                  selectedField={selectedField}
                  zoom={zoom}
                  onSelectionChange={setSelectedTextCount}
                  />
                </>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  <FileText size={64} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                  <p>PDF preview not available</p>
                  <p style={{ fontSize: '0.8rem' }}>Switch to Raw Text view</p>
                </div>
              )
            ) : (
              <pre className="preview-text">
                {rawText || 'No text extracted'}
              </pre>
            )}
          </div>
        </div>

        {/* Fields Panel */}
        <div className="card fields-panel">
          <div className="card-header">
            <h3 className="card-title">
              <FileText size={18} />
              Extracted Fields
            </h3>
            {extractedData?.metadata && (
              <span style={{ 
                fontSize: '0.75rem', 
                color: 'var(--text-muted)',
                background: 'var(--bg-tertiary)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)'
              }}>
                {extractedData.metadata.detected_country} • {extractedData.metadata.detected_language}
              </span>
            )}
          </div>
          
          <div className="fields-list">
            {FIELDS.map(field => {
              const fieldData = extractedData?.[field.key] || {}
              const confidence = fieldData.confidence || 0
              const validation = fieldData.validation || {}
              
              return (
                <div key={field.key} className="field-item">
                  <div className="field-header">
                    <span className="field-name">
                      {field.label}
                      {field.required && <span style={{ color: 'var(--error)' }}> *</span>}
                    </span>
                    {fieldData.value && (
                      <span className={`field-confidence ${getConfidenceClass(confidence)}`}>
                        {Math.round(confidence * 100)}%
                      </span>
                    )}
                  </div>
                  
                  <div className="field-value">
                    <input
                      type="text"
                      data-field={field.key}
                      className={`form-input field-input ${selectedField === field.key ? 'field-selected' : ''}`}
                      value={formData[field.key] || ''}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      onFocus={() => handleFieldFocus(field.key)}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                    />
                    {fieldPositions[field.key] && (
                      <span style={{ 
                        fontSize: '0.7rem', 
                        color: 'var(--accent)',
                        marginTop: '4px',
                        display: 'block'
                      }}>
                        <MousePointer2 size={10} style={{ marginRight: 4 }} />
                        Position recorded
                      </span>
                    )}
                  </div>
                  
                  <div className="field-source">
                    {fieldData.source && (
                      <span>Source: {fieldData.source}</span>
                    )}
                    {fieldData.position?.zone && (
                      <span> • Zone: {fieldData.position.zone}</span>
                    )}
                    {validation.is_valid !== undefined && (
                      <span className={`validation-badge ${validation.is_valid ? 'valid' : 'invalid'}`}>
                        {validation.is_valid ? (
                          <><Check size={10} /> Valid</>
                        ) : (
                          <><AlertCircle size={10} /> {validation.reason}</>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          
          <div className="actions-footer">
            <button className="btn btn-secondary" onClick={handleReset}>
              <RotateCcw size={16} />
              Upload New
            </button>
            <button 
              className="btn btn-primary" 
              onClick={handleSave}
              disabled={saving}
              style={{ flex: 1 }}
            >
              {saving ? (
                <><Loader2 size={16} className="spinner" /> Saving...</>
              ) : (
                <><Save size={16} /> Save Submission</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UserUpload

