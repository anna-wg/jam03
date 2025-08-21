'use client'

import { useState, useEffect, useRef } from 'react';
import { getAssetPath } from '../lib/utils';
import Papa from 'papaparse';

// Define the three game states
type GameState = 0 | 1 | 2; // STATE 0: no input, STATE 1: waiting for vehicle, STATE 2: waiting for district

// Define vehicle types
type VehicleType = 'firetruck' | 'police' | 'ambulance';
type SelectableVehicleType = VehicleType | 'reject';

// Define districts
type District = 'North' | 'South' | 'East' | 'West';

// Define vehicle status
type VehicleStatus = 'available' | 'in-transit' | 'on-call';

// Define the structure for a vehicle
interface Vehicle {
  id: number;
  type: VehicleType;
  district: District;
  status: VehicleStatus;
}

// Define the structure for a call scenario
interface CallScenario {
  audio_file_name: string;
  correct_dispatch: 'police' | 'fire' | 'ambulance' | 'reject' | 'any';
  district_location: District;
}

const districts: District[] = ['North', 'South', 'East', 'West'];
const getRandomDistrict = () => districts[Math.floor(Math.random() * districts.length)];

// Function to create initial fleet with random placement
const createInitialFleet = (): Vehicle[] => [
  { id: 1, type: 'firetruck', district: getRandomDistrict(), status: 'available' },
  { id: 2, type: 'firetruck', district: getRandomDistrict(), status: 'available' },
  { id: 3, type: 'police', district: getRandomDistrict(), status: 'available' },
  { id: 4, type: 'police', district: getRandomDistrict(), status: 'available' },
  { id: 5, type: 'ambulance', district: getRandomDistrict(), status: 'available' },
  { id: 6, type: 'ambulance', district: getRandomDistrict(), status: 'available' },
];

// Transit time calculation (15 seconds per district away)
const getTransitTime = (start: District, end: District): number => {
  if (start === end) return 0;
  
  const distances: Record<District, Record<District, number>> = {
    North: { North: 0, South: 2, East: 1, West: 1 },
    South: { North: 2, South: 0, East: 1, West: 1 },
    East: { West: 2, North: 1, South: 1, East: 0 },
    West: { East: 2, North: 1, South: 1, West: 0 },
  };
  
  return (distances[start][end] || 0) * 15000; // in milliseconds
};

// Call duration based on call type (in milliseconds)
const getCallDuration = (callType: string): number => {
  const durations: Record<string, number> = {
    'police': 45000,    // 45 seconds
    'fire': 60000,      // 60 seconds
    'ambulance': 30000, // 30 seconds
    'reject': 0,        // No duration for rejected calls
  };
  return durations[callType] || 30000;
};

// Game statistics interface
interface GameStats {
  totalCalls: number;
  correctDispatches: number;
  incorrectDispatches: number;
  callsRejected: number;
  correctRejections: number;
  incorrectRejections: number;
  policeCallsHandled: number;
  fireCallsHandled: number;
  ambulanceCallsHandled: number;
  prankCallsHandled: number;
}

