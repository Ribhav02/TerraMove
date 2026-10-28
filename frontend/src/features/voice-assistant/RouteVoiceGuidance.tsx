import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Play,
  Square,
  SkipForward,
  SkipBack,
  RotateCcw,
  Compass,
  AlertTriangle,
  Info
} from 'lucide-react';
import { useSpeechSynthesis } from './useSpeechSynthesis';
import type { RouteAlternative, RouteStep } from '../../types';

interface RouteVoiceGuidanceProps {
  route: RouteAlternative;
  destinationName?: string;
}

export const RouteVoiceGuidance: React.FC<RouteVoiceGuidanceProps> = ({
  route,
  destinationName
}) => {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const announcedStepsRef = useRef<Set<number>>(new Set());

  const { speak, cancel, isSpeaking, isMuted, toggleMute, isSupported } = useSpeechSynthesis();

  const steps: RouteStep[] = route.steps || [];
  const currentStep = steps[currentStepIndex];
  const totalSteps = steps.length;
  const progressPercent = totalSteps > 0 ? Math.round(((currentStepIndex + 1) / totalSteps) * 100) : 0;

  // Speak instruction for the current step
  const speakCurrentInstruction = (stepIdx: number) => {
    if (!isSupported || isMuted || stepIdx >= steps.length) return;

    const step = steps[stepIdx];
    let textToSpeak = step.instruction;

    // Enhance arrival step with destination name if available
    if (stepIdx === steps.length - 1) {
      if (destinationName) {
        textToSpeak = `You have arrived at your destination: ${destinationName}.`;
      } else {
        textToSpeak = `You have arrived at your destination. ${step.instruction}`;
      }
    } else {
      // Add distance context
      textToSpeak = `${step.instruction}. In approximately ${Math.round(step.distance_m)} meters, walk time is ${Math.round(step.duration_sec)} seconds.`;
    }

    // Mention nearby hazard alert if on this route
    if (stepIdx === 0 && route.hazard_warnings && route.hazard_warnings.length > 0) {
      textToSpeak = `Caution. ${route.hazard_warnings.length} community hazard reported near this path. ${textToSpeak}`;
    }

    speak(textToSpeak);
    announcedStepsRef.current.add(stepIdx);
  };

  // When guidance starts, announce the first turn
  const handleStartGuidance = () => {
    setIsActive(true);
    setCurrentStepIndex(0);
    announcedStepsRef.current.clear();
    const destText = destinationName ? ` towards ${destinationName}` : '';
    const initialAnnouncement = `Starting walking guidance for ${route.preference} route${destText}. ${steps[0]?.instruction || ''}`;
    speak(initialAnnouncement, () => {
      announcedStepsRef.current.add(0);
    });
  };

  const handleStopGuidance = () => {
    cancel();
    setIsActive(false);
    setCurrentStepIndex(0);
    announcedStepsRef.current.clear();
  };

  const handleNextStep = () => {
    if (currentStepIndex < totalSteps - 1) {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      speakCurrentInstruction(nextIdx);
    }
  };

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      speakCurrentInstruction(prevIdx);
    }
  };

  const handleRepeatStep = () => {
    speakCurrentInstruction(currentStepIndex);
  };

  // Stop speech if route changes
  useEffect(() => {
    if (isActive) {
      handleStopGuidance();
    }
  }, [route]);

  if (!steps || steps.length === 0) {
    return null;
  }

  return (
    <div style={{
      marginTop: '12px',
      padding: '12px 14px',
      background: '#091018',
      borderRadius: '8px',
      border: '1px solid rgba(148, 163, 184, 0.18)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Compass className="w-4 h-4" style={{ width: '16px', height: '16px', color: '#00ff88' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
            Voice-Guided Walking Directions
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isSupported && (
            <button
              type="button"
              onClick={toggleMute}
              title={isMuted ? 'Unmute voice guidance' : 'Mute voice guidance'}
              style={{
                background: '#111a26',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: '4px',
                cursor: 'pointer',
                padding: '4px 6px',
                color: isMuted ? '#64748b' : '#00ff88'
              }}
            >
              {isMuted ? <VolumeX style={{ width: '16px', height: '16px' }} /> : <Volume2 style={{ width: '16px', height: '16px' }} />}
            </button>
          )}

          {!isActive ? (
            <button
              type="button"
              onClick={handleStartGuidance}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#04070c',
                background: 'linear-gradient(135deg, #00ff88 0%, #059669 100%)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                boxShadow: '0 0 12px rgba(0, 255, 136, 0.25)'
              }}
            >
              <Play style={{ width: '12px', height: '12px', fill: 'currentColor' }} />
              Start Guidance
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStopGuidance}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#f87171',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              <Square style={{ width: '12px', height: '12px', fill: 'currentColor' }} />
              Stop Guidance
            </button>
          )}
        </div>
      </div>

      {!isSupported && (
        <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
          <Info style={{ width: '12px', height: '12px' }} />
          <span>Speech synthesis is not supported in this browser. Step guidance will display visually.</span>
        </div>
      )}

      {isActive && currentStep && (
        <div style={{
          marginTop: '10px',
          padding: '12px',
          background: '#0d1520',
          borderRadius: '6px',
          border: '1px solid rgba(0, 255, 136, 0.25)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#00ff88', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Turn {currentStepIndex + 1} of {totalSteps}
            </span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              ~{Math.round(currentStep.distance_m)}m · {Math.round(currentStep.duration_sec)}s
            </span>
          </div>

          <div style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#f8fafc',
            marginBottom: '8px',
            lineHeight: '1.4'
          }}>
            {currentStep.instruction}
          </div>

          {/* Progress bar */}
          <div style={{ height: '4px', background: '#1c2838', borderRadius: '2px', overflow: 'hidden', marginBottom: '10px' }}>
            <div style={{ height: '100%', width: `${progressPercent}%`, background: 'linear-gradient(90deg, #00ff88, #38bdf8)', transition: 'width 0.3s ease' }} />
          </div>

          {/* Navigation Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={currentStepIndex === 0}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  background: currentStepIndex === 0 ? '#0b131e' : '#162436',
                  color: currentStepIndex === 0 ? '#64748b' : '#cbd5e1',
                  borderRadius: '4px',
                  cursor: currentStepIndex === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                <SkipBack style={{ width: '12px', height: '12px', display: 'inline', marginRight: '3px' }} />
                Previous
              </button>

              <button
                type="button"
                onClick={handleRepeatStep}
                title="Repeat spoken instruction"
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  background: '#162436',
                  color: '#cbd5e1',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                <RotateCcw style={{ width: '12px', height: '12px', display: 'inline', marginRight: '3px' }} />
                Repeat
              </button>

              <button
                type="button"
                onClick={handleNextStep}
                disabled={currentStepIndex === totalSteps - 1}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: '1px solid rgba(0, 255, 136, 0.4)',
                  background: currentStepIndex === totalSteps - 1 ? '#0b131e' : '#059669',
                  color: currentStepIndex === totalSteps - 1 ? '#64748b' : '#ffffff',
                  borderRadius: '4px',
                  cursor: currentStepIndex === totalSteps - 1 ? 'not-allowed' : 'pointer'
                }}
              >
                Next
                <SkipForward style={{ width: '12px', height: '12px', display: 'inline', marginLeft: '3px' }} />
              </button>
            </div>

            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
              {isSpeaking ? 'Speaking...' : (isMuted ? 'Muted' : 'Ready')}
            </span>
          </div>
        </div>
      )}

      {/* Hazard Warning Pill if present on route */}
      {route.hazard_warnings && route.hazard_warnings.length > 0 && (
        <div style={{
          marginTop: '8px',
          padding: '6px 10px',
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          color: '#fbbf24'
        }}>
          <AlertTriangle style={{ width: '14px', height: '14px', flexShrink: 0 }} />
          <span>
            <strong>{route.hazard_warnings.length} Community Hazard(s) Nearby:</strong>{' '}
            {route.hazard_warnings.map((w: any) => `${w.title} (~${w.distance_to_route_m}m)`).join(', ')}
          </span>
        </div>
      )}
    </div>
  );
};
