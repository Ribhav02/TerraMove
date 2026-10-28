import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Camera,
  ShieldCheck,
  Send,
  Navigation,
  X,
  Eye,
  EyeOff,
  Info,
  RefreshCw
} from 'lucide-react';
import {
  submitCitizenReport,
  uploadReportPhoto,
  fetchCitizenReports,
  moderateCitizenReport
} from '../../services/communityApi';
import type { CitizenReportItem } from '../../types';

interface CommunityPanelProps {
  onSelectLocationOnMap?: () => void;
  pickedLocation?: { lat: number; lon: number } | null;
  onFocusHazardOnMap?: (lat: number, lon: number) => void;
  onReportsUpdated?: () => void;
}

const CATEGORIES = [
  { value: 'pothole', label: 'Pothole / Damaged Surface', icon: '🕳️' },
  { value: 'broken_footpath', label: 'Broken Footpath', icon: '🚶' },
  { value: 'construction', label: 'Construction Obstruction', icon: '🚧' },
  { value: 'streetlight', label: 'Streetlight Not Working', icon: '💡' },
  { value: 'garbage', label: 'Garbage / Waste Obstruction', icon: '🗑️' },
  { value: 'unsafe_crossing', label: 'Unsafe Crossing', icon: '🚸' },
  { value: 'extreme_heat', label: 'Severe Sun / Heat Area', icon: '☀️' },
  { value: 'other', label: 'Other Pedestrian Issue', icon: '📍' }
];

