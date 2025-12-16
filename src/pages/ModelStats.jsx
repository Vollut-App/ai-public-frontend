import React, { useEffect, useMemo, useState } from 'react'
import { RefreshCw, AlertCircle, Loader2, BarChart3, Activity, Brain, MapPin } from 'lucide-react'
import { readJsonOrText } from '../utils/http'
import { getAdminKey, setAdminKey, withAdminKeyHeaders } from '../utils/adminKey'

function StatCard({ title, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-card-title">{title}</div>
      <div className="stat-card-value">{value}</div>
      {sub ? <div className="stat-card-sub">{sub}</div> : null}
    </div>
  )
}

function JsonBlock({ data }) {
  return (
    <pre className="json-block">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}

export default function ModelStats() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)
  const [showRaw, setShowRaw] = useState(false)
  const [needsKey, setNeedsKey] = useState(false)
  const [keyConfigured, setKeyConfigured] = useState(true)
  const [keyInput, setKeyInput] = useState('')
  const [keyBusy, setKeyBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/training/advanced', { headers: withAdminKeyHeaders() })
      const { data, text } = await readJsonOrText(res)
      if (!res.ok) {
        if (res.status === 401) {
          setNeedsKey(true)
          throw new Error((data && data.error) || 'Admin key required')
        }
        throw new Error((data && (data.error || data.message)) || text || `Failed (${res.status})`)
      }
      setStats(data)
      setNeedsKey(false)
    } catch (e) {
      setError(e?.message || 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

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
      } finally {
        // attempt load (will 401 if needed)
        load()
      }
    })()
  }, [])

  const submitKey = async () => {
    const key = (keyInput || '').trim()
    if (!key) return
    setKeyBusy(true)
    setError(null)
    try {
      const endpoint = keyConfigured ? '/api/v1/admin/key/verify' : '/api/v1/admin/key/set'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      const { data, text } = await readJsonOrText(res)
      if (!res.ok) throw new Error((data && (data.error || data.message)) || text || 'Invalid key')
      setAdminKey(key)
      setNeedsKey(false)
      setKeyConfigured(true)
      setKeyInput('')
      load()
    } catch (e) {
      setError(e?.message || 'Invalid key')
    } finally {
      setKeyBusy(false)
    }
  }

  const summary = stats?.training?.summary || {}
  const quality = stats?.training?.quality || {}
  const perf = stats?.training?.performance || {}
  const timeline = stats?.training?.timeline || {}
  const apiMetrics = stats?.api_metrics || {}
  const submissionsMetrics = stats?.submissions_metrics || {}

  const byFieldRows = useMemo(() => {
    const byField = stats?.training?.by_field || {}
    const rows = Object.keys(byField).map((k) => {
      const v = byField[k] || {}
      return {
        field: k,
        patterns_total: v.total_patterns ?? v.total ?? 0,
        trusted: v.trusted ?? 0,
        validated: v.validated ?? 0,
        candidate: v.candidate ?? 0,
        avg_confidence: v.avg_confidence ?? null,
        success_rate: v.avg_success_rate ?? null,
      }
    })
    rows.sort((a, b) => (b.patterns_total || 0) - (a.patterns_total || 0))
    return rows
  }, [stats])

  const positionContexts = stats?.position_learning?.contexts || []
  const topChanged = submissionsMetrics?.top_changed_fields || []
  const overallMatch = submissionsMetrics?.overall?.match_rate
  const overallChanged = submissionsMetrics?.overall?.changed_rate
  const posCoverage = submissionsMetrics?.position_coverage?.overall
  const avgOcrItems = submissionsMetrics?.ocr?.avg_all_extracted_text_items
  const avgQuality = submissionsMetrics?.validation?.avg_overall_quality

  if (needsKey) {
    return (
      <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="card-header">
          <h3 className="card-title">
            <BarChart3 size={18} />
            Model Stats Access
          </h3>
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>
            {keyConfigured
              ? 'Enter your admin key to view detailed model metrics.'
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
          {error ? (
            <div style={{ marginTop: 10, color: 'var(--error)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} />
              {error}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="stats-page">
        <div className="stats-header">
          <div className="stats-title">
            <BarChart3 size={18} />
            Model Stats
          </div>
        </div>
        <div className="stats-loading">
          <Loader2 className="spin" size={18} />
          Loading…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="stats-page">
        <div className="stats-header">
          <div className="stats-title">
            <BarChart3 size={18} />
            Model Stats
          </div>
          <button className="btn btn-secondary" onClick={load}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
        <div className="stats-error">
          <AlertCircle size={18} />
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="stats-page">
      <div className="stats-header">
        <div className="stats-title">
          <BarChart3 size={18} />
          Model Stats
        </div>
        <div className="stats-actions">
          <button className="btn btn-secondary" onClick={() => setShowRaw(v => !v)}>
            {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
          </button>
          <button className="btn btn-secondary" onClick={load}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard title="Total patterns" value={summary.total_patterns ?? '-'} sub={`Quality score: ${quality.quality_score ?? '-'}`} />
        <StatCard title="Trusted" value={summary.trusted_count ?? '-'} sub={`Avg conf: ${quality.trusted_avg_confidence ?? '-'}`} />
        <StatCard title="Validated" value={summary.validated_count ?? '-'} sub={`Avg conf: ${quality.validated_avg_confidence ?? '-'}`} />
        <StatCard title="Candidate" value={summary.candidate_count ?? '-'} sub={`Deprecated: ${summary.deprecated_count ?? 0}`} />
        <StatCard title="API requests" value={apiMetrics.total_requests ?? '-'} sub={`Errors: ${apiMetrics.total_errors ?? 0} (${apiMetrics.error_rate ?? 0}%)`} />
        <StatCard title="Uptime" value={apiMetrics.uptime_seconds ?? '-'} sub="seconds" />
        <StatCard title="Saved submissions" value={submissionsMetrics.submissions ?? '-'} sub={`Window: last ${submissionsMetrics.limit ?? '-'} submissions`} />
        <StatCard title="Model agreement" value={overallMatch == null ? '-' : `${(Number(overallMatch) * 100).toFixed(1)}%`} sub="Matches model output vs saved (proxy accuracy)" />
        <StatCard title="Correction rate" value={overallChanged == null ? '-' : `${(Number(overallChanged) * 100).toFixed(1)}%`} sub="How often users change a field" />
        <StatCard title="Position coverage" value={posCoverage == null ? '-' : `${(Number(posCoverage) * 100).toFixed(1)}%`} sub="Fields with value that also have a click-position" />
        <StatCard title="Avg OCR boxes" value={avgOcrItems ?? '-'} sub="Average all_extracted_text tokens per submission" />
        <StatCard title="Avg validation quality" value={avgQuality == null ? '-' : Number(avgQuality).toFixed(3)} sub="From validation_summary.overall_quality" />
      </div>

      <div className="stats-section">
        <div className="stats-section-title">
          <Activity size={16} /> Pattern performance
        </div>
        <div className="stats-kv">
          <div><b>Avg confidence</b>: {perf.avg_confidence ?? '-'}</div>
          <div><b>Avg success rate</b>: {perf.avg_success_rate ?? '-'}</div>
          <div><b>Total successes</b>: {perf.total_successes ?? '-'}</div>
          <div><b>Total failures</b>: {perf.total_failures ?? '-'}</div>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-section-title">
          <Brain size={16} /> By field
        </div>
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Total</th>
                <th>Trusted</th>
                <th>Validated</th>
                <th>Candidate</th>
                <th>Avg conf</th>
                <th>Success rate</th>
              </tr>
            </thead>
            <tbody>
              {byFieldRows.map((r) => (
                <tr key={r.field}>
                  <td className="mono">{r.field}</td>
                  <td>{r.patterns_total}</td>
                  <td>{r.trusted}</td>
                  <td>{r.validated}</td>
                  <td>{r.candidate}</td>
                  <td>{r.avg_confidence == null ? '-' : Number(r.avg_confidence).toFixed(3)}</td>
                  <td>{r.success_rate == null ? '-' : `${(Number(r.success_rate) * 100).toFixed(1)}%`}</td>
                </tr>
              ))}
              {byFieldRows.length === 0 ? (
                <tr><td colSpan={7} className="muted">No data</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-section-title">
          <Brain size={16} /> Most corrected fields (top 8)
        </div>
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Samples</th>
                <th>Changed</th>
                <th>Change rate</th>
                <th>Match rate</th>
              </tr>
            </thead>
            <tbody>
              {topChanged.map((r) => (
                <tr key={r.field}>
                  <td className="mono">{r.field}</td>
                  <td>{r.samples}</td>
                  <td>{r.changed}</td>
                  <td>{`${(Number(r.changed_rate) * 100).toFixed(1)}%`}</td>
                  <td>{`${(Number(r.match_rate) * 100).toFixed(1)}%`}</td>
                </tr>
              ))}
              {topChanged.length === 0 ? (
                <tr><td colSpan={5} className="muted">No submission metrics yet</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-section-title">
          <MapPin size={16} /> Position learning (by context)
        </div>
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Context</th>
                <th>Total samples</th>
                <th>Fields learned</th>
              </tr>
            </thead>
            <tbody>
              {positionContexts.map((c) => (
                <tr key={c.context}>
                  <td className="mono">{c.context}</td>
                  <td>{c.total_samples ?? 0}</td>
                  <td className="mono">{Object.keys(c.fields || {}).length}</td>
                </tr>
              ))}
              {positionContexts.length === 0 ? (
                <tr><td colSpan={3} className="muted">No context-aware position data yet</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          Context key is typically <span className="mono">country|language|invoice_type</span>.
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-section-title">
          <Brain size={16} /> Context model (country/language)
        </div>
        <div className="stats-kv">
          <div><b>Country labels</b>: {stats?.context_model?.country?.labels?.length ?? '-'}</div>
          <div><b>Country docs</b>: {stats?.context_model?.country?.total_docs ?? '-'}</div>
          <div><b>Language labels</b>: {stats?.context_model?.language?.labels?.length ?? '-'}</div>
          <div><b>Language docs</b>: {stats?.context_model?.language?.total_docs ?? '-'}</div>
          <div><b>Vocab size (country)</b>: {stats?.context_model?.country?.vocab_size ?? '-'}</div>
          <div><b>Vocab size (language)</b>: {stats?.context_model?.language?.vocab_size ?? '-'}</div>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-section-title">Timeline</div>
        <div className="stats-kv">
          <div><b>Newest pattern</b>: {timeline.newest_pattern_date ?? '-'}</div>
          <div><b>Oldest pattern</b>: {timeline.oldest_pattern_date ?? '-'}</div>
          <div><b>Patterns last 7 days</b>: {timeline.patterns_last_7_days ?? '-'}</div>
          <div><b>Patterns last 30 days</b>: {timeline.patterns_last_30_days ?? '-'}</div>
        </div>
      </div>

      {showRaw ? (
        <div className="stats-section">
          <div className="stats-section-title">Raw JSON</div>
          <JsonBlock data={stats} />
        </div>
      ) : null}
    </div>
  )
}


