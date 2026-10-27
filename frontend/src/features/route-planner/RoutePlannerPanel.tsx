import React, { useState } from 'react';
import {
  MapPin,
  Navigation,
  Clock,
  Sparkles,
  Mic,
  MicOff,
  Search,
  X,
  Check,
  AlertCircle,
  Info,
  Accessibility
} from 'lucide-react';
import { useSpeechRecognition } from '../voice-assistant/useSpeechRecognition';
import { searchDestinations } from '../../services/destinationApi';
import type { DestinationItem } from '../../types';

interface RoutePlannerPanelProps {
  startLat: number;
  startLon: number;
  destLat: number;
  destLon: number;
  departureHour: number;
  accessibilityMode: boolean;
  isLoading: boolean;
  onStartChange: (lat: number, lon: number) => void;
  onDestChange: (lat: number, lon: number, name?: string) => void;
  onHourChange: (hour: number) => void;
  onToggleAccessibility: (enabled: boolean) => void;
  onCompare: () => void;
}

const SECTOR17_PRESETS = [
  { name: 'Sector 17 Central Plaza', lat: 30.7410, lon: 76.7820 },
  { name: 'Bank Square (SCO 1-20)', lat: 30.7415, lon: 76.7870 },
  { name: 'Neelam Cinema Corridor', lat: 30.7395, lon: 76.7810 },
  { name: 'ISBT Sector 17 Terminal', lat: 30.7350, lon: 76.7800 },
  { name: 'KC Theatre Commercial Block', lat: 30.7420, lon: 76.7845 },
  { name: 'Sector 17 North Gate / Garden', lat: 30.7455, lon: 76.7805 }
];

