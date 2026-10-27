import React, { useState, useEffect } from 'react';
import {
  Car,
  Bike,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Navigation2,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  X,
  ShieldAlert,
  Sliders
} from 'lucide-react';
import type { ParkingItem, ReservationItem, ParkingAlternativeItem } from '../../types';
import {
  createReservation,
  cancelReservation,
  fetchUserReservations,
  updateOperatorOccupancy
} from '../../services/parkingApi';

interface ParkingListProps {
  parkingLots: ParkingItem[];
  selectedParkingId: string | null;
  destLat?: number;
  destLon?: number;
  onSelectParking: (item: ParkingItem) => void;
  onToggleSimulate?: (simulate: boolean) => void;
  isSimulatedActive?: boolean;
  onNavigateFromParking?: (parking: ParkingItem) => void;
  onRefreshParking?: () => void;
}

function getSessionId(): string {
  let sid = localStorage.getItem('tm_user_session_id');
  if (!sid) {
    sid = 'sess_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('tm_user_session_id', sid);
  }
  return sid;
}

export const ParkingList: React.FC<ParkingListProps> = ({
  parkingLots,
  selectedParkingId,
  destLat: _destLat,
  destLon: _destLon,
  onSelectParking,
  onToggleSimulate,
  isSimulatedActive = false,
  onNavigateFromParking,
  onRefreshParking
}) => {
  const sessionId = getSessionId();

  // Subtabs: 'discovery' | 'my-bookings' | 'operator-mode'
  const [activeSubTab, setActiveSubTab] = useState<'discovery' | 'my-bookings' | 'operator-mode'>('discovery');

  // Reservation Form State
  const [reservingLot, setReservingLot] = useState<ParkingItem | null>(null);
  const [durationMins, setDurationMins] = useState<number>(60);
  const [vehiclePlate, setVehiclePlate] = useState<string>('');
  const [userContact, setUserContact] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [conflictAlternatives, setConflictAlternatives] = useState<ParkingAlternativeItem[]>([]);
  const [bookingSuccess, setBookingSuccess] = useState<ReservationItem | null>(null);

  // My Bookings State
  const [myBookings, setMyBookings] = useState<ReservationItem[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState<boolean>(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);

  // Operator Mode State
  const [operatorToken, setOperatorToken] = useState<string>('');
  const [opTargetLotId, setOpTargetLotId] = useState<string>(parkingLots[0]?.id || '');
  const [opStatus, setOpStatus] = useState<string>('available');
  const [opOccupiedCount, setOpOccupiedCount] = useState<number>(0);
  const [opNotes, setOpNotes] = useState<string>('Morning occupancy physical audit');
  const [opFeedback, setOpFeedback] = useState<string | null>(null);
  const [isOpSubmitting, setIsOpSubmitting] = useState<boolean>(false);

  // Load user reservations
  const loadBookings = async () => {
    setIsLoadingBookings(true);
    try {
      const res = await fetchUserReservations(sessionId);
      setMyBookings(res.reservations || []);
    } catch (e: any) {
      console.warn('Failed to load user reservations:', e);
    } finally {
      setIsLoadingBookings(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'my-bookings') {
      loadBookings();
    }
  }, [activeSubTab]);

  // Open reservation modal
  const handleOpenReserve = (lot: ParkingItem) => {
    setReservingLot(lot);
    setBookingError(null);
    setConflictAlternatives([]);
    setBookingSuccess(null);
  };

  // Submit Reservation
  const handleConfirmReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reservingLot) return;

    setIsSubmitting(true);
    setBookingError(null);
    setConflictAlternatives([]);

    try {
      // Current time in UTC ISO format
      const startTimeIso = new Date().toISOString();
      const booking = await createReservation({
        facility_id: reservingLot.id,
        start_time: startTimeIso,
        duration_minutes: durationMins,
        user_session_id: sessionId,
        vehicle_plate: vehiclePlate.trim() || undefined,
        user_contact: userContact.trim() || undefined
      });

      setBookingSuccess(booking);
      if (onRefreshParking) onRefreshParking();
    } catch (err: any) {
      // Check if conflict with alternatives was returned
      try {
        const errorBody = JSON.parse(err.message || '{}');
        if (errorBody.conflict_reason) {
          setBookingError(errorBody.detail || 'Reservation conflict detected.');
          setConflictAlternatives(errorBody.alternatives || []);
          return;
        }
      } catch {
        // Not a JSON error string
      }
      setBookingError(err.message || 'Failed to complete reservation. Resource may be unavailable.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Switch to book an alternative
  const handleBookAlternative = (alt: ParkingAlternativeItem) => {
    const foundLot = parkingLots.find((p) => p.id === alt.id);
    if (foundLot) {
      setReservingLot(foundLot);
      setBookingError(null);
      setConflictAlternatives([]);
    }
  };

  // Cancel Booking
  const handleCancelBooking = async (bookingId: string) => {
    try {
      const res = await cancelReservation(bookingId, sessionId);
      setCancelMessage(res.message);
      await loadBookings();
      if (onRefreshParking) onRefreshParking();
    } catch (err: any) {
      setCancelMessage(`Cancellation failed: ${err.message}`);
    }
  };

  // Operator Update
  const handleOperatorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsOpSubmitting(true);
    setOpFeedback(null);
    try {
      const res = await updateOperatorOccupancy(
        opTargetLotId || parkingLots[0]?.id,
        opStatus,
        operatorToken,
        opOccupiedCount,
        undefined,
        opNotes,
        'authorized_inspector'
      );
      setOpFeedback(`Success: ${res.facility_name} marked as '${res.physical_status}'.`);
      if (onRefreshParking) onRefreshParking();
    } catch (err: any) {
      setOpFeedback(`Operator update error: ${err.message}`);
    } finally {
      setIsOpSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'available':
        return { label: 'Verified Free', className: 'status-available', color: '#10b981' };
      case 'reserved':
        return { label: 'Active Reservation', className: 'status-reserved', color: '#6366f1' };
      case 'occupied':
        return { label: 'Physically Occupied', className: 'status-occupied', color: '#ef4444' };
      case 'maintenance':
        return { label: 'Under Maintenance', className: 'status-maintenance', color: '#f59e0b' };
      case 'stale':
        return { label: 'Stale Reading', className: 'status-stale', color: '#d97706' };
      case 'simulated':
        return { label: 'Simulated Stream', className: 'status-sim', color: '#0284c7' };
      case 'unknown':
      default:
        return { label: 'Occupancy Unmonitored', className: 'status-unknown', color: '#94a3b8' };
    }
  };

  return (
    <div className="parking-container">
      {/* Subtab Switcher */}
      <div className="parking-subtab-bar">
        <button
          type="button"
          className={`parking-subtab-btn ${activeSubTab === 'discovery' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('discovery')}
        >
          <Car className="subtab-icon" />
          <span>Parking Lots ({parkingLots.length})</span>
        </button>

        <button
          type="button"
          className={`parking-subtab-btn ${activeSubTab === 'my-bookings' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('my-bookings')}
        >
          <Calendar className="subtab-icon" />
          <span>My Bookings</span>
        </button>

        <button
          type="button"
          className={`parking-subtab-btn ${activeSubTab === 'operator-mode' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('operator-mode')}
          title="Field staff physical occupancy update panel"
        >
          <ShieldAlert className="subtab-icon" />
          <span>Operator Mode</span>
        </button>
      </div>

      {/* DISCOVERY VIEW */}
      {activeSubTab === 'discovery' && (
        <>
          <div className="parking-header">
            <div className="parking-title-group">
              <Car className="parking-main-icon" />
              <div>
                <h3>Sector 17 Smart Parking</h3>
                <span className="parking-subtitle">{parkingLots.length} facilities · Ranked by walking distance</span>
              </div>
            </div>

            {onToggleSimulate && (
              <div className="simulation-toggle-row">
                <label className="sim-toggle-label">
                  <span>Demo Stream:</span>
                  <button
                    type="button"
                    className="btn-toggle-sim"
                    onClick={() => onToggleSimulate(!isSimulatedActive)}
                    title="Toggles simulated live occupancy feed"
                  >
                    {isSimulatedActive ? (
                      <ToggleRight className="toggle-icon toggle-active" />
                    ) : (
                      <ToggleLeft className="toggle-icon" />
                    )}
                    <span className={isSimulatedActive ? 'text-sim-active' : ''}>
                      {isSimulatedActive ? 'Simulated' : 'Real-world'}
                    </span>
                  </button>
                </label>
              </div>
            )}
          </div>

          <div className="parking-disclaimer-box">
            <AlertCircle className="disclaimer-icon" />
            <span>
              <strong>Availability Policy:</strong> Spaces are <em>Verified Free</em> only when an authorized operator confirms open capacity with no overlapping reservations. Unmonitored lots are marked <em>Occupancy Unmonitored</em>.
            </span>
          </div>

          <div className="parking-items-list">
            {parkingLots.map((p) => {
              const isSelected = selectedParkingId === p.id;
              const statusInfo = getStatusBadge(p.availability_status);
              const isReservable = p.availability_status !== 'occupied' && p.availability_status !== 'maintenance';

              return (
                <div
                  key={p.id}
                  className={`parking-card ${isSelected ? 'parking-card-selected' : ''}`}
                  onClick={() => onSelectParking(p)}
                >
                  <div className="parking-card-top">
                    <div>
                      <h4 className="parking-name">{p.name}</h4>
                      <p className="parking-address">{p.address || 'Sector 17, Chandigarh'}</p>
                    </div>
                    <div className="parking-dist-badge">
                      <Navigation2 className="nav-arrow" />
                      <span>
                        {p.distance_to_dest_m}m {p.distance_type === 'pedestrian_network' ? '(network)' : '(direct)'} (~{p.walking_time_to_dest_min}m)
                      </span>
                    </div>
                  </div>

                  <div className="parking-capacities-row">
                    <div className="cap-pill">
                      <Car className="cap-icon" />
                      <span>4W: {p.capacity_four_wheeler !== null ? p.capacity_four_wheeler : 'N/A'}</span>
                    </div>

                    <div className="cap-pill">
                      <Bike className="cap-icon" />
                      <span>2W: {p.capacity_two_wheeler !== null ? p.capacity_two_wheeler : 'N/A'}</span>
                    </div>

                    <div className="cap-pill cap-total">
                      <span>Total Cap: {p.total_recorded_capacity || '--'}</span>
                    </div>

                    <div className={`status-pill-small ${statusInfo.className}`}>
                      <span className="status-dot-small" style={{ backgroundColor: statusInfo.color }} />
                      <span>{statusInfo.label}</span>
                    </div>
                  </div>

                  {p.data_freshness && (
                    <div className="parking-freshness-meta">
                      <Clock className="freshness-icon" />
                      <span>{p.data_freshness}</span>
                    </div>
                  )}

                  {/* Action Buttons: Walk to Destination & Reserve */}
                  <div className="parking-actions-row" onClick={(e) => e.stopPropagation()}>
                    {onNavigateFromParking && (
                      <button
                        type="button"
                        className="btn-walk-from-parking"
                        onClick={() => onNavigateFromParking(p)}
                        title="Calculate walking path from this parking to destination"
                      >
                        <Navigation2 className="action-btn-icon" />
                        <span>Walk to Destination</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn-reserve-parking"
                      onClick={() => handleOpenReserve(p)}
                      disabled={!isReservable}
                      title={isReservable ? 'Reserve parking space' : 'Resource unavailable for booking'}
                    >
                      <Calendar className="action-btn-icon" />
                      <span>Reserve Space</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* MY BOOKINGS VIEW */}
      {activeSubTab === 'my-bookings' && (
        <div className="my-bookings-container">
          <div className="my-bookings-header">
            <h4>My Confirmed Parking Bookings</h4>
            <span className="session-tag">Guest Session: {sessionId}</span>
          </div>

          {cancelMessage && (
            <div className="cancel-notice">
              <CheckCircle2 className="notice-icon text-green" />
              <span>{cancelMessage}</span>
            </div>
          )}

          {isLoadingBookings && <div className="loading-bookings">Loading your reservations...</div>}

          {!isLoadingBookings && myBookings.length === 0 && (
            <div className="empty-bookings">
              <Calendar className="empty-icon" />
              <p>No parking reservations found for this session.</p>
              <button
                type="button"
                className="btn-go-discovery"
                onClick={() => setActiveSubTab('discovery')}
              >
                Browse & Reserve Sector 17 Parking
              </button>
            </div>
          )}

          <div className="bookings-list">
            {myBookings.map((b) => {
              const isCancelled = b.status === 'cancelled';
              const isExpired = b.status === 'expired';
              const startDate = new Date(b.start_time);
              const endDate = new Date(b.end_time);

              return (
                <div key={b.booking_id} className={`booking-card ${isCancelled ? 'booking-cancelled' : ''}`}>
                  <div className="booking-card-header">
                    <div>
                      <strong className="booking-facility-name">{b.facility_name}</strong>
                      <span className="booking-id-tag">ID: {b.booking_id}</span>
                    </div>
                    <span className={`booking-status-pill status-${b.status}`}>
                      {b.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="booking-time-grid">
                    <div className="time-item">
                      <span className="time-lbl">Arrival</span>
                      <strong>{startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                    </div>
                    <div className="time-item">
                      <span className="time-lbl">Departure</span>
                      <strong>{endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                    </div>
                    <div className="time-item">
                      <span className="time-lbl">Duration</span>
                      <strong>{b.duration_minutes} min</strong>
                    </div>
                  </div>

                  {b.vehicle_plate && (
                    <div className="booking-meta-row">
                      <span>Vehicle: <strong>{b.vehicle_plate}</strong></span>
                    </div>
                  )}

                  {!isCancelled && !isExpired && (
                    <div className="booking-card-actions">
                      <button
                        type="button"
                        className="btn-cancel-booking"
                        onClick={() => handleCancelBooking(b.booking_id)}
                      >
                        Cancel Reservation
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* OPERATOR MODE VIEW */}
      {activeSubTab === 'operator-mode' && (
        <div className="operator-panel">
          <div className="operator-header">
            <ShieldCheck className="op-icon" />
            <div>
              <h4>Ground Staff Physical Occupancy Override</h4>
              <p className="op-sub">Authorized field inspection & manual occupancy reporting</p>
            </div>
          </div>

          <form onSubmit={handleOperatorSubmit} className="operator-form">
            <div className="op-field">
              <label>Operator Security Token</label>
              <input
                type="password"
                value={operatorToken}
                onChange={(e) => setOperatorToken(e.target.value)}
                placeholder="Enter operator token"
                className="input-operator-text"
              />
            </div>

            <div className="op-field">
              <label>Target Parking Facility</label>
              <select
                value={opTargetLotId}
                onChange={(e) => setOpTargetLotId(e.target.value)}
                className="select-operator-facility"
              >
                {parkingLots.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id}) - Cap: {p.total_recorded_capacity || 'N/A'}
                  </option>
                ))}
              </select>
            </div>

            <div className="op-field">
              <label>Physical Ground Status</label>
              <select
                value={opStatus}
                onChange={(e) => setOpStatus(e.target.value)}
                className="select-operator-status"
              >
                <option value="available">Available (Confirmed Open Spaces)</option>
                <option value="occupied">Occupied (Full / No Spaces)</option>
                <option value="maintenance">Maintenance (Closed to Public)</option>
                <option value="unknown">Unknown (Uninspected)</option>
              </select>
            </div>

            <div className="op-field">
              <label>Observed Occupied Vehicles (Optional)</label>
              <input
                type="number"
                min="0"
                value={opOccupiedCount}
                onChange={(e) => setOpOccupiedCount(parseInt(e.target.value, 10) || 0)}
                className="input-operator-text"
              />
            </div>

            <div className="op-field">
              <label>Inspection Notes</label>
              <input
                type="text"
                value={opNotes}
                onChange={(e) => setOpNotes(e.target.value)}
                className="input-operator-text"
                placeholder="Observation details"
              />
            </div>

            <button
              type="submit"
              className="btn-submit-operator"
              disabled={isOpSubmitting}
            >
              {isOpSubmitting ? 'Recording Ground Status...' : 'Submit Physical Inspection Status'}
            </button>
          </form>

          {opFeedback && (
            <div className="operator-feedback-banner">
              <AlertCircle className="feedback-icon" />
              <span>{opFeedback}</span>
            </div>
          )}
        </div>
      )}

      {/* RESERVATION MODAL */}
      {reservingLot && (
        <div className="reservation-modal-backdrop" onClick={() => setReservingLot(null)}>
          <div className="reservation-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Reserve Parking Space</h3>
                <p className="modal-sub">{reservingLot.name} · {reservingLot.address}</p>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setReservingLot(null)}
              >
                <X className="close-icon" />
              </button>
            </div>

            {/* Success State */}
            {bookingSuccess ? (
              <div className="booking-success-view">
                <CheckCircle2 className="success-icon text-green" />
                <h4>Reservation Confirmed!</h4>
                <p className="success-booking-id">Booking ID: <strong>{bookingSuccess.booking_id}</strong></p>
                <div className="success-details-card">
                  <div><strong>Facility:</strong> {bookingSuccess.facility_name}</div>
                  <div><strong>Window:</strong> {new Date(bookingSuccess.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(bookingSuccess.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({bookingSuccess.duration_minutes} min)</div>
                  <div><strong>Vehicle:</strong> {bookingSuccess.vehicle_plate || 'Not specified'}</div>
                </div>
                <p className="disclaimer-note">{bookingSuccess.disclaimer}</p>
                <button
                  type="button"
                  className="btn-close-success"
                  onClick={() => {
                    setReservingLot(null);
                    setActiveSubTab('my-bookings');
                  }}
                >
                  View My Bookings
                </button>
              </div>
            ) : (
              <form onSubmit={handleConfirmReservation} className="reservation-form">
                {/* Conflict Notice & Alternatives */}
                {bookingError && (
                  <div className="booking-error-banner">
                    <XCircle className="error-icon" />
                    <div>
                      <strong>Booking Conflict</strong>
                      <p>{bookingError}</p>
                    </div>
                  </div>
                )}

                {conflictAlternatives.length > 0 && (
                  <div className="conflict-alternatives-card">
                    <div className="alt-title-row">
                      <Sliders className="alt-icon" />
                      <span>Recommended Nearest Available Alternatives:</span>
                    </div>
                    <div className="alt-list">
                      {conflictAlternatives.map((alt) => (
                        <div key={alt.id} className="alt-item">
                          <div>
                            <strong>{alt.name}</strong>
                            <div className="alt-meta">
                              {alt.distance_to_dest_m}m walk (~{alt.walking_time_to_dest_min} min) · {alt.availability_status}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-choose-alt"
                            onClick={() => handleBookAlternative(alt)}
                          >
                            Select
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="form-row">
                  <label>Duration</label>
                  <div className="duration-selector-row">
                    {[30, 60, 120, 240].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        className={`duration-chip ${durationMins === mins ? 'duration-chip-active' : ''}`}
                        onClick={() => setDurationMins(mins)}
                      >
                        {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-row">
                  <label>Vehicle License Plate (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. CH-01-AB-1234"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    className="input-modal-field"
                  />
                </div>

                <div className="form-row">
                  <label>Contact Phone / Notification (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. +91 98765 43210"
                    value={userContact}
                    onChange={(e) => setUserContact(e.target.value)}
                    className="input-modal-field"
                  />
                </div>

                <div className="reservation-disclaimer-note">
                  <AlertCircle className="note-icon" />
                  <span>
                    Enforces database-level exclusion constraint against overlapping intervals. Concurrency-safe: simultaneous conflicting attempts will be rejected.
                  </span>
                </div>

                <div className="modal-actions-row">
                  <button
                    type="button"
                    className="btn-cancel-modal"
                    onClick={() => setReservingLot(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-confirm-modal"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Securing Space...' : `Confirm Reservation (${durationMins}m)`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
