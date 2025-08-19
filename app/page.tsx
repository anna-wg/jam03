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
  { id: 4, audioFile: 'fire-call-2.mp3', correctDispatch: 'fire' },
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
  const audioContextRef = useRef<AudioContext | null>(null);
  const radioChatterSourceRef = useRef<AudioBufferSourceNode | null>(null);

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

  const playAudio = (audioFile: string, loop = false): Promise<AudioBufferSourceNode> => {
    return new Promise(async (resolve, reject) => {
      if (!audioContextRef.current) return reject('Audio context not ready');

      const audioPath = getAssetPath(`/audio/${audioFile}`);
      const response = await fetch(audioPath);
      if (!response.ok) {
        return reject(`Failed to fetch audio file: ${audioFile}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      
      try {
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = loop;
        source.connect(audioContextRef.current.destination);
        source.start(0);

        if (!loop) {
          source.onended = () => resolve(source);
        } else {
          resolve(source); // For looping audio, resolve immediately
        }
      } catch (error) {
        console.error(`Failed to decode audio file: ${audioFile}`, error);
        reject(error);
      }
    });
  };

  const playRadioChatter = async (audioFile: string) => {
    if (radioChatterSourceRef.current) {
      radioChatterSourceRef.current.stop();
    }
    radioChatterSourceRef.current = await playAudio(audioFile, true);
  };

  const startGame = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    // Resume audio context if it's suspended
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    console.log('Game starting...');
    setGameState('playing');
    setScore(0);
    setTimeLeft(300);
    playAudio('call-connect.mp3');
    startNextCall();
  };

  const startNextCall = () => {
    const availableCalls = allCalls.filter(call => call.id !== currentCall?.id);
    const nextCall = availableCalls[Math.floor(Math.random() * availableCalls.length)];
    setCurrentCall(nextCall);
    setTimeout(() => {
      playAudio(nextCall.audioFile);
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

  const handleScreenTap = (event) => {
    if (gameState === 'waiting') {
      startGame();
      return; // Exit early after starting the game
    }

    if (gameState === 'playing') {
      let tapX, tapY;
      if (event.touches) {
        tapX = event.touches.clientX;
        tapY = event.touches.clientY;
      } else {
        tapX = event.clientX;
        tapY = event.clientY;
      }

      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      const isTopHalf = tapY < screenHeight / 2;
      const isLeftHalf = tapX < screenWidth / 2;

      if (isTopHalf && isLeftHalf) {
        handleDispatch('police');
      } else if (isTopHalf && !isLeftHalf) {
        handleDispatch('fire');
      } else if (!isTopHalf && isLeftHalf) {
        handleDispatch('ems');
      } else {
        handleDispatch('prank');
      }
    } else { // gameState === 'ended'
      console.log('Restarting game...');
      setGameState('waiting');
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