export const RoutePlannerPanel: React.FC<RoutePlannerPanelProps> = ({
  startLat,
  startLon,
  destLat,
  destLon,
  departureHour,
  accessibilityMode,
  isLoading,
  onStartChange,
  onDestChange,
  onHourChange,
  onToggleAccessibility,
  onCompare
}) => {
  // Voice & Destination Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchLang, setSearchLang] = useState<'en-IN' | 'hi-IN'>('en-IN');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [candidates, setCandidates] = useState<DestinationItem[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<DestinationItem | null>(null);
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const [isAmbiguousPrompt, setIsAmbiguousPrompt] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Execute landmark search
  const executeSearch = async (queryText: string, langCode: 'en-IN' | 'hi-IN') => {
    const q = queryText.trim();
    if (!q) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchFeedback(null);
    setIsAmbiguousPrompt(false);

    try {
      const apiLang = langCode === 'hi-IN' ? 'hi' : 'en';
      const result = await searchDestinations(q, apiLang);

      if (result.is_ambiguous || result.candidates.length > 1) {
        // Ambiguous match - user must explicitly select one candidate
        setCandidates(result.candidates);
        setIsAmbiguousPrompt(true);
        setSearchFeedback(result.note || `Found ${result.candidates.length} matching locations. Please select one:`);
      } else if (result.candidates.length === 1) {
        // Single unambiguous match
        const single = result.candidates[0];
        setCandidates([]);
        setIsAmbiguousPrompt(false);
        setSelectedCandidate(single);
        setSearchFeedback(`Selected: ${single.name} (${single.category})`);
        onDestChange(single.lat, single.lon, single.name);
      } else {
        // Zero matches
        setCandidates([]);
        setIsAmbiguousPrompt(false);
        setSearchError(`No verified Sector 17 landmarks found matching "${q}". Sector 17 destinations include Central Plaza, Neelam Cinema, KC Theatre, ISBT 17, Bank Square, etc.`);
      }
    } catch (err: any) {
      setSearchError(err.message || 'Failed to search destinations.');
    } finally {
      setIsSearching(false);
    }
  };

  // Web Speech Recognition
  const {
    isSupported: isSttSupported,
    isListening,
    transcript,
    error: sttError,
    startListening,
    stopListening
  } = useSpeechRecognition((recognizedText) => {
    setSearchQuery(recognizedText);
    executeSearch(recognizedText, searchLang);
  }, searchLang);

  const handleVoiceToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      setSearchError(null);
      startListening();
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      executeSearch(searchQuery, searchLang);
    }
  };

  const handleSelectCandidate = (candidate: DestinationItem) => {
    setSelectedCandidate(candidate);
    setCandidates([]);
    setIsAmbiguousPrompt(false);
    setSearchFeedback(`Selected: ${candidate.name} (${candidate.category})`);
    setSearchQuery(candidate.name);
    onDestChange(candidate.lat, candidate.lon, candidate.name);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setCandidates([]);
    setSelectedCandidate(null);
    setSearchFeedback(null);
    setIsAmbiguousPrompt(false);
    setSearchError(null);
  };

  const getSunDescription = (hour: number) => {
    if (hour >= 6 && hour < 10) return 'Morning gentle sun, long building shadows';
    if (hour >= 10 && hour < 13) return 'Midday rising heat, high sun angle';
    if (hour >= 13 && hour < 16) return 'Peak afternoon heat, short overhead shadows';
    if (hour >= 16 && hour < 19) return 'Late afternoon cooling, long shadows from West';
    return 'Twilight / Night, negligible solar heat strain';
  };

  return (
    <div className="planner-card">
      <div className="planner-header">
        <Navigation className="planner-icon" />
        <div>
          <h3>Pedestrian Route Planner</h3>
          <p className="planner-sub">Sector 17 Walkable Network & Solar Shade Optimizer</p>
        </div>
      </div>

      {/* Voice & Text Destination Search */}
      <div className="destination-search-container">
        <div className="dest-search-label-row">
          <label className="form-label">
            <Search className="label-icon text-blue" />
            <span>Voice / Text Destination Search</span>
          </label>
          <div className="lang-selector-group">
            <button
              type="button"
              className={`lang-pill ${searchLang === 'en-IN' ? 'lang-pill-active' : ''}`}
              onClick={() => setSearchLang('en-IN')}
              title="Search in English (India)"
            >
              EN
            </button>
            <button
              type="button"
              className={`lang-pill ${searchLang === 'hi-IN' ? 'lang-pill-active' : ''}`}
              onClick={() => setSearchLang('hi-IN')}
              title="Search in Hindi (हिंदी)"
            >
              हिन्दी
            </button>
          </div>
        </div>

        <form onSubmit={handleSearchSubmit} className="search-input-form">
          <div className="search-input-wrapper">
            <input
              type="text"
              placeholder={searchLang === 'hi-IN' ? 'मंजिल खोजें (जैसे नीलम सिनेमा, बैंक स्क्वायर)...' : 'Search destination (e.g. Neelam, Central Plaza)...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-dest-search"
            />
            {searchQuery && (
              <button
                type="button"
                className="btn-clear-search"
                onClick={handleClearSearch}
                title="Clear query"
              >
                <X className="clear-icon" />
              </button>
            )}
            <button
              type="button"
              className={`btn-voice-search ${isListening ? 'listening-pulse' : ''}`}
              onClick={handleVoiceToggle}
              title={isListening ? 'Stop listening' : `Voice search (${searchLang === 'hi-IN' ? 'Hindi' : 'English'})`}
            >
              {isListening ? <MicOff className="voice-icon-active" /> : <Mic className="voice-icon" />}
            </button>
            <button
              type="submit"
              className="btn-submit-search"
              disabled={isSearching || !searchQuery.trim()}
              title="Search destination"
            >
              <Search className="search-icon-submit" />
            </button>
          </div>
        </form>

        {/* Live Speech Recognition Banner */}
        {isListening && (
          <div className="speech-listening-banner">
            <span className="pulse-indicator" />
            <span>
              {searchLang === 'hi-IN' ? 'सुन रहा हूँ... बोलिए' : 'Listening... Speak destination'}:
              {transcript ? <strong className="speech-transcript"> "{transcript}"</strong> : ' (e.g. Neelam Cinema, Plaza)'}
            </span>
          </div>
        )}

        {/* Speech Error Banner */}
        {sttError && (
          <div className="speech-error-banner">
            <AlertCircle className="error-icon" />
            <span>{sttError}</span>
          </div>
        )}

        {/* Browser Support Warning */}
        {!isSttSupported && (
          <div className="speech-warning-banner">
            <Info className="warning-icon" />
            <span>Voice recognition not supported in this browser. Please use text search.</span>
          </div>
        )}

        {/* Selected Landmark Confirmation Banner */}
        {selectedCandidate && !isAmbiguousPrompt && (
          <div className="selected-landmark-banner">
            <Check className="check-icon" />
            <div className="selected-landmark-meta">
              <strong>{selectedCandidate.name}</strong>
              <span className="landmark-cat-badge">{selectedCandidate.category}</span>
            </div>
            <button
              type="button"
              className="btn-dismiss-selected"
              onClick={() => setSelectedCandidate(null)}
              title="Dismiss confirmation"
            >
              <X className="dismiss-icon" />
            </button>
          </div>
        )}

        {/* Ambiguous Candidates Selection Card */}
        {isAmbiguousPrompt && candidates.length > 0 && (
          <div className="ambiguous-candidates-card">
            <div className="ambiguous-header">
              <AlertCircle className="ambiguous-icon" />
              <div>
                <strong>Ambiguous Destination</strong>
                <p className="ambiguous-sub">
                  {searchFeedback || 'Multiple locations matched your query. Please select one to confirm coordinates:'}
                </p>
              </div>
            </div>
            <div className="candidate-list">
              {candidates.map((cand) => (
                <div key={cand.id} className="candidate-item">
                  <div className="candidate-info">
                    <div className="candidate-name-row">
                      <span className="cand-name">{cand.name}</span>
                      <span className="cand-category">{cand.category}</span>
                    </div>
                    <p className="cand-desc">{cand.description}</p>
                  </div>
                  <button
                    type="button"
                    className="btn-select-candidate"
                    onClick={() => handleSelectCandidate(cand)}
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search Error Notice */}
        {searchError && (
          <div className="search-error-notice">
            <AlertCircle className="notice-icon" />
            <span>{searchError}</span>
          </div>
        )}
      </div>

      {/* Origin Coordinates & Presets */}
      <div className="form-group">
        <label className="form-label">
          <MapPin className="label-icon text-green" />
          <span>Origin (Start Point)</span>
        </label>
        <div className="coord-row">
          <input
            type="number"
            step="0.0001"
            value={startLat}
            onChange={(e) => onStartChange(parseFloat(e.target.value) || startLat, startLon)}
            className="input-coord"
            title="Start Latitude"
          />
          <input
            type="number"
            step="0.0001"
            value={startLon}
            onChange={(e) => onStartChange(startLat, parseFloat(e.target.value) || startLon)}
            className="input-coord"
            title="Start Longitude"
          />
        </div>
        <div className="preset-chips">
          {SECTOR17_PRESETS.slice(0, 3).map((p) => (
            <button
              key={p.name}
              type="button"
              className="chip-btn"
              onClick={() => onStartChange(p.lat, p.lon)}
            >
              {p.name.split(' ')[0]} {p.name.split(' ')[1]}
            </button>
          ))}
        </div>
      </div>

      {/* Destination Coordinates & Presets */}
      <div className="form-group">
        <label className="form-label">
          <MapPin className="label-icon text-blue" />
          <span>Destination (End Point)</span>
        </label>
        <div className="coord-row">
          <input
            type="number"
            step="0.0001"
            value={destLat}
            onChange={(e) => onDestChange(parseFloat(e.target.value) || destLat, destLon)}
            className="input-coord"
            title="Destination Latitude"
          />
          <input
            type="number"
            step="0.0001"
            value={destLon}
            onChange={(e) => onDestChange(destLat, parseFloat(e.target.value) || destLon)}
            className="input-coord"
            title="Destination Longitude"
          />
        </div>
        <div className="preset-chips">
          {SECTOR17_PRESETS.slice(3).map((p) => (
            <button
              key={p.name}
              type="button"
              className="chip-btn"
              onClick={() => onDestChange(p.lat, p.lon)}
            >
              {p.name.split(' ')[0]} {p.name.split(' ')[1]}
            </button>
          ))}
        </div>
      </div>

      {/* Accessibility-Aware Routing Toggle */}
      <div className="form-group accessibility-group">
        <div className="accessibility-toggle-row">
          <label className="accessibility-label">
            <Accessibility className="acc-icon" />
            <div className="acc-text">
              <span className="acc-title">Accessibility Mode</span>
              <span className="acc-subtitle">Step-Free & Paved Corridor Focus</span>
            </div>
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={accessibilityMode}
              onChange={(e) => onToggleAccessibility(e.target.checked)}
            />
            <span className="slider round" />
          </label>
        </div>
        {accessibilityMode && (
          <div className="acc-disclaimer">
            <Info className="acc-disclaimer-icon" />
            <span>
              <strong>Accessibility Note:</strong> Prioritizes verified asphalt and paved plazas while avoiding stairs. Municipal survey tags for curb cuts and tactile paving are unmonitored; synthetic street crossings carry caution penalties.
            </span>
          </div>
        )}
      </div>

      {/* Departure Hour Slider */}
      <div className="form-group">
        <div className="slider-header">
          <label className="form-label">
            <Clock className="label-icon text-amber" />
            <span>Departure Time: <strong>{Math.floor(departureHour)}:00 IST</strong></span>
          </label>
        </div>
        <input
          type="range"
          min="6"
          max="22"
          step="1"
          value={departureHour}
          onChange={(e) => onHourChange(parseInt(e.target.value, 10))}
          className="time-slider"
        />
        <span className="sun-subtext">{getSunDescription(departureHour)}</span>
      </div>

      <button
        type="button"
        className="btn-primary-compare"
        onClick={onCompare}
        disabled={isLoading}
      >
        <Sparkles className="btn-icon" />
        <span>{isLoading ? 'Optimizing Routes...' : 'Compare Pedestrian Routes'}</span>
      </button>
    </div>
  );
};
