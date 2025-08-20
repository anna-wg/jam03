'use client'

import { useState, useEffect, useRef } from 'react';
import { getAssetPath } from '../lib/utils';

// Define the three game states
type GameState = 0 | 1 | 2; // STATE 0: no input, STATE 1: waiting for vehicle, STATE 2: waiting for district

// Define vehicle types
type VehicleType = 'police' | 'fire' | 'ambulance' | 'reject';

// Define districts
type District = 'north' | 'south' | 'east' | 'west';

// Define the structure for a call scenario
interface CallScenario {
  id: number;
  audioFile: string;
  correctDispatch: VehicleType;
}

const allCalls: CallScenario[] = [
  { id: 1, audioFile: 'police-call-1.mp3', correctDispatch: 'police' },
  { id: 2, audioFile: 'police-call-2.mp3', correctDispatch: 'police' },
  { id: 3, audioFile: 'fire-call-1.mp3', correctDispatch: 'fire' },
  { id: 4, audioFile: 'ems-call-1.mp3', correctDispatch: 'ambulance' },
  { id: 5, audioFile: 'ems-call-2.mp3', correctDispatch: 'ambulance' },
  { id: 6, audioFile: 'prank-call-1.mp3', correctDispatch: 'reject' },
  { id: 7, audioFile: 'prank-call-2.mp3', correctDispatch: 'reject' },
];

