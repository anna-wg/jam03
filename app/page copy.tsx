'use client'

import { useState, useEffect, useRef } from 'react';
import { getAssetPath } from '../lib/utils';

// Define the game states
type GameState = 'waiting' | 'playing' | 'ended';

// Define the structure for a call scenario
interface CallScenario {
  id: number;
  audioFile: string;
  correctDispatch: 'police' | 'fire' | 'ems' | 'prank';
}

const allCalls: CallScenario[] = [
  { id: 1, audioFile: 'police-call-1.mp3', correctDispatch: 'police' },
  { id: 2, audioFile: 'police-call-2.mp3', correctDispatch: 'police' },
  { id: 3, audioFile: 'fire-call-1.mp3', correctDispatch: 'fire' },
  // Removed fire-call-2.mp3 as it doesn't exist in the audio directory
  { id: 5, audioFile: 'ems-call-1.mp3', correctDispatch: 'ems' },
  { id: 6, audioFile: 'ems-call-2.mp3', correctDispatch: 'ems' },
  { id: 7, audioFile: 'prank-call-1.mp3', correctDispatch: 'prank' },
  { id: 8, audioFile: 'prank-call-2.mp3', correctDispatch: 'prank' },
];

export default function BlindDispatch() {
  const [gameState, setGameState] = useState<GameState>('waiting');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [currentCall, setCurrentCall] = useState<CallScenario | null>(null);
  const [tutorialPlayed, setTutorialPlayed] = useState({ success: false, failure: false });
  const [incorrectStreak, setIncorrectStreak] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isAudioInitialized, setIsAudioInitialized] = useState(false);
  const [audioPreloadStatus, setAudioPreloadStatus] = useState<'idle' | 'loading' | 'loaded' | 'failed'>('idle');
  const audioContextRef = useRef<AudioContext | null>(null);
  const radioChatterSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());

  useEffect(() => {
    if (gameState === 'playing' && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prevTime => prevTime - 1);
      }, 1000);

      // Handle radio chatter based on time (temporarily disabled)
      // if (timeLeft === 300) playRadioChatter('radio-chatter-calm.mp3');
      // else if (timeLeft === 180) playRadioChatter('radio-chatter-medium.mp3');
      // else if (timeLeft === 60) playRadioChatter('radio-chatter-urgent.mp3');

      return () => clearInterval(timer);
    } else if (timeLeft === 0) {
      setGameState('ended');
      // if (radioChatterSourceRef.current) {
      //   radioChatterSourceRef.current.stop();
      // }
    }
  }, [gameState, timeLeft]);

  // Check if audio is properly initialized
  const isAudioReady = (): boolean => {
    const ready = audioContextRef.current && audioContextRef.current.state === 'running';
    console.log('[AUDIO DEBUG] isAudioReady check:', ready, 'AudioContext state:', audioContextRef.current?.state);
    return ready;
  };

  // iOS-specific audio initialization
  const initializeAudioContext = async (): Promise<boolean> => {
    console.log('[AUDIO DEBUG] Initializing AudioContext for iOS...');
    console.log('[AUDIO DEBUG] Current isAudioInitialized state:', isAudioInitialized);
    console.log('[AUDIO DEBUG] Current AudioContext:', audioContextRef.current);
    
    try {
      if (!audioContextRef.current) {
        // Use webkitAudioContext for older iOS versions
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) {
          console.error('[AUDIO DEBUG] AudioContext not supported');
          setIsAudioInitialized(false);
          return false;
        }
        
        audioContextRef.current = new AudioContextClass();
        console.log('[AUDIO DEBUG] AudioContext created successfully, state:', audioContextRef.current.state);
      }
      
      console.log('[AUDIO DEBUG] AudioContext current state before resume:', audioContextRef.current.state);
      
      // iOS requires explicit resume after user interaction
      if (audioContextRef.current.state === 'suspended') {
        console.log('[AUDIO DEBUG] AudioContext suspended, resuming...');
        await audioContextRef.current.resume();
        console.log('[AUDIO DEBUG] AudioContext resumed, new state:', audioContextRef.current.state);
      }
      
      // Verify AudioContext is in running state or handle interrupted state
      if ((audioContextRef.current.state as string) === 'interrupted') {
        console.log('[AUDIO DEBUG] AudioContext is interrupted, attempting to resume...');
        try {
          await audioContextRef.current.resume();
          console.log('[AUDIO DEBUG] AudioContext resumed from interrupted state, new state:', audioContextRef.current.state);
        } catch (resumeError) {
          console.error('[AUDIO DEBUG] Failed to resume from interrupted state:', resumeError);
          // Try to create a new AudioContext
          console.log('[AUDIO DEBUG] Creating new AudioContext to replace interrupted one...');
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          audioContextRef.current = new AudioContextClass();
          console.log('[AUDIO DEBUG] New AudioContext created, state:', audioContextRef.current.state);
        }
      }
      
      if (audioContextRef.current.state !== 'running') {
        console.error('[AUDIO DEBUG] AudioContext failed to reach running state:', audioContextRef.current.state);
        setIsAudioInitialized(false);
        return false;
      }
      
      // Test audio context with a silent buffer to ensure it's working
      console.log('[AUDIO DEBUG] Testing AudioContext with silent buffer...');
      const testBuffer = audioContextRef.current.createBuffer(1, 1, 22050);
      const testSource = audioContextRef.current.createBufferSource();
      testSource.buffer = testBuffer;
      testSource.connect(audioContextRef.current.destination);
      testSource.start(0);
      
      console.log('[AUDIO DEBUG] AudioContext test successful, audio is now ready');
      setIsAudioInitialized(true);
      
      console.log('[AUDIO DEBUG] Audio initialization completed successfully');
      
      // Preload critical audio files immediately after AudioContext is ready
      console.log('[AUDIO DEBUG] Starting audio preload...');
      await preloadCriticalAudio();
      
      return true;
    } catch (error) {
      console.error('[AUDIO DEBUG] Failed to initialize AudioContext:', error);
      console.error('[AUDIO DEBUG] Error details:', error.message, error.stack);
      setIsAudioInitialized(false);
      return false;
    }
  };

  // Preload critical audio files for iOS Safari
  const preloadCriticalAudio = async () => {
    setAudioPreloadStatus('loading');
    const criticalFiles = ['call-connect.mp3', 'success-sound.mp3', 'failure-sound.mp3'];
    
    console.log('[AUDIO DEBUG] Preloading critical audio files:', criticalFiles);
    
    try {
      const preloadPromises = criticalFiles.map(async (file) => {
        try {
          console.log(`[AUDIO DEBUG] Preloading ${file}...`);
          await loadAudioBuffer(file);
          console.log(`[AUDIO DEBUG] Successfully preloaded ${file}`);
          return true;
        } catch (error) {
          console.error(`[AUDIO DEBUG] Failed to preload ${file}:`, error);
          return false;
        }
      });
      
      const results = await Promise.allSettled(preloadPromises);
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
      
      console.log(`[AUDIO DEBUG] Preloaded ${successCount}/${criticalFiles.length} critical audio files`);
      
      if (successCount > 0) {
        setAudioPreloadStatus('loaded');
      } else {
        setAudioPreloadStatus('failed');
      }
    } catch (error) {
      console.error('[AUDIO DEBUG] Error during audio preload:', error);
      setAudioPreloadStatus('failed');
    }
  };

  // Enhanced audio loading with caching for iOS
  const loadAudioBuffer = async (audioFile: string): Promise<AudioBuffer> => {
    console.log(`[AUDIO DEBUG] loadAudioBuffer called for: ${audioFile}`);
    console.log(`[AUDIO DEBUG] AudioContext state in loadAudioBuffer:`, audioContextRef.current?.state);
    console.log(`[AUDIO DEBUG] isAudioInitialized in loadAudioBuffer:`, isAudioInitialized);
    console.log(`[AUDIO DEBUG] isAudioReady() check:`, isAudioReady());
    
    // Check cache first
    if (audioBufferCacheRef.current.has(audioFile)) {
      console.log(`[AUDIO DEBUG] Using cached audio buffer: ${audioFile}`);
      return audioBufferCacheRef.current.get(audioFile)!;
    }

    const audioPath = getAssetPath(`/audio/${audioFile}`);
    console.log(`[AUDIO DEBUG] Loading audio buffer from path: ${audioPath}`);
    
    if (!audioContextRef.current) {
      throw new Error('AudioContext not initialized');
    }
    
    // Handle interrupted AudioContext state
    if ((audioContextRef.current.state as string) === 'interrupted') {
      console.log(`[AUDIO DEBUG] AudioContext interrupted in loadAudioBuffer, attempting to resume...`);
      try {
        await audioContextRef.current.resume();
        console.log(`[AUDIO DEBUG] AudioContext resumed from interrupted state in loadAudioBuffer`);
      } catch (error) {
        console.error(`[AUDIO DEBUG] Failed to resume interrupted AudioContext in loadAudioBuffer:`, error);
        throw new Error(`AudioContext interrupted and cannot be resumed: ${error.message}`);
      }
    }
    
    if (audioContextRef.current.state !== 'running') {
      throw new Error(`AudioContext not in running state: ${audioContextRef.current.state}`);
    }
    
    try {
      console.log(`[AUDIO DEBUG] Fetching audio file: ${audioPath}`);
      
      // iOS Safari: Try fetch with specific headers
      const response = await fetch(audioPath, {
        method: 'GET',
        headers: {
          'Accept': 'audio/*,*/*;q=0.9',
          'Cache-Control': 'no-cache'
        },
        cache: 'no-cache'
      });
      
      console.log(`[AUDIO DEBUG] Fetch response status: ${response.status}, ok: ${response.ok}`);
      console.log(`[AUDIO DEBUG] Response headers:`, Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        throw new Error(`Failed to fetch audio file: ${audioFile}, status: ${response.status}, statusText: ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type');
      console.log(`[AUDIO DEBUG] Content-Type: ${contentType}`);
      
      console.log(`[AUDIO DEBUG] Converting response to arrayBuffer...`);
      const arrayBuffer = await response.arrayBuffer();
      console.log(`[AUDIO DEBUG] Audio buffer size: ${arrayBuffer.byteLength} bytes`);
      
      if (arrayBuffer.byteLength === 0) {
        throw new Error(`Empty audio file received: ${audioFile}`);
      }
      
      console.log(`[AUDIO DEBUG] Decoding audio data...`);
      
      // iOS Safari: Use promise-based decodeAudioData with fallback
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      } catch (decodeError) {
        console.error(`[AUDIO DEBUG] decodeAudioData failed, trying callback version:`, decodeError);
        
        // Fallback to callback-based decodeAudioData for older iOS versions
        audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
          audioContextRef.current!.decodeAudioData(
            arrayBuffer,
            (buffer) => {
              console.log(`[AUDIO DEBUG] Callback-based decode successful`);
              resolve(buffer);
            },
            (error) => {
              console.error(`[AUDIO DEBUG] Callback-based decode failed:`, error);
              reject(error);
            }
          );
        });
      }
      
      console.log(`[AUDIO DEBUG] Audio decoded successfully, duration: ${audioBuffer.duration}s, channels: ${audioBuffer.numberOfChannels}, sampleRate: ${audioBuffer.sampleRate}`);
      
      // Validate the decoded buffer
      if (audioBuffer.duration === 0) {
        throw new Error(`Invalid audio buffer duration: ${audioFile}`);
      }
      
      // Cache the buffer
      audioBufferCacheRef.current.set(audioFile, audioBuffer);
      console.log(`[AUDIO DEBUG] Audio buffer cached for: ${audioFile}`);
      
      return audioBuffer;
    } catch (error) {
      console.error(`[AUDIO DEBUG] Error in loadAudioBuffer for ${audioFile}:`, error);
      console.error(`[AUDIO DEBUG] Error message:`, error.message);
      console.error(`[AUDIO DEBUG] Error stack:`, error.stack);
      
      // iOS Safari: Try alternative loading method using XMLHttpRequest
      console.log(`[AUDIO DEBUG] Trying XMLHttpRequest fallback for: ${audioFile}`);
      try {
        const audioBuffer = await loadAudioBufferXHR(audioFile);
        console.log(`[AUDIO DEBUG] XMLHttpRequest fallback successful for: ${audioFile}`);
        return audioBuffer;
      } catch (xhrError) {
        console.error(`[AUDIO DEBUG] XMLHttpRequest fallback also failed:`, xhrError);
        throw error; // Throw original error
      }
    }
  };

  // Fallback audio loading using XMLHttpRequest for iOS Safari
  const loadAudioBufferXHR = async (audioFile: string): Promise<AudioBuffer> => {
    return new Promise((resolve, reject) => {
      const audioPath = getAssetPath(`/audio/${audioFile}`);
      console.log(`[AUDIO DEBUG] Loading via XMLHttpRequest: ${audioPath}`);
      
      const xhr = new XMLHttpRequest();
      xhr.open('GET', audioPath, true);
      xhr.responseType = 'arraybuffer';
      
      xhr.onload = async () => {
        if (xhr.status === 200) {
          try {
            console.log(`[AUDIO DEBUG] XHR loaded ${audioFile}, size: ${xhr.response.byteLength} bytes`);
            
            if (!audioContextRef.current) {
              throw new Error('AudioContext not initialized');
            }
            
            const audioBuffer = await audioContextRef.current.decodeAudioData(xhr.response);
            audioBufferCacheRef.current.set(audioFile, audioBuffer);
            resolve(audioBuffer);
          } catch (error) {
            console.error(`[AUDIO DEBUG] XHR decode failed for ${audioFile}:`, error);
            reject(error);
          }
        } else {
          reject(new Error(`XHR failed: ${xhr.status} ${xhr.statusText}`));
        }
      };
      
      xhr.onerror = () => {
        console.error(`[AUDIO DEBUG] XHR error for ${audioFile}`);
        reject(new Error('XHR network error'));
      };
      
      xhr.ontimeout = () => {
        console.error(`[AUDIO DEBUG] XHR timeout for ${audioFile}`);
        reject(new Error('XHR timeout'));
      };
      
      xhr.timeout = 10000; // 10 second timeout
      xhr.send();
    });
  };

  const playAudio = (audioFile: string, loop = false): Promise<AudioBufferSourceNode> => {
    return new Promise(async (resolve, reject) => {
      console.log(`[AUDIO DEBUG] Attempting to play: ${audioFile}`);
      console.log(`[AUDIO DEBUG] AudioContext state:`, audioContextRef.current?.state);
      console.log(`[AUDIO DEBUG] Audio initialized (React state):`, isAudioInitialized);
      console.log(`[AUDIO DEBUG] Audio ready (direct check):`, isAudioReady());
      console.log(`[AUDIO DEBUG] Audio preload status:`, audioPreloadStatus);
      
      if (!audioContextRef.current) {
        console.error('[AUDIO DEBUG] Audio context not ready');
        return reject(new Error('Audio context not ready'));
      }

      // iOS: Handle both suspended and interrupted AudioContext states
      if (audioContextRef.current.state === 'suspended' || (audioContextRef.current.state as string) === 'interrupted') {
        console.log(`[AUDIO DEBUG] AudioContext ${audioContextRef.current.state}, attempting to resume...`);
        try {
          await audioContextRef.current.resume();
          console.log('[AUDIO DEBUG] AudioContext resumed successfully, new state:', audioContextRef.current.state);
        } catch (error) {
          console.error('[AUDIO DEBUG] Failed to resume AudioContext:', error);
          
          // If resume fails and state is interrupted, try creating new AudioContext
          if ((audioContextRef.current.state as string) === 'interrupted') {
            console.log('[AUDIO DEBUG] Attempting to create new AudioContext due to interrupted state...');
            try {
              const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
              audioContextRef.current = new AudioContextClass();
              console.log('[AUDIO DEBUG] New AudioContext created, state:', audioContextRef.current.state);
              
              // Clear cache since we have a new AudioContext
              audioBufferCacheRef.current.clear();
              console.log('[AUDIO DEBUG] Audio buffer cache cleared for new AudioContext');
            } catch (newContextError) {
              console.error('[AUDIO DEBUG] Failed to create new AudioContext:', newContextError);
              return reject(new Error('Failed to create new AudioContext'));
            }
          } else {
            return reject(new Error('Failed to resume AudioContext'));
          }
        }
      }

      // Additional check: ensure AudioContext is in running state
      if (audioContextRef.current.state !== 'running') {
        console.error(`[AUDIO DEBUG] AudioContext not in running state: ${audioContextRef.current.state}`);
        return reject(new Error(`AudioContext not in running state: ${audioContextRef.current.state}`));
      }

      try {
        const audioBuffer = await loadAudioBuffer(audioFile);
        
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = loop;
        
        // iOS Safari: More robust audio connection
        const gainNode = audioContextRef.current.createGain();
        gainNode.gain.value = 1.0;
        
        // Connect source -> gain -> destination
        source.connect(gainNode);
        gainNode.connect(audioContextRef.current.destination);
        
        console.log(`[AUDIO DEBUG] Audio nodes connected, buffer duration: ${audioBuffer.duration}s`);
        console.log(`[AUDIO DEBUG] AudioContext currentTime: ${audioContextRef.current.currentTime}`);
        console.log(`[AUDIO DEBUG] Starting audio playback: ${audioFile}`);
        
        // iOS Safari: Add event listeners before starting
        let hasEnded = false;
        source.onended = () => {
          console.log(`[AUDIO DEBUG] Audio playback ended: ${audioFile}`);
          hasEnded = true;
          if (!loop) {
            resolve(source);
          }
        };
        
        // iOS Safari: Start playback
        try {
          source.start(0);
          console.log(`[AUDIO DEBUG] source.start(0) called successfully for: ${audioFile}`);
          
          if (loop) {
            resolve(source); // For looping audio, resolve immediately
          } else {
            // For non-looping audio, add a timeout fallback in case onended doesn't fire
            setTimeout(() => {
              if (!hasEnded) {
                console.log(`[AUDIO DEBUG] Audio timeout fallback for: ${audioFile} (duration: ${audioBuffer.duration}s)`);
                resolve(source);
              }
            }, (audioBuffer.duration + 1) * 1000); // Buffer duration + 1 second
          }
        } catch (startError) {
          console.error(`[AUDIO DEBUG] Failed to start audio source for ${audioFile}:`, startError);
          reject(new Error(`Failed to start audio source: ${startError.message}`));
        }
      } catch (error) {
        console.error(`[AUDIO DEBUG] Failed to load/play audio file: ${audioFile}`, error);
        
        // Fallback: Try to continue game without this specific audio
        console.log(`[AUDIO DEBUG] Attempting fallback for failed audio: ${audioFile}`);
        
        // Create a silent audio source as fallback
        try {
          const silentBuffer = audioContextRef.current.createBuffer(1, 1, 22050);
          const silentSource = audioContextRef.current.createBufferSource();
          silentSource.buffer = silentBuffer;
          silentSource.connect(audioContextRef.current.destination);
          silentSource.start(0);
          
          console.log(`[AUDIO DEBUG] Using silent fallback for: ${audioFile}`);
          resolve(silentSource);
        } catch (fallbackError) {
          console.error(`[AUDIO DEBUG] Even fallback failed for: ${audioFile}`, fallbackError);
          reject(error);
        }
      }
    });
  };

  const playRadioChatter = async (audioFile: string) => {
    if (radioChatterSourceRef.current) {
      radioChatterSourceRef.current.stop();
    }
    radioChatterSourceRef.current = await playAudio(audioFile, true);
  };

  const startGame = async () => {
    console.log('[AUDIO DEBUG] Starting game...');
    console.log('[AUDIO DEBUG] AudioContext state before game start:', audioContextRef.current?.state);
    console.log('[AUDIO DEBUG] Audio initialized before game start:', isAudioInitialized);
    
    setGameState('playing');
    setScore(0);
    setTimeLeft(300);
    
    // iOS Safari: Play audio immediately after user gesture to maintain context
    try {
      console.log('[AUDIO DEBUG] Playing call-connect.mp3 immediately after user gesture...');
      await playAudio('call-connect.mp3');
      console.log('[AUDIO DEBUG] call-connect.mp3 played successfully');
      startNextCall();
    } catch (error) {
      console.error('[AUDIO DEBUG] Failed to play call-connect.mp3:', error);
      // Continue with the game even if the connect sound fails
      startNextCall();
    }
  };

  const startNextCall = () => {
    const availableCalls = allCalls.filter(call => call.id !== currentCall?.id);
    const nextCall = availableCalls[Math.floor(Math.random() * availableCalls.length)];
    console.log(`[AUDIO DEBUG] Starting next call: ${nextCall.audioFile}`);
    setCurrentCall(nextCall);
    setTimeout(async () => {
      try {
        await playAudio(nextCall.audioFile);
        console.log(`[AUDIO DEBUG] Call audio played successfully: ${nextCall.audioFile}`);
      } catch (error) {
        console.error(`[AUDIO DEBUG] Failed to play call audio: ${nextCall.audioFile}`, error);
      }
      setIsDispatching(false); // Allow dispatching once the new call audio starts
    }, 1000);
  };

  const handleDispatch = async (dispatch: 'police' | 'fire' | 'ems' | 'prank') => {
    if (!currentCall || isDispatching) return;

    setIsDispatching(true);
    const isCorrect = dispatch === currentCall.correctDispatch;

    if (isCorrect) {
      setScore(prev => prev + 1);
      setIncorrectStreak(0);
      setHint(null);
      await playAudio('success-sound.mp3');
      if (!tutorialPlayed.success) {
        await playAudio('success-tutorial.mp3');
        setTutorialPlayed(prev => ({ ...prev, success: true }));
      }
    } else {
      setScore(prev => prev - 1);
      const newStreak = incorrectStreak + 1;
      setIncorrectStreak(newStreak);
      await playAudio('failure-sound.mp3');
      if (!tutorialPlayed.failure) {
        await playAudio('failure-tutorial.mp3');
        setTutorialPlayed(prev => ({ ...prev, failure: true }));
      }
      if (newStreak >= 3) {
        setHint(currentCall.correctDispatch);
      }
    }

    startNextCall();
  };

  const handleScreenTap = async (event: React.MouseEvent | React.TouchEvent) => {
    // Prevent default to avoid iOS Safari issues
    event.preventDefault();
    
    console.log(`[AUDIO DEBUG] Screen tap detected, gameState: ${gameState}`);
    console.log(`[AUDIO DEBUG] User agent:`, navigator.userAgent);
    console.log(`[AUDIO DEBUG] Current isAudioInitialized:`, isAudioInitialized);
    
    // Create and resume AudioContext on the first user interaction
    if (gameState === 'waiting') {
      console.log('[AUDIO DEBUG] Initializing audio for game start...');
      
      // iOS-specific initialization - do this synchronously to maintain user gesture context
      const audioInitialized = await initializeAudioContext();
      console.log('[AUDIO DEBUG] initializeAudioContext returned:', audioInitialized);
      
      if (!audioInitialized) {
        console.error('[AUDIO DEBUG] Failed to initialize audio, starting game without audio');
      }
      
      // Start game immediately to maintain iOS Safari user gesture context
      console.log('[AUDIO DEBUG] Starting game immediately to maintain user gesture context...');
      startGame();
      return; // Exit early after starting the game
    }

    if (gameState === 'playing') {
      // Ensure audio context is still running (iOS can suspend it)
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        console.log('[AUDIO DEBUG] AudioContext suspended during gameplay, resuming...');
        try {
          await audioContextRef.current.resume();
        } catch (error) {
          console.error('[AUDIO DEBUG] Failed to resume AudioContext during gameplay:', error);
        }
      }

      let tapX, tapY;

      if ('touches' in event && event.touches.length > 0) {
        // Fix: Access the first touch point correctly
        tapX = event.touches[0].clientX;
        tapY = event.touches[0].clientY;
        console.log(`[AUDIO DEBUG] Touch detected at: ${tapX}, ${tapY}`);
      } else {
        tapX = (event as React.MouseEvent).clientX;
        tapY = (event as React.MouseEvent).clientY;
        console.log(`[AUDIO DEBUG] Mouse click detected at: ${tapX}, ${tapY}`);
      }

      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      const isTopHalf = tapY < screenHeight / 2;
      const isLeftHalf = tapX < screenWidth / 2;

      let dispatch: 'police' | 'fire' | 'ems' | 'prank';
      if (isTopHalf && isLeftHalf) {
        dispatch = 'police';
      } else if (isTopHalf && !isLeftHalf) {
        dispatch = 'fire';
      } else if (!isTopHalf && isLeftHalf) {
        dispatch = 'ems';
      } else {
        dispatch = 'prank';
      }
      
      console.log(`[AUDIO DEBUG] Dispatching: ${dispatch}`);
      handleDispatch(dispatch);
    } else { // gameState === 'ended'
      console.log('[AUDIO DEBUG] Game ended, resetting to waiting state');
      setGameState('waiting');
      setIsAudioInitialized(false); // Reset audio initialization for next game
    }
  };

  return (
    <main
      onClick={handleScreenTap}
      onTouchStart={handleScreenTap}
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: 'black',
        color: 'white',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      {gameState === 'waiting' && (
        <div>
          <h1>Blind Dispatch</h1>
          <p>Tap anywhere to start your shift.</p>
        </div>
      )}
      {gameState === 'playing' && (
        <div>
          {hint && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: '4rem',
              opacity: 0.2,
              animation: 'fadeInOut 2s ease-in-out infinite'
            }}>
              {hint === 'police' && '👮'}
              {hint === 'fire' && '🔥'}
              {hint === 'ems' && '🚑'}
              {hint === 'prank' && '😜'}
            </div>
          )}
        </div>
      )}
      {gameState === 'ended' && (
        <div>
          <h1>Shift Over</h1>
          <p>Your final score: {score}</p>
          <p>Tap to play again.</p>
        </div>
      )}
    </main>
  );
}
