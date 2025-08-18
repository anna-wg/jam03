'use client'

import { useState, useEffect, useRef } from 'react';
import { getAssetPath } from '../lib/utils';

export default () => {
  const [victimPosition, setVictimPosition] = useState({ x: 0, y: 0 });
  const [hasWon, setHasWon] = useState(false);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const audioContextRef = useRef(null);
  const audioBufferRef = useRef(null);
  const winThreshold = 50; // 50 pixels

  const resetGame = () => {
    const newX = Math.random() * window.innerWidth;
    const newY = Math.random() * window.innerHeight;
    setVictimPosition({ x: newX, y: newY });
    setHasWon(false);
  };

  useEffect(() => {
    resetGame();
  }, []);

  const initAudio = async () => {
    if (isAudioReady) return;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioContext;

    const audioPath = getAssetPath('/audio/victim.mp3');
    const response = await fetch(audioPath);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    audioBufferRef.current = audioBuffer;
    setIsAudioReady(true);
  };

  const handleTap = async (event) => {
    if (hasWon) return;

    if (!isAudioReady) {
      await initAudio();
    }
    
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    let tapX, tapY;
    if (event.touches) {
      tapX = event.touches.clientX;
      tapY = event.touches.clientY;
    } else {
      tapX = event.clientX;
      tapY = event.clientY;
    }

    const distance = Math.sqrt(
      Math.pow(tapX - victimPosition.x, 2) +
      Math.pow(tapY - victimPosition.y, 2)
    );

    if (distance < winThreshold) {
      setHasWon(true);
      return;
    }

    const pan = (tapX - victimPosition.x) / (window.innerWidth / 2);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;

    const panner = audioContextRef.current.createStereoPanner();
    panner.pan.value = pan;

    const gainNode = audioContextRef.current.createGain();
    const maxDistance = Math.sqrt(Math.pow(window.innerWidth, 2) + Math.pow(window.innerHeight, 2));
    gainNode.gain.value = 1 - (distance / maxDistance);

    source.connect(panner).connect(gainNode).connect(audioContextRef.current.destination);
    source.start(0);
  };

  return (
    <main onClick={handleTap} onTouchStart={handleTap} style={{ position: 'relative', cursor: 'pointer', height: '100vh', width: '100vw' }}>
      {!isAudioReady && <div style={{ color: 'white', textAlign: 'center', paddingTop: '50vh' }}>Click to start</div>}
      {hasWon && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: 'white'
        }}>
          <h1>You found the victim!</h1>
          <button onClick={(e) => {
            e.stopPropagation();
            resetGame();
          }} style={{
            marginTop: '20px',
            padding: '10px 20px',
            fontSize: '16px',
            cursor: 'pointer'
          }}>
            Play Again
          </button>
        </div>
      )}
    </main>
  );
}
