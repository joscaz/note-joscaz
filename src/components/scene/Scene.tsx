import { Suspense, useState, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Piano, type PianoHandle } from './Piano';
import { FallingBars } from './FallingBars';
import { Particles } from './Particles';
import { PostFX } from './PostFX';
import type { InstrumentType } from '../../utils/noteColors';
import type { NoteEvent } from '../../services/audioEngine';
import { useThemeStore } from '../../services/themeStore';

interface SceneProps {
  instrument: InstrumentType;
  notes: readonly NoteEvent[];
  scrollSpeed: number;
  frameloop?: 'always' | 'demand' | 'never';
}

function CameraController({ pianoHandle }: { pianoHandle: PianoHandle | null }) {
  const { camera, size } = useThree();
  const cam = useThemeStore((s) => s.theme.camera);

  useEffect(() => {
    if (!pianoHandle || size.width === 0 || size.height === 0) return;
    const aspect = size.width / size.height;

    const targetWidth = pianoHandle.modelWidth * 1.01;
    const targetHeight = targetWidth / aspect;

    const orthoCam = camera as any;
    if (orthoCam.isOrthographicCamera) {
      orthoCam.zoom = size.width / targetWidth;
    }

    const tiltAngle = cam.tiltDeg * Math.PI / 180;
    const offsetY = targetHeight * cam.offsetYFrac;
    const distance = cam.distance;
    const centerX = pianoHandle.modelCenterX;

    camera.position.set(
      centerX,
      offsetY + distance * Math.sin(tiltAngle),
      distance * Math.cos(tiltAngle),
    );
    camera.lookAt(centerX, offsetY, 0);
    camera.updateProjectionMatrix();
  }, [pianoHandle, size, camera, cam.tiltDeg, cam.distance, cam.offsetYFrac]);

  return null;
}

/**
 * Top-level r3f scene. Camera is intentionally locked (cinematic Rousseau
 * framing); orbit controls are not mounted by default.
 */
export function Scene({ instrument, notes, scrollSpeed, frameloop = 'always' }: SceneProps) {
  const [pianoHandle, setPianoHandle] = useState<PianoHandle | null>(null);
  const background = useThemeStore((s) => s.theme.background);
  const fog = useThemeStore((s) => s.theme.fog);
  const effectiveDpr = Math.min(window.devicePixelRatio, 1.5);

  return (
    <Canvas
      orthographic
      frameloop={frameloop}
      dpr={[1, 1.5]}
      gl={{ antialias: effectiveDpr < 2, powerPreference: 'default' }}
      camera={{ position: [0, 20, 100], near: 0.1, far: 500 }}
      shadows
    >
      <CameraController pianoHandle={pianoHandle} />
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[fog.color, fog.near, fog.far]} />

      <ambientLight intensity={0.35} />
      <directionalLight
        position={[4, 8, 6]}
        intensity={0.9}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-6, 4, -4]} intensity={0.3} color="#6aa9ff" />

      <Suspense fallback={null}>
        <Piano instrument={instrument} onReady={setPianoHandle} />
      </Suspense>

      {pianoHandle && notes.length > 0 && (
        <FallingBars
          notes={notes}
          pianoHandle={pianoHandle}
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