export const CommunityPanel: React.FC<CommunityPanelProps> = ({
  onSelectLocationOnMap,
  pickedLocation,
  onFocusHazardOnMap,
  onReportsUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'report' | 'feed' | 'moderator'>('report');

  // Report Form State
  const [category, setCategory] = useState<string>('pothole');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [severity, setSeverity] = useState<'low' | 'moderate' | 'high' | 'severe'>('moderate');
  const [lat, setLat] = useState<number>(30.7410);
  const [lon, setLon] = useState<number>(76.7820);
  const [isGps, setIsGps] = useState<boolean>(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Feed State
  const [reports, setReports] = useState<CitizenReportItem[]>([]);
  const [feedStatusFilter, setFeedStatusFilter] = useState<string>('all');
  const [feedCategoryFilter, setFeedCategoryFilter] = useState<string>('all');
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(false);

  // Moderator State
  const [moderatorToken, setModeratorToken] = useState<string>('');
  const [showToken, setShowToken] = useState<boolean>(false);
  const [moderatingId, setModeratingId] = useState<string | null>(null);
  const [modNotes, setModNotes] = useState<string>('');
  const [modSuccess, setModSuccess] = useState<string | null>(null);
  const [modError, setModError] = useState<string | null>(null);

  // Sync picked location from map click
  useEffect(() => {
    if (pickedLocation) {
      setLat(pickedLocation.lat);
      setLon(pickedLocation.lon);
      setIsGps(false);
      setSubmitSuccess(null);
    }
  }, [pickedLocation]);

  // Load feed when tab is feed or moderator
  const loadFeed = async () => {
    setIsLoadingFeed(true);
    try {
      const res = await fetchCitizenReports({
        status: feedStatusFilter,
        category: feedCategoryFilter,
        limit: 50
      });
      setReports(res.reports);
      if (onReportsUpdated) onReportsUpdated();
    } catch (e: any) {
      console.error('Failed to load reports:', e);
    } finally {
      setIsLoadingFeed(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'feed' || activeTab === 'moderator') {
      loadFeed();
    }
  }, [activeTab, feedStatusFilter, feedCategoryFilter]);

  // Handle GPS location
  const handleGetGpsLocation = () => {
    if (!navigator.geolocation) {
      setSubmitError('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    setSubmitError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const userLat = parseFloat(pos.coords.latitude.toFixed(5));
        const userLon = parseFloat(pos.coords.longitude.toFixed(5));

        // Check if inside Chandigarh general bounds
        if (userLat >= 30.60 && userLat <= 30.85 && userLon >= 76.60 && userLon <= 76.95) {
          setLat(userLat);
          setLon(userLon);
          setIsGps(true);
        } else {
          // If user is far from Chandigarh, inform them and fallback to Sector 17 center
          setSubmitError(`Detected location (${userLat}, ${userLon}) is outside Sector 17, Chandigarh. Defaulted to Sector 17 Central Plaza.`);
          setLat(30.7410);
          setLon(76.7820);
          setIsGps(false);
        }
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setSubmitError('GPS permission was denied. You can click "Pick on Map" to select the location manually.');
        } else {
          setSubmitError('Could not determine GPS position. Please pick the location on the map.');
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Handle Photo Selection
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        setSubmitError('Selected photo exceeds maximum 5 MB limit.');
        return;
      }
      setPhotoFile(file);
      const previewUrl = URL.createObjectURL(file);
      setPhotoPreview(previewUrl);
      setSubmitError(null);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
  };

  // Submit Report
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || title.trim().length < 3) {
      setSubmitError('Please enter a descriptive title (at least 3 characters).');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      let uploadedPhotoUrl: string | undefined = undefined;

      // 1. Upload photo if selected
      if (photoFile) {
        try {
          const uploadRes = await uploadReportPhoto(photoFile);
          uploadedPhotoUrl = uploadRes.photo_url;
        } catch (uploadErr: any) {
          throw new Error(`Photo upload failed: ${uploadErr.message}`);
        }
      }

      // 2. Submit report
      const reportRes = await submitCitizenReport({
        category,
        title: title.trim(),
        description: description.trim() || undefined,
        severity,
        latitude: lat,
        longitude: lon,
        is_gps_location: isGps,
        photo_url: uploadedPhotoUrl,
        user_session_id: `citizen_${Math.random().toString(36).substring(2, 9)}`
      });

      setSubmitSuccess(`Report submitted successfully! Reference ID: ${reportRes.id.substring(0, 8)}. Field staff will review your report.`);
      setTitle('');
      setDescription('');
      handleRemovePhoto();
      if (onReportsUpdated) onReportsUpdated();
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit report. Please check details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Moderate Status Update
  const handleModerate = async (reportId: string, newStatus: string) => {
    if (!moderatorToken.trim()) {
      setModError('Moderator secret token is required to update status.');
      return;
    }

    setModError(null);
    setModSuccess(null);
    try {
      await moderateCitizenReport(reportId, newStatus, modNotes.trim() || undefined, moderatorToken.trim());
      setModSuccess(`Report ${reportId.substring(0, 8)} status updated to '${newStatus}'.`);
      setModNotes('');
      setModeratingId(null);
      loadFeed();
    } catch (err: any) {
      setModError(err.message || 'Moderation action rejected.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Tab Navigation */}
      <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('report')}
          style={{
            flex: 1,
            padding: '7px 10px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: activeTab === 'report' ? '#162436' : 'transparent',
            color: activeTab === 'report' ? '#00ff88' : '#94a3b8',
            border: activeTab === 'report' ? '1px solid rgba(0, 255, 136, 0.4)' : 'none',
            boxShadow: activeTab === 'report' ? '0 0 10px rgba(0, 255, 136, 0.15)' : 'none'
          }}
        >
          Report Issue
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('feed')}
          style={{
            flex: 1,
            padding: '7px 10px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: activeTab === 'feed' ? '#162436' : 'transparent',
            color: activeTab === 'feed' ? '#00ff88' : '#94a3b8',
            border: activeTab === 'feed' ? '1px solid rgba(0, 255, 136, 0.4)' : 'none',
            boxShadow: activeTab === 'feed' ? '0 0 10px rgba(0, 255, 136, 0.15)' : 'none'
          }}
        >
          Community Hazards
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('moderator')}
          style={{
            flex: 1,
            padding: '7px 10px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: activeTab === 'moderator' ? '#162436' : 'transparent',
            color: activeTab === 'moderator' ? '#00ff88' : '#94a3b8',
            border: activeTab === 'moderator' ? '1px solid rgba(0, 255, 136, 0.4)' : 'none',
            boxShadow: activeTab === 'moderator' ? '0 0 10px rgba(0, 255, 136, 0.15)' : 'none'
          }}
        >
          Staff Moderation
        </button>
      </div>

      {/* TAB 1: REPORT ISSUE */}
      {activeTab === 'report' && (
        <form onSubmit={handleSubmitReport} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              ISSUE CATEGORY
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 10px',
                    fontSize: '11px',
                    border: category === cat.value ? '1px solid #00ff88' : '1px solid rgba(148, 163, 184, 0.18)',
                    background: category === cat.value ? 'rgba(0, 255, 136, 0.12)' : '#080d14',
                    color: category === cat.value ? '#00ff88' : '#cbd5e1',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <span>{cat.icon}</span>
                  <span style={{ fontWeight: category === cat.value ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cat.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              SHORT TITLE *
            </label>
            <input
              type="text"
              placeholder="e.g. Broken pavement near Neelam Cinema corridor"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
              required
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: '13px',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                background: '#080d14',
                color: '#f8fafc',
                borderRadius: '6px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              DESCRIPTION (OPTIONAL)
            </label>
            <textarea
              placeholder="Provide context (e.g. deep puddle after rain, blocks wheelchair passage)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: '12px',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                background: '#080d14',
                color: '#f8fafc',
                borderRadius: '6px',
                boxSizing: 'border-box',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                SEVERITY
              </label>
              <select
                value={severity}
                onChange={(e: any) => setSeverity(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 8px',
                  fontSize: '12px',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '6px',
                  background: '#080d14',
                  color: '#f8fafc'
                }}
              >
                <option value="low">Low (Minor inconvenience)</option>
                <option value="moderate">Moderate (Pedestrian caution)</option>
                <option value="high">High (Corridor blocked / Unsafe)</option>
                <option value="severe">Severe (Immediate danger / Hazard)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                LOCATION: {lat.toFixed(4)}, {lon.toFixed(4)}
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={handleGetGpsLocation}
                  disabled={isLocating}
                  style={{
                    flex: 1,
                    padding: '6px',
                    fontSize: '11px',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    background: isGps ? 'rgba(56, 189, 248, 0.15)' : '#080d14',
                    color: isGps ? '#38bdf8' : '#cbd5e1',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <Navigation style={{ width: '12px', height: '12px' }} />
                  {isLocating ? 'Locating...' : (isGps ? 'GPS Set' : 'Use GPS')}
                </button>

                {onSelectLocationOnMap && (
                  <button
                    type="button"
                    onClick={onSelectLocationOnMap}
                    style={{
                      flex: 1,
                      padding: '6px',
                      fontSize: '11px',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      background: '#080d14',
                      color: '#cbd5e1',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <MapPin style={{ width: '12px', height: '12px' }} />
                    Pick on Map
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Photo Attachment */}
          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
              ATTACH PHOTO (OPTIONAL, MAX 5 MB)
            </label>
            {!photoPreview ? (
              <label style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px',
                border: '1px dashed #cbd5e1',
                borderRadius: '6px',
                cursor: 'pointer',
                background: '#f8fafc',
                fontSize: '12px',
                color: '#64748b'
              }}>
                <Camera style={{ width: '16px', height: '16px' }} />
                <span>Upload JPEG, PNG or WebP</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoChange}
                  style={{ display: 'none' }}
                />
              </label>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px', background: '#f1f5f9', borderRadius: '6px' }}>
                <img
                  src={photoPreview}
                  alt="Attachment Preview"
                  style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px' }}
                />
                <div style={{ flex: 1, fontSize: '11px', color: '#334155' }}>
                  <div style={{ fontWeight: 600 }}>{photoFile?.name}</div>
                  <div style={{ color: '#64748b' }}>{(photoFile ? photoFile.size / 1024 : 0).toFixed(1)} KB</div>
                </div>
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc2626' }}
                >
                  <X style={{ width: '16px', height: '16px' }} />
                </button>
              </div>
            )}
          </div>

          {/* Alerts */}
          {submitError && (
            <div style={{ padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '11px', color: '#991b1b' }}>
              {submitError}
            </div>
          )}

          {submitSuccess && (
            <div style={{ padding: '8px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '11px', color: '#166534' }}>
              {submitSuccess}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 700,
              backgroundColor: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              marginTop: '4px'
            }}
          >
            <Send style={{ width: '14px', height: '14px' }} />
            {isSubmitting ? 'Submitting to Supabase...' : 'Submit Citizen Report'}
          </button>
        </form>
      )}

      {/* TAB 2: COMMUNITY FEED */}
      {activeTab === 'feed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Feed Filters */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <select
              value={feedStatusFilter}
              onChange={(e) => setFeedStatusFilter(e.target.value)}
              style={{ flex: 1, padding: '5px 8px', fontSize: '11px', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '6px', background: '#080d14', color: '#f8fafc' }}
            >
              <option value="all">All Statuses</option>
              <option value="verified">Verified Hazards</option>
              <option value="under_review">Under Review</option>
              <option value="submitted">Submitted</option>
              <option value="resolved">Resolved</option>
            </select>

            <select
              value={feedCategoryFilter}
              onChange={(e) => setFeedCategoryFilter(e.target.value)}
              style={{ flex: 1, padding: '5px 8px', fontSize: '11px', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '6px', background: '#080d14', color: '#f8fafc' }}
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={loadFeed}
              title="Refresh feed"
              style={{ padding: '6px 8px', background: '#111a26', border: '1px solid rgba(148, 163, 184, 0.2)', color: '#00ff88', borderRadius: '6px', cursor: 'pointer' }}
            >
              <RefreshCw style={{ width: '12px', height: '12px' }} />
            </button>
          </div>

          {isLoadingFeed ? (
            <div style={{ textAlign: 'center', padding: '20px', fontSize: '12px', color: '#94a3b8' }}>
              Loading community reports from Supabase...
            </div>
          ) : reports.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', background: '#091018', borderRadius: '8px', border: '1px dashed rgba(148, 163, 184, 0.2)' }}>
              <Info style={{ width: '20px', height: '20px', color: '#00ff88', margin: '0 auto 6px auto' }} />
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>No reports found</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                There are currently no community reports matching this filter.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
              {reports.map((r) => {
                const statusColor = r.status === 'verified' ? '#f87171' : (r.status === 'resolved' ? '#34d399' : '#fbbf24');
                const statusBg = r.status === 'verified' ? 'rgba(239, 68, 68, 0.15)' : (r.status === 'resolved' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)');
                return (
                  <div
                    key={r.id}
                    style={{
                      padding: '10px 12px',
                      background: '#0d1520',
                      border: '1px solid rgba(148, 163, 184, 0.18)',
                      borderRadius: '8px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: statusBg, color: statusColor, textTransform: 'uppercase' }}>
                        {r.status.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginBottom: '3px' }}>
                      {r.title}
                    </div>

                    {r.description && (
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px', lineHeight: '1.4' }}>
                        {r.description}
                      </div>
                    )}

                    {r.photo_url && (
                      <div style={{ marginBottom: '6px' }}>
                        <a href={r.photo_url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={r.photo_url}
                            alt="Attachment"
                            style={{ width: '100%', maxHeight: '120px', objectFit: 'cover', borderRadius: '4px', border: '1px solid rgba(148, 163, 184, 0.2)' }}
                          />
                        </a>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: '#94a3b8', borderTop: '1px solid rgba(148, 163, 184, 0.12)', paddingTop: '6px' }}>
                      <span>Category: {r.category_display}</span>
                      {onFocusHazardOnMap && (
                        <button
                          type="button"
                          onClick={() => onFocusHazardOnMap(r.latitude, r.longitude)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#00ff88',
                            cursor: 'pointer',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px'
                          }}
                        >
                          <MapPin style={{ width: '10px', height: '10px' }} />
                          View on Map
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: STAFF MODERATION */}
      {activeTab === 'moderator' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ padding: '8px 10px', background: 'rgba(56, 189, 248, 0.12)', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.3)', fontSize: '11px', color: '#bae6fd' }}>
            <ShieldCheck style={{ width: '14px', height: '14px', display: 'inline', marginRight: '4px', color: '#38bdf8' }} />
            Staff credentials are required to change report statuses. Unverified reports are not surfaced as official hazard alerts.
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              MODERATOR TOKEN (X-MODERATOR-TOKEN)
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type={showToken ? 'text' : 'password'}
                placeholder="Enter server moderator secret"
                value={moderatorToken}
                onChange={(e) => setModeratorToken(e.target.value)}
                style={{ flex: 1, padding: '7px 9px', fontSize: '12px', border: '1px solid rgba(148, 163, 184, 0.2)', background: '#080d14', color: '#f8fafc', borderRadius: '6px' }}
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                style={{ padding: '6px 10px', background: '#111a26', border: '1px solid rgba(148, 163, 184, 0.2)', color: '#cbd5e1', borderRadius: '6px', cursor: 'pointer' }}
              >
                {showToken ? <EyeOff style={{ width: '14px', height: '14px' }} /> : <Eye style={{ width: '14px', height: '14px' }} />}
              </button>
            </div>
          </div>

          {modError && (
            <div style={{ padding: '6px 8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '6px', fontSize: '11px', color: '#fca5a5' }}>
              {modError}
            </div>
          )}

          {modSuccess && (
            <div style={{ padding: '6px 8px', background: 'rgba(0, 255, 136, 0.12)', border: '1px solid rgba(0, 255, 136, 0.35)', borderRadius: '6px', fontSize: '11px', color: '#86efac' }}>
              {modSuccess}
            </div>
          )}

          <div style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc', marginTop: '4px' }}>
            REPORTS REQUIRING REVIEW ({reports.length})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflowY: 'auto' }}>
            {reports.map((r) => (
              <div
                key={r.id}
                style={{
                  padding: '8px 10px',
                  background: '#0d1520',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  borderRadius: '6px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>{r.title}</span>
                  <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: '#f1f5f9', color: '#475569' }}>
                    {r.status}
                  </span>
                </div>

                <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '6px' }}>
                  {r.category_display} · Lat {r.latitude}, Lon {r.longitude}
                </div>

                {moderatingId === r.id ? (
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input
                      type="text"
                      placeholder="Optional moderator notes / inspection details"
                      value={modNotes}
                      onChange={(e) => setModNotes(e.target.value)}
                      style={{ padding: '5px 8px', fontSize: '11px', border: '1px solid rgba(148, 163, 184, 0.2)', background: '#080d14', color: '#f8fafc', borderRadius: '4px' }}
                    />
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handleModerate(r.id, 'verified')}
                        style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 600, background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        ✓ Mark Verified Hazard
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModerate(r.id, 'under_review')}
                        style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 600, background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        ⏳ Under Review
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModerate(r.id, 'resolved')}
                        style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 600, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        ✓ Mark Resolved
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModerate(r.id, 'rejected')}
                        style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 600, background: '#111a26', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        ✗ Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => setModeratingId(null)}
                        style={{ padding: '4px 8px', fontSize: '10px', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setModeratingId(r.id); setModNotes(''); }}
                    style={{ padding: '4px 8px', fontSize: '10px', background: 'rgba(0, 255, 136, 0.12)', color: '#00ff88', border: '1px solid rgba(0, 255, 136, 0.3)', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Change Status
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