export default function BlindDispatch() {
  const [gameStarted, setGameStarted] = useState(false);
  const [gameState, setGameState] = useState<GameState>(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [currentCall, setCurrentCall] = useState<CallScenario | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const mouseStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  // Keyboard event handler for testing
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (gameState === 2) {
        switch (event.key) {
          case 'ArrowUp':
            handleDistrictSelection('north');
            break;
          case 'ArrowDown':
            handleDistrictSelection('south');
            break;
          case 'ArrowLeft':
            handleDistrictSelection('west');
            break;
          case 'ArrowRight':
            handleDistrictSelection('east');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameState]);

  // Timer effect
  useEffect(() => {
    if (gameStarted && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prevTime => prevTime - 1);
      }, 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0) {
      endGame();
    }
  }, [gameStarted, timeLeft]);

  const playAudio = (audioFile: string): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      if (!audioContextRef.current) return reject('Audio context not ready');

      const audioPath = getAssetPath(`/audio/${audioFile}`);
      try {
        const response = await fetch(audioPath);
        if (!response.ok) {
          return reject(`Failed to fetch audio file: ${audioFile}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.start(0);
        source.onended = () => resolve();
      } catch (error) {
        console.error(`Failed to play audio file: ${audioFile}`, error);
        reject(error);
      }
    });
  };

  const startGame = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    setGameStarted(true);
    setScore(0);
    setTimeLeft(300);
    
    // Play game start audio and then start first call
    await playAudio('game-start.wav');
    startNextCall();
  };

  const startNextCall = () => {
    const availableCalls = allCalls.filter(call => call.id !== currentCall?.id);
    const nextCall = availableCalls[Math.floor(Math.random() * availableCalls.length)];
    setCurrentCall(nextCall);
    setSelectedVehicle(null);
    setGameState(0); // STATE 0: no input during call audio
    
    setTimeout(async () => {
      await playAudio(nextCall.audioFile);
      setGameState(1); // STATE 1: waiting for vehicle selection
    }, 1000);
  };

  const endGame = async () => {
    setGameStarted(false);
    setGameState(0);
    await playAudio('game-over.wav');
  };

  const handleVehicleSelection = async (vehicle: VehicleType) => {
    if (gameState !== 1) return;

    setSelectedVehicle(vehicle);
    setGameState(0); // STATE 0: no input during audio feedback
    
    // Play vehicle selection audio
    await playAudio(`${vehicle}-selected.wav`);
    
    if (vehicle === 'reject') {
      // If call is rejected, go back to STATE 0 and start next call
      setScore(prev => prev + (currentCall?.correctDispatch === 'reject' ? 1 : -1));
      startNextCall();
    } else {
      // Go to STATE 2: waiting for district selection
      setGameState(2);
    }
  };

  const handleDistrictSelection = async (district: District) => {
    if (gameState !== 2 || !selectedVehicle) return;

    setGameState(0); // STATE 0: no input during audio feedback
    
    // Play district selection audio
    await playAudio(`${district}-selected.wav`);
    
    // For now, always dispatch successfully (vehicle tracking will be added later)
    const isCorrectVehicle = selectedVehicle === currentCall?.correctDispatch;
    setScore(prev => prev + (isCorrectVehicle ? 1 : -1));
    
    // Start next call
    startNextCall();
  };

  const handleQuadrantTap = (event: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== 1) return;

    let clientX, clientY;
    if ('touches' in event) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const isTopHalf = clientY < screenHeight / 2;
    const isLeftHalf = clientX < screenWidth / 2;

    if (isTopHalf && isLeftHalf) {
      handleVehicleSelection('police');
    } else if (isTopHalf && !isLeftHalf) {
      handleVehicleSelection('fire');
    } else if (!isTopHalf && isLeftHalf) {
      handleVehicleSelection('ambulance');
    } else {
      handleVehicleSelection('reject');
    }
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    if (gameState === 2) {
      touchStartRef.current = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      };
    } else {
      handleQuadrantTap(event);
    }
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (gameState !== 2 || !touchStartRef.current) return;

    const endX = event.changedTouches[0].clientX;
    const endY = event.changedTouches[0].clientY;
    const deltaX = endX - touchStartRef.current.x;
    const deltaY = endY - touchStartRef.current.y;
    const minSwipeDistance = 50;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
      // Horizontal swipe
      if (deltaX > 0) {
        handleDistrictSelection('east');
      } else {
        handleDistrictSelection('west');
      }
    } else if (Math.abs(deltaY) > minSwipeDistance) {
      // Vertical swipe
      if (deltaY > 0) {
        handleDistrictSelection('south');
      } else {
        handleDistrictSelection('north');
      }
    }

    touchStartRef.current = null;
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (gameState === 2) {
      mouseStartRef.current = {
        x: event.clientX,
        y: event.clientY
      };
      isDraggingRef.current = false;
    }
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (gameState === 2 && mouseStartRef.current) {
      const deltaX = event.clientX - mouseStartRef.current.x;
      const deltaY = event.clientY - mouseStartRef.current.y;
      const minDragDistance = 10;
      
      if (Math.abs(deltaX) > minDragDistance || Math.abs(deltaY) > minDragDistance) {
        isDraggingRef.current = true;
      }
    }
  };

  const handleMouseUp = (event: React.MouseEvent) => {
    if (gameState === 2 && mouseStartRef.current) {
      const endX = event.clientX;
      const endY = event.clientY;
      const deltaX = endX - mouseStartRef.current.x;
      const deltaY = endY - mouseStartRef.current.y;
      const minSwipeDistance = 50;

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
        // Horizontal swipe
        if (deltaX > 0) {
          handleDistrictSelection('east');
        } else {
          handleDistrictSelection('west');
        }
      } else if (Math.abs(deltaY) > minSwipeDistance) {
        // Vertical swipe
        if (deltaY > 0) {
          handleDistrictSelection('south');
        } else {
          handleDistrictSelection('north');
        }
      }

      mouseStartRef.current = null;
      isDraggingRef.current = false;
      return;
    }

    // Handle regular clicks (not drags)
    if (!isDraggingRef.current) {
      handleClick(event);
    }
    
    mouseStartRef.current = null;
    isDraggingRef.current = false;
  };

  const handleClick = (event: React.MouseEvent) => {
    if (!gameStarted) {
      startGame();
      return;
    }
    
    handleQuadrantTap(event);
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getStateDescription = (): string => {
    if (!gameStarted) return 'Tap to start your shift';
    if (gameState === 0) return 'Listen...';
    if (gameState === 1) return 'Tap quadrant to select vehicle type';
    if (gameState === 2) return 'Swipe to select district';
    return '';
  };

  return (
    <main
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: 'black',
        color: 'white',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        touchAction: 'none'
      }}
    >
      <button
        onClick={() => setDebugMode(prev => !prev)}
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          padding: '10px',
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          border: '1px solid white',
          color: 'white',
          cursor: 'pointer'
        }}
      >
        Toggle UI
      </button>
      {!debugMode && (
        <>
          {/* Top bar with score and timer */}
          {gameStarted && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '20px',
              fontSize: '2rem',
              fontWeight: 'bold'
            }}>
              <div>Score: {score}</div>
              <div>{formatTime(timeLeft)}</div>
            </div>
          )}

          {/* Main content area */}
          <div style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center'
          }}>
            {!gameStarted ? (
              <div>
                <h1 style={{ fontSize: '3rem', marginBottom: '2rem' }}>Dispatch</h1>
                <p style={{ fontSize: '1.5rem' }}>Tap anywhere to start your shift</p>
              </div>
            ) : timeLeft === 0 ? (
              <div>
                <h1 style={{ fontSize: '3rem', marginBottom: '2rem' }}>Shift Over</h1>
                <p style={{ fontSize: '2rem', marginBottom: '1rem' }}>Final Score: {score}</p>
                <p style={{ fontSize: '1.5rem' }}>Refresh to play again</p>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '1.5rem', opacity: 0.7 }}>{getStateDescription()}</p>
                {gameState === 1 && (
                  <div style={{ marginTop: '2rem', fontSize: '1rem', opacity: 0.5 }}>
                    <p>Police (Top Left) | Fire (Top Right)</p>
                    <p>Ambulance (Bottom Left) | Reject (Bottom Right)</p>
                  </div>
                )}
                {gameState === 2 && (
                  <div style={{ marginTop: '2rem', fontSize: '1rem', opacity: 0.5 }}>
                    <p>Swipe: ↑ North | ↓ South | ← West | → East</p>
                    <p style={{ fontSize: '0.8rem', marginTop: '1rem' }}>
                      (Or use arrow keys for testing)
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quadrant overlay for visual feedback during development */}
          {gameStarted && gameState === 1 && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              opacity: 0.1
            }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '50%',
                height: '50%',
                backgroundColor: 'blue',
                border: '1px solid white'
              }} />
              <div style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '50%',
                height: '50%',
                backgroundColor: 'red',
                border: '1px solid white'
              }} />
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '50%',
                height: '50%',
                backgroundColor: 'white',
                border: '1px solid white'
              }} />
              <div style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: '50%',
                height: '50%',
                backgroundColor: 'gray',
                border: '1px solid white'
              }} />
            </div>
          )}
        </>
      )}
    </main>
  );
}
