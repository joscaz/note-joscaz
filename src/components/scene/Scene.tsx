import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Piano, type PianoHandle } from './Piano';
import { FallingBars } from './FallingBars';
import { PostFX } from './PostFX';
import type { InstrumentType } from '../../utils/noteColors';
import type { NoteEvent } from '../../services/audioEngine';

interface SceneProps {
  instrument: InstrumentType;
  notes: readonly NoteEvent[];
  scrollSpeed: number;
}

/**
 * Top-level r3f scene. Camera is intentionally locked (cinematic Rousseau
 * framing); orbit controls are not mounted by default.
 */
export function Scene({ instrument, notes, scrollSpeed }: SceneProps) {
  const [pianoHandle, setPianoHandle] = useState<PianoHandle | null>(null);

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 5.5, 13], fov: 32, near: 0.1, far: 200 }}
      shadows
    >
      <color attach="background" args={['#05060a']} />
      <fog attach="fog" args={['#05060a', 18, 40]} />

      <ambientLight intensity={0.35} />
      <directionalLight
        position={[4, 8, 6]}
        intensity={0.9}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-6, 4, -4]} intensity={0.3} color="#6aa9ff" />

      <Suspense fallback={null}>
        <Piano instrument={instrument} onReady={setPianoHandle} />
      </Suspense>

      {pianoHandle && notes.length > 0 && (
        <FallingBars
          notes={notes}
          pianoHandle={pianoHandle}
          instrument={instrument}
          scrollSpeed={scrollSpeed}
        />
      )}

      <PostFX />
    </Canvas>
  );
}
