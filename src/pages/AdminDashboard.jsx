import React, { useState, useEffect } from 'react'
import {
  LayoutDashboard, FileText, Check, X, Eye, Edit2, 
  Loader2, AlertCircle, CheckCircle, Clock, Brain,
  RefreshCw, ChevronLeft, ChevronRight, Save, ZoomIn, ZoomOut, MousePointer2
} from 'lucide-react'
import InteractiveImageViewer from '../components/InteractiveImageViewer'
import { readJsonOrText } from '../utils/http'
import { getAdminKey, setAdminKey, withAdminKeyHeaders } from '../utils/adminKey'

// Field configuration (same as UserUpload)
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

function AdminDashboard() {
  const [submissions, setSubmissions] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedSubmission, setSelectedSubmission] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState({})
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({})
  const [filePreview, setFilePreview] = useState(null)
  const [selectedField, setSelectedField] = useState(null)
  const [zoom, setZoom] = useState(100)
  const [selectedTextCount, setSelectedTextCount] = useState(0)
  const [fieldPositions, setFieldPositions] = useState({})
  const [contextOverride, setContextOverride] = useState({ country: '', language: '', invoice_type: '' })
  const [needsKey, setNeedsKey] = useState(false)
  const [keyConfigured, setKeyConfigured] = useState(true)
  const [keyInput, setKeyInput] = useState('')
  const [keyBusy, setKeyBusy] = useState(false)
  const [keyError, setKeyError] = useState(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/v1/admin/key/status')
        const { data } = await readJsonOrText(res)
        const configured = Boolean(data?.configured)
        setKeyConfigured(configured)
        const saved = getAdminKey()
        setNeedsKey(configured ? !saved : true)
      } catch {
        // ignore
      }
    })()
  }, [])

  useEffect(() => {
    if (needsKey) return
    fetchSubmissions()
    fetchStats()
  }, [page, needsKey])

  const fetchSubmissions = async () => {
    try {
      const response = await fetch(`/api/v1/submissions?page=${page}&per_page=10`, {
        headers: withAdminKeyHeaders(),
      })
      const { data } = await readJsonOrText(response)
      
      if (response.ok) {
        setSubmissions(data.submissions || [])
        setPagination(data.pagination || {})
      } else if (response.status === 401) {
        setNeedsKey(true)
      }
    } catch (err) {
      setError('Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/v1/training/summary', {
        headers: withAdminKeyHeaders(),
      })
      const { data } = await readJsonOrText(response)
      if (response.ok) {
        setStats(data)
      } else if (response.status === 401) {
        setNeedsKey(true)
      }
    } catch (err) {
      console.error('Failed to load stats:', err)
    }
  }

  const submitKey = async () => {
    const key = (keyInput || '').trim()
    if (!key) return
    setKeyBusy(true)
    setKeyError(null)
    try {
      // If not configured yet, set it; otherwise verify.
      const endpoint = keyConfigured ? '/api/v1/admin/key/verify' : '/api/v1/admin/key/set'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      const { data, text } = await readJsonOrText(res)
      if (!res.ok) {
        throw new Error((data && (data.error || data.message)) || text || 'Invalid key')
      }
      setAdminKey(key)
      setNeedsKey(false)
      setKeyConfigured(true)
      setKeyInput('')
      // refresh now that we have access
      setLoading(true)
      await fetchSubmissions()
      await fetchStats()
    } catch (e) {
      setKeyError(e?.message || 'Invalid key')
    } finally {
      setKeyBusy(false)
    }
  }

  const handleView = async (submission) => {
    setSelectedSubmission(submission)
    setEditData(submission.extracted || {})
    setEditMode(false)
    setSelectedField(null)
    setFieldPositions(submission.field_positions || {})
    setContextOverride({
      country: submission.context_override?.country || submission.original_extraction?.metadata?.detected_country || '',
      language: submission.context_override?.language || submission.original_extraction?.metadata?.detected_language || '',
      invoice_type: submission.context_override?.invoice_type || submission.original_extraction?.metadata?.detected_type || '',
    })
    
    // Load file preview if available
    if (submission.original_extraction?.file_preview) {
      const mimeType = submission.original_extraction.file_preview_mime || 'image/png'
      const base64Image = `data:${mimeType};base64,${submission.original_extraction.file_preview}`
      setFilePreview(base64Image)
    } else {
      setFilePreview(null)
    }
  }

  const handleEdit = () => {
    setEditMode(true)
  }

  const handleFieldChange = (key, value) => {
    setEditData(prev => ({
      ...prev,
      [key]: value
    }))
  }
  
  // Handle value selection from image click (same as UserUpload)
  const handleValueSelect = (fieldKey, position, selectedText) => {
    if (selectedText && selectedField) {
      // User has a field selected and clicked on text boxes - replace value in that field only
      setEditData(prev => ({
        ...prev,
        [selectedField]: selectedText
      }))
      setFieldPositions(prev => ({
        ...prev,
        [selectedField]: position
      }))
    }
  }
  
  // Clear selections when field changes
  const handleFieldFocus = (fieldKey) => {
    setSelectedField(fieldKey)
  }

  const handleSave = async () => {
    setProcessing(true)
    try {
      // Update the submission with edited data and field positions
      const response = await fetch(`/api/v1/submissions/${selectedSubmission.id}/update`, {
        method: 'POST',
        headers: withAdminKeyHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          extracted: editData,
          field_positions: fieldPositions,
          context_override: contextOverride
        }),
      })
      
      if (response.ok) {
        // Update local state
        setSubmissions(prev => prev.map(s => 
          s.id === selectedSubmission.id 
            ? { ...s, extracted: editData }
            : s
        ))
        setSelectedSubmission(prev => ({ ...prev, extracted: editData }))
        setEditMode(false)
      }
    } catch (err) {
      setError('Failed to save changes')
    } finally {
      setProcessing(false)
    }
  }

  const handleApprove = async () => {
    setProcessing(true)
    try {
      const response = await fetch(`/api/v1/submissions/${selectedSubmission.id}/approve`, {
        method: 'POST',
        headers: withAdminKeyHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          extracted: editData,
          raw_text: selectedSubmission.raw_text,
          field_positions: fieldPositions,
          context_override: contextOverride
        }),
      })
      
      const data = await response.json()
      
      if (response.ok) {
        // Update local state
        setSubmissions(prev => prev.map(s => 
          s.id === selectedSubmission.id 
            ? { ...s, status: 'approved' }
            : s
        ))
        setSelectedSubmission(prev => ({ ...prev, status: 'approved' }))
        
        // Show success message
        alert(`Approved! Model learned ${data.patterns_learned || 0} new patterns.`)
      }
    } catch (err) {
      setError('Failed to approve submission')
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    setProcessing(true)
    try {
      const response = await fetch(`/api/v1/submissions/${selectedSubmission.id}/reject`, {
        method: 'POST',
        headers: withAdminKeyHeaders(),
      })
      
      if (response.ok) {
        setSubmissions(prev => prev.map(s => 
          s.id === selectedSubmission.id 
            ? { ...s, status: 'rejected' }
            : s
        ))
        setSelectedSubmission(prev => ({ ...prev, status: 'rejected' }))
      }
    } catch (err) {
      setError('Failed to reject submission')
    } finally {
      setProcessing(false)
    }
  }

  const closeModal = () => {
    setSelectedSubmission(null)
    setEditMode(false)
    setEditData({})
    setFilePreview(null)
    setSelectedField(null)
    setZoom(100)
    setFieldPositions({})
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return <span className="status-badge approved"><CheckCircle size={12} /> Approved</span>
      case 'rejected':
        return <span className="status-badge rejected"><X size={12} /> Rejected</span>
      default:
        return <span className="status-badge pending"><Clock size={12} /> Pending</span>
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="empty-state">
        <Loader2 className="spinner" style={{ width: 48, height: 48, margin: '0 auto' }} />
        <p style={{ marginTop: '1rem' }}>Loading submissions...</p>
      </div>
    )
  }

  if (needsKey) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="card-header">
          <h3 className="card-title">
            <LayoutDashboard size={18} />
            Admin Access
          </h3>
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
            {keyConfigured
              ? 'Enter your admin key to view submissions and training stats.'
              : 'Set a new admin key (first-time setup). Keep it safe — it will be required for Admin & Stats pages.'}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              className="field-input"
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={keyConfigured ? 'Enter admin key…' : 'Create admin key…'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitKey()
              }}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={submitKey} disabled={keyBusy || !keyInput.trim()}>
              {keyBusy ? <><Loader2 size={16} className="spinner" /> Please wait…</> : (keyConfigured ? 'Unlock' : 'Set Key')}
            </button>
          </div>
          {keyError ? (
            <div style={{ marginTop: 10, color: 'var(--error)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} />
              {keyError}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Admin Dashboard</h1>
        <p className="page-subtitle">
          Review, edit, and approve invoice extractions for model learning
        </p>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Submissions</div>
          <div className="stat-value">{pagination.total || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Review</div>
          <div className="stat-value">
            {submissions.filter(s => !s.status || s.status === 'pending').length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Learned Patterns</div>
          <div className="stat-value">{stats?.total_patterns || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Quality Score</div>
          <div className="stat-value">
            {stats?.quality_score ? `${Math.round(stats.quality_score * 100)}%` : '-'}
          </div>
        </div>
      </div>

      {/* Submissions Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <FileText size={18} />
            Submissions
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={fetchSubmissions}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
        
        <div className="table-wrapper">
          {submissions.length === 0 ? (
            <div className="empty-state">
              <FileText className="empty-state-icon" />
              <h3>No submissions yet</h3>
              <p>User submissions will appear here for review</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Invoice #</th>
                  <th>Country</th>
                  <th>Vendor</th>
                  <th>Total</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map(submission => (
                  <tr key={submission.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                        {submission.filename || 'Unknown'}
                      </span>
                    </td>
                    <td>{submission.extracted?.invoiceNumber || '-'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {submission.context_override?.country ||
                        submission.original_extraction?.metadata?.detected_country ||
                        '-'}
                    </td>
                    <td>{submission.extracted?.vendorName || '-'}</td>
                    <td>
                      {submission.extracted?.totalAmount && (
                        <>
                          {submission.extracted.totalAmount}
                          {submission.extracted.currency && ` ${submission.extracted.currency}`}
                        </>
                      ) || '-'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {formatDate(submission.savedAt)}
                    </td>
                    <td>{getStatusBadge(submission.status)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button 
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleView(submission)}
                          title="View / Edit"
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div style={{ 
            padding: '1rem', 
            display: 'flex', 
            justifyContent: 'center',
            alignItems: 'center',
            gap: 16,
            borderTop: '1px solid var(--border)'
          }}>
            <button 
              className="btn btn-ghost btn-sm"
              disabled={!pagination.has_prev}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Page {pagination.page} of {pagination.pages}
            </span>
            <button 
              className="btn btn-ghost btn-sm"
              disabled={!pagination.has_next}
              onClick={() => setPage(p => p + 1)}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedSubmission && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                {editMode ? 'Edit Submission' : 'Review Submission'}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {getStatusBadge(selectedSubmission.status)}
                <button className="btn btn-ghost btn-sm" onClick={closeModal}>
                  <X size={18} />
                </button>
              </div>
            </div>
            
            <div className="modal-body">
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: filePreview ? '1fr 1fr' : '1fr',
                gap: '1.5rem'
              }}>
                {/* Image Preview with Interactive Boxes */}
                {filePreview && (
                  <div style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    background: 'var(--bg-secondary)'
                  }}>
                    <div style={{
                      padding: '0.75rem',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'var(--bg-tertiary)'
                    }}>
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
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button 
                          className="btn btn-ghost btn-sm"
                          onClick={() => setZoom(z => Math.max(50, z - 25))}
                        >
                          <ZoomOut size={14} />
                        </button>
                        <span style={{ fontSize: '0.75rem', minWidth: 40, textAlign: 'center' }}>
                          {zoom}%
                        </span>
                        <button 
                          className="btn btn-ghost btn-sm"
                          onClick={() => setZoom(z => Math.min(200, z + 25))}
                        >
                          <ZoomIn size={14} />
                        </button>
                      </div>
                    </div>
                    <div style={{ 
                      padding: '1rem',
                      maxHeight: '500px',
                      overflow: 'auto',
                      background: 'white'
                    }}>
                      <InteractiveImageViewer
                        imageSrc={filePreview}
                        extractedData={selectedSubmission.original_extraction || {}}
                        onValueSelect={handleValueSelect}
                        selectedField={selectedField}
                        zoom={zoom}
                        onSelectionChange={setSelectedTextCount}
                      />
                    </div>
                  </div>
                )}
                
                {/* Fields */}
                <div>
                  {/* Context override */}
                  <div style={{ marginBottom: '1rem' }}>
                    <label className="form-label">Training Context (override auto-detect)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                      <input
                        type="text"
                        className="form-input"
                        value={contextOverride.country || ''}
                        onChange={(e) => setContextOverride(prev => ({ ...prev, country: e.target.value }))}
                        placeholder="country (e.g. pl)"
                      />
                      <input
                        type="text"
                        className="form-input"
                        value={contextOverride.language || ''}
                        onChange={(e) => setContextOverride(prev => ({ ...prev, language: e.target.value }))}
                        placeholder="language (e.g. pol)"
                      />
                      <input
                        type="text"
                        className="form-input"
                        value={contextOverride.invoice_type || ''}
                        onChange={(e) => setContextOverride(prev => ({ ...prev, invoice_type: e.target.value }))}
                        placeholder="type (e.g. vat)"
                      />
                    </div>
                    <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      If empty, we use auto-detected values from raw text. This affects position-learning buckets.
                    </div>
                  </div>

                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr',
                    gap: '1rem' 
                  }}>
                    {FIELDS.map(field => (
                      <div key={field.key} className="form-group">
                        <label className="form-label">
                          {field.label}
                          {field.required && <span style={{ color: 'var(--error)' }}> *</span>}
                        </label>
                        {editMode ? (
                          <input
                            type="text"
                            data-field={field.key}
                            className={`form-input ${selectedField === field.key ? 'field-selected' : ''}`}
                            value={editData[field.key] || ''}
                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                            onFocus={() => handleFieldFocus(field.key)}
                            placeholder={`Enter ${field.label.toLowerCase()}`}
                          />
                        ) : (
                          <div style={{
                            padding: '10px 14px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)',
                            color: editData[field.key] ? 'var(--text-primary)' : 'var(--text-muted)',
                            fontSize: '0.9rem'
                          }}>
                            {editData[field.key] || 'Not extracted'}
                          </div>
                        )}
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
                    ))}
                  </div>
                </div>
              </div>

              {/* Raw Text Preview */}
              {selectedSubmission.raw_text && (
                <div style={{ marginTop: '1.5rem' }}>
                  <label className="form-label">Raw Text (for learning)</label>
                  <pre style={{
                    padding: '1rem',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    maxHeight: 200,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {selectedSubmission.raw_text}
                  </pre>
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              {selectedSubmission.status !== 'approved' && selectedSubmission.status !== 'rejected' && (
                <>
                  {editMode ? (
                    <>
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => setEditMode(false)}
                      >
                        Cancel
                      </button>
                      <button 
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={processing}
                      >
                        {processing ? <Loader2 size={16} className="spinner" /> : <Save size={16} />}
                        Save Changes
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-secondary" onClick={handleEdit}>
                        <Edit2 size={16} />
                        Edit
                      </button>
                      <button 
                        className="btn btn-danger"
                        onClick={handleReject}
                        disabled={processing}
                      >
                        <X size={16} />
                        Reject
                      </button>
                      <button 
                        className="btn btn-success"
                        onClick={handleApprove}
                        disabled={processing}
                      >
                        {processing ? (
                          <Loader2 size={16} className="spinner" />
                        ) : (
                          <Brain size={16} />
                        )}
                        Approve & Learn
                      </button>
                    </>
                  )}
                </>
              )}
              
              {(selectedSubmission.status === 'approved' || selectedSubmission.status === 'rejected') && (
                <button className="btn btn-secondary" onClick={closeModal}>
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="toast-container">
          <div className="toast error">
            <AlertCircle size={20} />
            <span>{error}</span>
            <button 
              className="btn btn-ghost btn-sm" 
              onClick={() => setError(null)}
              style={{ marginLeft: 'auto' }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminDashboard

