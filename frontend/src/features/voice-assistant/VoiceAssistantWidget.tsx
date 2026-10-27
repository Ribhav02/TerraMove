import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  Square,
  Sparkles,
  HelpCircle,
  X
} from 'lucide-react';

import type { AssistantState, AssistantMessage } from './types';
import { useSpeechRecognition } from './useSpeechRecognition';
import { useSpeechSynthesis } from './useSpeechSynthesis';
import { parseVoiceCommand } from './commandParser';
import type { RouteAlternative, ParkingItem, WeatherData } from '../../types';

import './voiceAssistant.css';

interface VoiceAssistantWidgetProps {
  routes: RouteAlternative[];
  selectedRouteIndex: number;
  onSelectRouteIndex: (idx: number) => void;
  weather: WeatherData | null;
  parkingLots: ParkingItem[];
  destLat: number;
  destLon: number;
  onSetDestination: (lat: number, lon: number) => void;
  onSwitchTab: (tab: 'routes' | 'parking') => void;
  onTriggerCompare: () => Promise<void>;
  isLoadingRoutes: boolean;
}

export const VoiceAssistantWidget: React.FC<VoiceAssistantWidgetProps> = ({
  routes,
  onSelectRouteIndex,
  weather,
  parkingLots,
  onSetDestination,
  onSwitchTab,
  onTriggerCompare,
  isLoadingRoutes
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [state, setState] = useState<AssistantState>('idle');
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am your TerraMove Voice Assistant for Sector 17, Chandigarh. You can ask me for the fastest or shadiest route, live weather & heat index, or nearby parking.',
      timestamp: new Date()
    }
  ]);
  const [textInput, setTextInput] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { speak, cancel: cancelSpeech, isSpeaking, isMuted, toggleMute, isSupported: isTtsSupported } =
    useSpeechSynthesis();

  // Scroll to bottom of message list
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Synchronize assistant state with listening / speaking
  const {
    isSupported: isSttSupported,
    isListening,
    transcript,
    error: sttError,
    startListening,
    stopListening
  } = useSpeechRecognition((recognizedText) => {
    handleProcessCommand(recognizedText);
  });

  useEffect(() => {
    if (sttError) {
      setState('error');
    } else if (isListening) {
      setState('listening');
    } else if (isSpeaking) {
      setState('speaking');
    } else if (state !== 'processing') {
      setState('idle');
    }
  }, [isListening, isSpeaking, sttError]);

  const handleToggleOpen = () => {
    if (!isOpen) {
      setIsOpen(true);
      // Auto start listening if supported
      if (isSttSupported) {
        startListening();
      }
    } else {
      if (isListening) stopListening();
      if (isSpeaking) cancelSpeech();
      setIsOpen(false);
    }
  };

  const handleMicClick = () => {
    if (!isOpen) {
      setIsOpen(true);
    }
    if (isListening) {
      stopListening();
    } else {
      if (isSpeaking) cancelSpeech();
      startListening();
    }
  };

  const handleStopSpeaking = () => {
    cancelSpeech();
    setState('idle');
  };

  const addMessage = (sender: 'user' | 'assistant', text: string, actionSummary?: string) => {
    const newMsg: AssistantMessage = {
      id: `${Date.now()}-${Math.random()}`,
      sender,
      text,
      timestamp: new Date(),
      actionSummary
    };
    setMessages((prev) => [...prev, newMsg]);
    return newMsg;
  };

  const handleProcessCommand = async (commandText: string) => {
    if (!commandText.trim()) return;

    stopListening();
    setState('processing');
    addMessage('user', commandText);

    const intent = parseVoiceCommand(commandText);

    switch (intent.type) {
      case 'STOP_SPEAKING': {
        cancelSpeech();
        setState('idle');
        const reply = 'Voice playback stopped.';
        addMessage('assistant', reply);
        break;
      }

      case 'ROUTE_FASTEST': {
        onSwitchTab('routes');
        const fastestIdx = routes.findIndex((r) => r.preference.toLowerCase() === 'fastest');
        const targetRoute = fastestIdx >= 0 ? routes[fastestIdx] : routes[0];

        if (targetRoute) {
          if (fastestIdx >= 0) onSelectRouteIndex(fastestIdx);
          const reply = `Selected the fastest pedestrian route. Distance is ${targetRoute.distance_m} meters, taking approximately ${targetRoute.duration_minutes} minutes, with an estimated shade score of ${targetRoute.shade_score} out of 100.`;
          addMessage('assistant', reply, 'Selected Fastest Route');
          speak(reply);
        } else {
          const reply = 'No route has been calculated yet. Please specify an origin and destination to compare routes.';
          addMessage('assistant', reply);
          speak(reply);
        }
        break;
      }

      case 'ROUTE_SHADIEST': {
        onSwitchTab('routes');
        const shadiestIdx = routes.findIndex((r) => r.preference.toLowerCase() === 'shadiest');
        const targetRoute = shadiestIdx >= 0 ? routes[shadiestIdx] : routes[0];

        if (targetRoute) {
          if (shadiestIdx >= 0) onSelectRouteIndex(shadiestIdx);
          const reply = `Switched to the shadiest route for maximum solar protection. Distance is ${targetRoute.distance_m} meters, walking time is ${targetRoute.duration_minutes} minutes, with an estimated shade score of ${targetRoute.shade_score} out of 100. Thermal strain is estimated as ${targetRoute.heat_category}.`;
          addMessage('assistant', reply, 'Selected Shadiest Route');
          speak(reply);
        } else {
          const reply = 'No route found yet. Please set your destination in Sector 17 first.';
          addMessage('assistant', reply);
          speak(reply);
        }
        break;
      }

      case 'ROUTE_BALANCED': {
        onSwitchTab('routes');
        const balancedIdx = routes.findIndex((r) => r.preference.toLowerCase() === 'balanced');
        const targetRoute = balancedIdx >= 0 ? routes[balancedIdx] : routes[0];

        if (targetRoute) {
          if (balancedIdx >= 0) onSelectRouteIndex(balancedIdx);
          const reply = `Selected the balanced route. Distance is ${targetRoute.distance_m} meters, walking time is ${targetRoute.duration_minutes} minutes, and shade score is ${targetRoute.shade_score} out of 100.`;
          addMessage('assistant', reply, 'Selected Balanced Route');
          speak(reply);
        } else {
          const reply = 'Please calculate a route first.';
          addMessage('assistant', reply);
          speak(reply);
        }
        break;
      }

      case 'CHECK_WEATHER': {
        if (weather) {
          const hiStr =
            weather.noaa_heat_index_c !== null && weather.noaa_heat_index_c !== undefined
              ? `The calculated NOAA heat index is ${weather.noaa_heat_index_c}°C.`
              : `Apparent temperature is ${weather.apparent_temperature_c}°C.`;

          const reply = `Current microclimate in Sector 17: Air temperature is ${weather.temperature_c}°C with ${weather.humidity_percent}% relative humidity. ${hiStr} UV Index is ${weather.uv_index || 'moderate'}, and wind speed is ${weather.wind_speed_kmh || 0} km/h. Data source: ${weather.source}.`;
          addMessage('assistant', reply, 'Live Weather Retrieved');
          speak(reply);
        } else {
          const reply = 'Weather data is currently loading from Open-Meteo. Please try again in a moment.';
          addMessage('assistant', reply);
          speak(reply);
        }
        break;
      }

      case 'FIND_PARKING': {
        onSwitchTab('parking');
        if (parkingLots && parkingLots.length > 0) {
          const nearest = parkingLots[0];
          const second = parkingLots.length > 1 ? parkingLots[1] : null;

          let reply = `Found ${parkingLots.length} validated parking locations in Sector 17. The closest is ${nearest.name}, approximately ${nearest.distance_to_dest_m} meters from your destination (${nearest.walking_time_to_dest_min} minutes walk), with ${nearest.capacity_four_wheeler ?? 'recorded'} 4-wheeler spaces.`;
          if (second) {
            reply += ` Another nearby option is ${second.name} at ${second.distance_to_dest_m} meters. Note: live occupancy is unknown because street IoT sensors are not connected.`;
          }
          addMessage('assistant', reply, 'Opened Nearby Parking');
          speak(reply);
        } else {
          const reply = 'No parking records currently loaded for this destination.';
          addMessage('assistant', reply);
          speak(reply);
        }
        break;
      }

      case 'EXPLAIN_HEAT': {
        onSwitchTab('routes');
        const fastestRoute = routes.find((r) => r.preference.toLowerCase() === 'fastest') || routes[0];
        const shadiestRoute = routes.find((r) => r.preference.toLowerCase() === 'shadiest') || routes[routes.length - 1];

        if (fastestRoute && shadiestRoute) {
          const shadeDiff = shadiestRoute.shade_score - fastestRoute.shade_score;
          const timeDiff = Math.abs(shadiestRoute.duration_minutes - fastestRoute.duration_minutes);

          let comparisonText = '';
          if (shadeDiff > 5) {
            comparisonText = `The shadiest route provides ${shadiestRoute.shade_score}% shade compared to ${fastestRoute.shade_score}% on the fastest corridor, offering meaningful protection against direct solar radiation for only ${timeDiff.toFixed(1)} extra minutes of walking.`;
          } else {
            comparisonText = `Both routes have similar shade exposure (around ${shadiestRoute.shade_score}%) due to the linear pedestrian corridor structure in this section of Sector 17.`;
          }

          const reply = `Heat exposure assessment: ${comparisonText} Estimated thermal risk is currently categorized as ${shadiestRoute.heat_category}. Advice: ${shadiestRoute.advisory}`;
          addMessage('assistant', reply, 'Heat Exposure Advice');
          speak(reply);
        } else {
          const reply = 'Please calculate route alternatives first so I can analyze thermal exposure differences for you.';
          addMessage('assistant', reply);
          speak(reply);
        }
        break;
      }

      case 'SET_DESTINATION': {
        if (intent.targetLocation) {
          onSetDestination(intent.targetLocation.lat, intent.targetLocation.lon);
          const reply = `Setting destination to ${intent.targetLocation.name}. Calculating pedestrian paths now...`;
          addMessage('assistant', reply, `Set Destination: ${intent.targetLocation.name}`);
          speak(reply);
          await onTriggerCompare();
        }
        break;
      }

      case 'CLARIFY': {
        const reply =
          intent.clarificationMessage ||
          'Which landmark in Sector 17 would you like to visit? You can choose Central Plaza, Bank Square, Neelam Cinema, or ISBT Bus Terminal.';
        addMessage('assistant', reply, 'Clarification Needed');
        speak(reply);
        break;
      }

      case 'COMPARE_ROUTES': {
        onSwitchTab('routes');
        const reply = 'Re-evaluating fastest and shadiest pedestrian routes for your current start and destination points...';
        addMessage('assistant', reply);
        speak(reply);
        await onTriggerCompare();
        break;
      }

      case 'UNKNOWN':
      default: {
        const reply = `I heard "${commandText}". You can ask me to: "Show fastest route", "Show shadiest route", "What is the temperature and heat index?", "Find nearby parking", or "Explain which route is best for reducing heat exposure".`;
        addMessage('assistant', reply);
        speak(reply);
        break;
      }
    }

    setState('idle');
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    const text = textInput.trim();
    setTextInput('');
    handleProcessCommand(text);
  };

  const quickPrompts = [
    { label: '🏃 Fastest route', cmd: 'Find the fastest route' },
    { label: '🌳 Shadiest route', cmd: 'Show me the shadiest route' },
    { label: '☀️ Heat index & weather', cmd: "What's the current temperature and heat index?" },
    { label: '🛡️ Best route for heat', cmd: 'Explain which route is best for reducing heat exposure' },
    { label: '🚗 Nearby parking', cmd: 'Compare nearby parking' },
    { label: '📍 Go to Bank Square', cmd: 'Navigate to Bank Square' }
  ];

  return (
    <>
      {/* Floating Action Button */}
      <div className="voice-fab-container">
        <button
          type="button"
          className={`voice-fab ${isListening ? 'fab-listening' : ''} ${isSpeaking ? 'fab-speaking' : ''}`}
          onClick={handleToggleOpen}
          title={isListening ? 'Listening...' : 'Open Voice Assistant Guide'}
          aria-label="TerraMove Voice Assistant"
        >
          {isListening ? (
            <div className="pulse-mic">
              <Mic className="fab-icon text-pulsing" />
            </div>
          ) : isSpeaking ? (
            <Volume2 className="fab-icon" />
          ) : (
            <Mic className="fab-icon" />
          )}
          <span className="fab-label">Voice Guide</span>
        </button>
      </div>

      {/* Voice Assistant Popover Modal */}
      {isOpen && (
        <div className="voice-modal-backdrop" onClick={() => setIsOpen(false)}>
          <div className="voice-widget-card" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="voice-widget-header">
              <div className="widget-title-area">
                <div className="assistant-avatar">
                  <Sparkles className="avatar-icon" />
                </div>
                <div>
                  <h4>TerraMove Voice Guide</h4>
                  <div className="state-indicator-row">
                    <span className={`state-badge-pill state-${state}`}>
                      {state === 'listening' && 'Listening...'}
                      {state === 'processing' && 'Processing...'}
                      {state === 'speaking' && 'Speaking...'}
                      {state === 'error' && 'Error'}
                      {state === 'idle' && 'Ready'}
                    </span>
                    <span className="state-location">Pilot: Sector 17</span>
                  </div>
                </div>
              </div>

              <div className="widget-header-controls">
                {isSpeaking && (
                  <button
                    type="button"
                    className="btn-header-action text-red"
                    onClick={handleStopSpeaking}
                    title="Stop speaking"
                  >
                    <Square className="icon-header" />
                  </button>
                )}
                {isTtsSupported && (
                  <button
                    type="button"
                    className="btn-header-action"
                    onClick={toggleMute}
                    title={isMuted ? 'Unmute assistant voice' : 'Mute assistant voice'}
                  >
                    {isMuted ? <VolumeX className="icon-header text-muted" /> : <Volume2 className="icon-header" />}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-header-action"
                  onClick={() => setIsOpen(false)}
                  title="Close assistant"
                >
                  <X className="icon-header" />
                </button>
              </div>
            </div>

            {/* Browser Support / Error Banner */}
            {!isSttSupported && (
              <div className="voice-warning-banner">
                <HelpCircle className="banner-icon" />
                <span>
                  Speech recognition is not supported in this browser. You can type commands in the text box below.
                </span>
              </div>
            )}
            {sttError && (
              <div className="voice-error-banner">
                <span>{sttError}</span>
              </div>
            )}

            {/* Conversation Messages */}
            <div className="voice-messages-area">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`voice-message ${m.sender === 'user' ? 'msg-user' : 'msg-assistant'}`}
                >
                  {m.actionSummary && (
                    <span className="msg-action-tag">{m.actionSummary}</span>
                  )}
                  <p className="msg-text">{m.text}</p>
                  <span className="msg-time">
                    {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
              {isListening && (
                <div className="voice-message msg-user msg-listening-preview">
                  <span className="listening-dots">
                    Listening: {transcript || 'Speak now into microphone...'}
                  </span>
                </div>
              )}
              {isSpeaking && (
                <div className="speaking-wave-bar">
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <span>Assistant reading aloud...</span>
                  <button type="button" className="btn-stop-mini" onClick={handleStopSpeaking}>
                    Stop
                  </button>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggested Prompts */}
            <div className="voice-chips-scroll">
              {quickPrompts.map((qp) => (
                <button
                  key={qp.label}
                  type="button"
                  className="quick-chip"
                  onClick={() => handleProcessCommand(qp.cmd)}
                >
                  {qp.label}
                </button>
              ))}
            </div>

            {/* Interactive Mic Bar & Text Fallback */}
            <div className="voice-footer">
              <form onSubmit={handleTextSubmit} className="text-command-form">
                <input
                  type="text"
                  placeholder="Type or speak a command (e.g. 'Show shadiest route')..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  className="text-command-input"
                />
                <button
                  type="submit"
                  className="btn-text-send"
                  disabled={!textInput.trim() || isLoadingRoutes}
                  title="Send text command"
                >
                  <Send className="send-icon" />
                </button>
              </form>

              <div className="mic-action-row">
                <button
                  type="button"
                  className={`btn-mic-trigger ${isListening ? 'mic-active' : ''}`}
                  onClick={handleMicClick}
                  disabled={!isSttSupported}
                  title={isListening ? 'Click to stop listening' : 'Click to speak command'}
                >
                  {isListening ? (
                    <>
                      <MicOff className="mic-icon" />
                      <span>Stop Listening</span>
                    </>
                  ) : (
                    <>
                      <Mic className="mic-icon" />
                      <span>{isSttSupported ? 'Press to Speak' : 'Mic Unavailable'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