export default function BlindDispatch() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [allCalls, setAllCalls] = useState<CallScenario[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameState, setGameState] = useState<GameState>(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [currentCall, setCurrentCall] = useState<CallScenario | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<SelectableVehicleType | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [gameStats, setGameStats] = useState<GameStats>({
  totalCalls: 0,
  correctDispatches: 0,
  incorrectDispatches: 0,
  callsRejected: 0,
  correctRejections: 0,
  incorrectRejections: 0,
  policeCallsHandled: 0,
  fireCallsHandled: 0,
  ambulanceCallsHandled: 0,
  prankCallsHandled: 0,
});

const audioContextRef = useRef<AudioContext | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const mouseStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const fetchCalls = async () => {
      const response = await fetch(getAssetPath('/audio/emergency_calls/calls.csv'));
      const reader = response.body!.getReader();
      const result = await reader.read();
      const decoder = new TextDecoder('utf-8');
      const csv = decoder.decode(result.value);
      Papa.parse(csv, {
        header: true,
        complete: (results) => {
          const calls = results.data as CallScenario[];
          setAllCalls(calls);
        }
      });
    };
    fetchCalls();
  }, []);


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
      if (!audioContextRef.current) {
        console.warn('Audio context not ready, skipping playback.');
        return resolve(); // Resolve immediately if context is not ready
      }

      const emergencyCalls = allCalls.map(c => c.audio_file_name);
      const isEmergencyCall = emergencyCalls.includes(audioFile);
      const audioPath = getAssetPath(isEmergencyCall ? `/audio/emergency_calls/${audioFile}` : `/audio/${audioFile}`);
      try {
        const response = await fetch(audioPath);
        if (!response.ok) {
          console.error(`Failed to fetch audio file: ${audioFile}`);
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

  const audioQueueRef = useRef<string[][]>([]);
  const isPlayingAudioRef = useRef(false);

  const playAudioSequence = (audioFiles: string[]) => {
    audioQueueRef.current.push(audioFiles);
    processAudioQueue();
  };

  const processAudioQueue = async () => {
    if (isPlayingAudioRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    isPlayingAudioRef.current = true;
    const audioFiles = audioQueueRef.current.shift();

    if (audioFiles) {
      for (const audioFile of audioFiles) {
        try {
          await playAudio(audioFile);
        } catch (error) {
          console.error('Error playing audio sequence:', error);
          break;
        }
      }
    }

    isPlayingAudioRef.current = false;
    processAudioQueue();
  };

  const startGame = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    // Initialize new fleet with random placement
    const newFleet = createInitialFleet();
    setVehicles(newFleet);

    // Randomize district locations for calls
    const randomizedCalls = allCalls.map(call => ({
      ...call,
      district_location: getRandomDistrict()
    }));
    setAllCalls(randomizedCalls);

    setGameStarted(true);
    setScore(0);
    setTimeLeft(300);
    
    // Reset game statistics
    setGameStats({
      totalCalls: 0,
      correctDispatches: 0,
      incorrectDispatches: 0,
      callsRejected: 0,
      correctRejections: 0,
      incorrectRejections: 0,
      policeCallsHandled: 0,
      fireCallsHandled: 0,
      ambulanceCallsHandled: 0,
      prankCallsHandled: 0,
    });
    
    // Create a single audio sequence for all vehicle announcements
    const vehicleAnnouncements: string[] = [];
    newFleet.forEach(vehicle => {
      const districtAudio = `${vehicle.district.toLowerCase()}_district.wav`;
      vehicleAnnouncements.push(`${vehicle.type}.wav`, 'located_in.wav', districtAudio);
    });

    // Play game start audio, then vehicle announcements, then start first call
    playAudioSequence(['game-start.wav', ...vehicleAnnouncements]);
    
    // Start the first call after a delay to ensure audio sequence completes
    setTimeout(() => {
      startNextCall();
    }, (vehicleAnnouncements.length + 1) * 1500); // Rough estimate of audio duration
  };

  const startNextCall = () => {
    const availableCalls = allCalls.filter(call => call.audio_file_name !== currentCall?.audio_file_name);
    if (availableCalls.length === 0) {
      endGame();
      return;
    }
    const nextCall = availableCalls[Math.floor(Math.random() * availableCalls.length)];
    setCurrentCall(nextCall);
    setSelectedVehicle(null);
    setGameState(0); // STATE 0: no input during call audio
    
    // Use the audio queue system and wait for completion
    setTimeout(() => {
      playAudioSequence([nextCall.audio_file_name]);
      // Set state to 1 after audio completes (estimate based on typical call duration)
      setTimeout(() => {
        setGameState(1); // STATE 1: waiting for vehicle selection
      }, 4000); // Rough estimate for call audio duration
    }, 1000);
  };

  const endGame = () => {
    setGameStarted(false);
    setGameState(0);
    playAudioSequence(['game-over.wav']);
  };

  const handleVehicleSelection = (vehicle: SelectableVehicleType) => {
    if (gameState !== 1) return;

    setSelectedVehicle(vehicle);
    setGameState(0); // STATE 0: no input during audio feedback
    
    // Use audio queue system instead of direct playAudio
    playAudioSequence([`${vehicle}-selected.wav`]);
    
    if (vehicle === 'reject') {
      // Update statistics for rejection
      setGameStats(prev => ({
        ...prev,
        totalCalls: prev.totalCalls + 1,
        callsRejected: prev.callsRejected + 1,
        correctRejections: currentCall?.correct_dispatch === 'reject' ? prev.correctRejections + 1 : prev.correctRejections,
        incorrectRejections: currentCall?.correct_dispatch !== 'reject' ? prev.incorrectRejections + 1 : prev.incorrectRejections,
        prankCallsHandled: currentCall?.correct_dispatch === 'reject' ? prev.prankCallsHandled + 1 : prev.prankCallsHandled,
      }));
      
      // If call is rejected, go back to STATE 0 and start next call
      const isCorrectReject = currentCall?.correct_dispatch === 'reject';
      setScore(prev => prev + (isCorrectReject ? 1 : -1));
      setTimeout(() => {
        startNextCall();
      }, 1500); // Wait for selection audio to complete
    } else {
      // Go to STATE 2: waiting for district selection after audio completes
      setTimeout(() => {
        setGameState(2);
      }, 1500); // Wait for selection audio to complete
    }
  };

  // Vehicle dispatch function with status management
  const dispatchVehicle = (vehicle: Vehicle, targetDistrict: District, callType: string) => {
    const transitTime = getTransitTime(vehicle.district, targetDistrict);
    const callDuration = getCallDuration(callType);
    
    // Update vehicle status to in-transit
    setVehicles(prev => prev.map(v =>
      v.id === vehicle.id ? { ...v, status: 'in-transit' } : v
    ));

    // After transit time, update to on-call and move to target district
    setTimeout(() => {
      setVehicles(prev => prev.map(v =>
        v.id === vehicle.id ? {
          ...v,
          status: 'on-call',
          district: targetDistrict
        } : v
      ));

      // After call duration, return to available status
      setTimeout(() => {
        setVehicles(prev => prev.map(v =>
          v.id === vehicle.id ? { ...v, status: 'available' } : v
        ));
      }, callDuration);
    }, transitTime);
  };

  const handleDistrictSelection = (district: District) => {
    if (gameState !== 2 || !selectedVehicle || selectedVehicle === 'reject') return;

    setGameState(0); // STATE 0: no input during audio feedback

    // Find available vehicles of the selected type
    const availableVehicles = vehicles.filter(
      (v) => v.type === selectedVehicle && v.status === 'available'
    );

    if (availableVehicles.length > 0) {
      // Find the closest available vehicle to the target district
      let closestVehicle = availableVehicles[0];
      let shortestTime = getTransitTime(availableVehicles[0].district, district);

      for (const vehicle of availableVehicles) {
        const transitTime = getTransitTime(vehicle.district, district);
        if (transitTime < shortestTime) {
          shortestTime = transitTime;
          closestVehicle = vehicle;
        }
      }

      // Play dispatch confirmation audio
      const districtAudio = `${district.toLowerCase()}_district.wav`;
      playAudioSequence([`${selectedVehicle}.wav`, 'dispatched_to.wav', districtAudio]);

      // Dispatch the vehicle
      const callType = currentCall?.correct_dispatch === 'fire' ? 'fire' :
                      currentCall?.correct_dispatch === 'ambulance' ? 'ambulance' : 'police';
      dispatchVehicle(closestVehicle, district, callType);

      // Check if correct vehicle type was selected
      const isCorrectVehicle = selectedVehicle === currentCall?.correct_dispatch || (currentCall?.correct_dispatch === 'any' && (selectedVehicle as SelectableVehicleType) !== 'reject');
      setScore(prev => prev + (isCorrectVehicle ? 1 : -1));
      
      // Update statistics for dispatch
      setGameStats(prev => ({
        ...prev,
        totalCalls: prev.totalCalls + 1,
        correctDispatches: isCorrectVehicle ? prev.correctDispatches + 1 : prev.correctDispatches,
        incorrectDispatches: !isCorrectVehicle ? prev.incorrectDispatches + 1 : prev.incorrectDispatches,
        policeCallsHandled: currentCall?.correct_dispatch === 'police' ? prev.policeCallsHandled + 1 : prev.policeCallsHandled,
        fireCallsHandled: currentCall?.correct_dispatch === 'fire' ? prev.fireCallsHandled + 1 : prev.fireCallsHandled,
        ambulanceCallsHandled: currentCall?.correct_dispatch === 'ambulance' ? prev.ambulanceCallsHandled + 1 : prev.ambulanceCallsHandled,
      }));
      
      // Start next call
      startNextCall();
    } else {
      // No vehicle available - play appropriate audio and return to vehicle selection
      const vehicleType = selectedVehicle === 'firetruck' ? 'fire' :
                         selectedVehicle === 'ambulance' ? 'ambulance' : 'police';
      const districtName = district.toLowerCase();
      playAudioSequence([`no-${vehicleType}-${districtName}.mp3`]);
      
      // Return to STATE 1 (vehicle selection) instead of STATE 0
      setGameState(1);
    }
  };


  // Keyboard event handler for testing
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      console.log('Key pressed:', event.key, 'Game state:', gameState);
      if (gameState === 2) {
        switch (event.key) {
          case 'ArrowUp':
            console.log('Selecting North district');
            handleDistrictSelection('North');
            break;
          case 'ArrowDown':
            console.log('Selecting South district');
            handleDistrictSelection('South');
            break;
          case 'ArrowLeft':
            console.log('Selecting West district');
            handleDistrictSelection('West');
            break;
          case 'ArrowRight':
            console.log('Selecting East district');
            handleDistrictSelection('East');
            break;
          case '1':
            console.log('Debug: Selecting North district');
            handleDistrictSelection('North');
            break;
          case '2':
            console.log('Debug: Selecting South district');
            handleDistrictSelection('South');
            break;
          case '3':
            console.log('Debug: Selecting West district');
            handleDistrictSelection('West');
            break;
          case '4':
            console.log('Debug: Selecting East district');
            handleDistrictSelection('East');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameState, handleDistrictSelection]);

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
      handleVehicleSelection('firetruck');
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
        handleDistrictSelection('East');
      } else {
        handleDistrictSelection('West');
      }
    } else if (Math.abs(deltaY) > minSwipeDistance) {
      // Vertical swipe
      if (deltaY > 0) {
        handleDistrictSelection('South');
      } else {
        handleDistrictSelection('North');
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
          handleDistrictSelection('East');
        } else {
          handleDistrictSelection('West');
        }
      } else if (Math.abs(deltaY) > minSwipeDistance) {
        // Vertical swipe
        if (deltaY > 0) {
          handleDistrictSelection('South');
        } else {
          handleDistrictSelection('North');
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

  const calculateAccuracy = (): number => {
    const totalAttempts = gameStats.correctDispatches + gameStats.incorrectDispatches + gameStats.correctRejections + gameStats.incorrectRejections;
    if (totalAttempts === 0) return 0;
    return Math.round(((gameStats.correctDispatches + gameStats.correctRejections) / totalAttempts) * 100);
  };

  const getPerformanceRating = (): string => {
    const accuracy = calculateAccuracy();
    if (accuracy >= 90) return 'EXCELLENT';
    if (accuracy >= 80) return 'GOOD';
    if (accuracy >= 70) return 'FAIR';
    if (accuracy >= 60) return 'NEEDS IMPROVEMENT';
    return 'POOR';
  };

  const ScoreBoard = () => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px'
    }}>
      <h1 style={{
        fontSize: '3rem',
        marginBottom: '1rem',
        color: '#FFD700'
      }}>
        SHIFT COMPLETE
      </h1>
      
      <div style={{
        fontSize: '2.5rem',
        fontWeight: 'bold',
        marginBottom: '2rem',
        color: score >= 0 ? '#00FF00' : '#FF4444'
      }}>
        Final Score: {score}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '20px',
        width: '100%',
        marginBottom: '2rem'
      }}>
        {/* Performance Summary */}
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          padding: '20px',
          borderRadius: '10px',
          border: '2px solid #FFD700'
        }}>
          <h3 style={{
            fontSize: '1.5rem',
            marginBottom: '15px',
            color: '#FFD700'
          }}>
            PERFORMANCE
          </h3>
          <div style={{ fontSize: '1.2rem', marginBottom: '10px' }}>
            Accuracy: <span style={{ color: '#00FF00' }}>{calculateAccuracy()}%</span>
          </div>
          <div style={{
            fontSize: '1.4rem',
            fontWeight: 'bold',
            color: getPerformanceRating() === 'EXCELLENT' ? '#00FF00' :
                   getPerformanceRating() === 'GOOD' ? '#90EE90' :
                   getPerformanceRating() === 'FAIR' ? '#FFFF00' :
                   getPerformanceRating() === 'NEEDS IMPROVEMENT' ? '#FFA500' : '#FF4444'
          }}>
            {getPerformanceRating()}
          </div>
        </div>

        {/* Call Statistics */}
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          padding: '20px',
          borderRadius: '10px',
          border: '2px solid #4169E1'
        }}>
          <h3 style={{
            fontSize: '1.5rem',
            marginBottom: '15px',
            color: '#4169E1'
          }}>
            CALL STATISTICS
          </h3>
          <div style={{ fontSize: '1rem', lineHeight: '1.5' }}>
            <div>Total Calls: <span style={{ color: '#FFFFFF' }}>{gameStats.totalCalls}</span></div>
            <div>Correct Dispatches: <span style={{ color: '#00FF00' }}>{gameStats.correctDispatches}</span></div>
            <div>Incorrect Dispatches: <span style={{ color: '#FF4444' }}>{gameStats.incorrectDispatches}</span></div>
            <div>Calls Rejected: <span style={{ color: '#FFFF00' }}>{gameStats.callsRejected}</span></div>
            <div>Correct Rejections: <span style={{ color: '#00FF00' }}>{gameStats.correctRejections}</span></div>
            <div>Incorrect Rejections: <span style={{ color: '#FF4444' }}>{gameStats.incorrectRejections}</span></div>
          </div>
        </div>

        {/* Call Type Breakdown */}
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          padding: '20px',
          borderRadius: '10px',
          border: '2px solid #32CD32'
        }}>
          <h3 style={{
            fontSize: '1.5rem',
            marginBottom: '15px',
            color: '#32CD32'
          }}>
            CALL TYPES
          </h3>
          <div style={{ fontSize: '1rem', lineHeight: '1.5' }}>
            <div>Police Calls: <span style={{ color: '#4169E1' }}>{gameStats.policeCallsHandled}</span></div>
            <div>Fire Calls: <span style={{ color: '#FF4444' }}>{gameStats.fireCallsHandled}</span></div>
            <div>Medical Calls: <span style={{ color: '#FFFFFF' }}>{gameStats.ambulanceCallsHandled}</span></div>
            <div>Prank Calls: <span style={{ color: '#808080' }}>{gameStats.prankCallsHandled}</span></div>
          </div>
        </div>
      </div>

      <div style={{
        fontSize: '1.2rem',
        opacity: 0.8,
        marginTop: '1rem'
      }}>
        Refresh the page to start a new shift
      </div>
    </div>
  );

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
        Debug
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
                <h1 style={{ fontSize: '3rem', marginBottom: '2rem' }}>Blind Dispatch</h1>
                <p style={{ fontSize: '1.5rem' }}>Click anywhere to start your shift...</p>
              </div>
            ) : timeLeft === 0 ? (
              <ScoreBoard />
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
      
      {/* Debug panel showing vehicle status */}
      {!debugMode && gameStarted && (
        <div style={{
          position: 'absolute',
          top: '120px',
          right: '20px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '20px',
          borderRadius: '10px',
          fontSize: '12px',
          maxWidth: '300px',
          zIndex: 1000
        }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Fleet Status</h3>
          {vehicles.map(vehicle => (
            <div key={vehicle.id} style={{
              marginBottom: '8px',
              padding: '5px',
              backgroundColor: vehicle.status === 'available' ? 'rgba(0, 255, 0, 0.2)' :
                              vehicle.status === 'in-transit' ? 'rgba(255, 255, 0, 0.2)' :
                              'rgba(255, 0, 0, 0.2)',
              borderRadius: '3px'
            }}>
              <div><strong>{vehicle.type.toUpperCase()} #{vehicle.id}</strong></div>
              <div>District: {vehicle.district}</div>
              <div>Status: {vehicle.status}</div>
            </div>
          ))}
          {gameStarted && (
            <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: '1px solid #333' }}>
              <div><strong>Current Call:</strong></div>
              <div>Type: {currentCall?.correct_dispatch || 'None'}</div>
              <div>District: {currentCall?.district_location || 'None'}</div>
              <div>Selected: {selectedVehicle || 'None'}</div>
              <div>State: {gameState}</div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
