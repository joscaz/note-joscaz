import { Suspense, useState, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Piano, type PianoHandle } from './Piano';
import { FallingBars } from './FallingBars';
import { Particles } from './Particles';
import { PostFX } from './PostFX';
import type { InstrumentType } from '../../utils/noteColors';
import type { NoteEvent } from '../../services/audioEngine';

interface SceneProps {
  instrument: InstrumentType;
  notes: readonly NoteEvent[];
  scrollSpeed: number;
}

function CameraController({ pianoHandle }: { pianoHandle: PianoHandle | null }) {
  const { camera, size } = useThree();

  useEffect(() => {
    if (!pianoHandle || size.width === 0 || size.height === 0) return;
    const aspect = size.width / size.height;
    
    const targetWidth = pianoHandle.modelWidth * 1.01; // tight crop
    const targetHeight = targetWidth / aspect;

    const orthoCam = camera as any;
    if (orthoCam.isOrthographicCamera) {
      orthoCam.zoom = size.width / targetWidth;
    }

    // Synthesia/Rousseau style: looking mostly straight on, slightly downward.
    // A higher angle (40 degrees) shows more of the top surface of the keys,
    // giving them their realistic long length without perspective slant (due to ortho camera).
    const tiltAngle = 40 * Math.PI / 180;
    
    // To place the piano near the bottom of the screen, we look "above" the piano.
    // The total height of the view is targetHeight. We shift the camera up by ~35% of the height.
    const offsetY = targetHeight * 0.35;
    // We must keep distance < 18 to prevent the scene's fog from completely hiding the piano!
    const distance = 12; 
    
    const centerX = pianoHandle.modelCenterX;

    // Position the camera relative to this new target
    camera.position.set(
      centerX, 
      offsetY + distance * Math.sin(tiltAngle), 
      distance * Math.cos(tiltAngle)
    );
    camera.lookAt(centerX, offsetY, 0);
    camera.updateProjectionMatrix();
  }, [pianoHandle, size, camera]);

  return null;
}

/**
 * Top-level r3f scene. Camera is intentionally locked (cinematic Rousseau
 * framing); orbit controls are not mounted by default.
 */
export function Scene({ instrument, notes, scrollSpeed }: SceneProps) {
  const [pianoHandle, setPianoHandle] = useState<PianoHandle | null>(null);

  return (
    <Canvas
      orthographic
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 20, 100], near: 0.1, far: 500 }}
      shadows
    >
      <CameraController pianoHandle={pianoHandle} />
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

      {pianoHandle && (
        <Particles pianoHandle={pianoHandle} instrument={instrument} />
      )}

      <PostFX />
    </Canvas>
  );
}
