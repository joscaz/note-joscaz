import { Suspense, useState, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Piano, type PianoHandle } from './Piano';
import { FallingBars } from './FallingBars';
import { Particles } from './Particles';
import { PostFX } from './PostFX';
import type { InstrumentType } from '../../utils/noteColors';
import type { NoteEvent } from '../../services/audioEngine';
import { useThemeStore } from '../../services/themeStore';
import { useGraphicsStore } from '../../services/graphicsStore';

interface SceneProps {
  instrument: InstrumentType;
  notes: readonly NoteEvent[];
  scrollSpeed: number;
  isPlaying: boolean;
  isVisible: boolean;
}

interface FrameDriverProps {
  isPlaying: boolean;
  isVisible: boolean;
}

/**
 * Governs the demand-mode render cadence — the heart of the thermal fix.
 * Mounted INSIDE <Canvas> so it can reach r3f's `invalidate`. Two effects:
 *
 *  (a) rAF accumulator — while `isPlaying && isVisible`, requests one
 *      `invalidate()` every `1000/fpsCap` ms (fpsCap=0 ⇒ every rAF, i.e.
 *      uncapped/High). The accumulator self-corrects drift; a setTimeout
 *      loop would not. When either gate flips false, the effect cleanup
 *      cancels the rAF — the canvas then renders nothing until the next
 *      explicit invalidate, i.e. truly idle while paused.
 *
 *  (b) one-shot repaint — subscribes to BOTH graphicsStore and themeStore
 *      and fires a single `invalidate()` on any change (including
 *      `repaintBump`, the transient signal useAudioPlayer bumps on
 *      seek/pause). This is what makes preset/theme tweaks — and seeking
 *      while paused — show up immediately under demand mode.
 */
function FrameDriver({ isPlaying, isVisible }: FrameDriverProps) {
  const invalidate = useThree((s) => s.invalidate);
  const fpsCap = useGraphicsStore((s) => s.fpsCap);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);

  useEffect(() => {
    if (!isVisible || !isPlaying) return;
    const minInterval = fpsCap > 0 ? 1000 / fpsCap : 0; // 0 => invalidate every rAF (High/uncapped)
    const tick = (now: number) => {
      if (now - lastRef.current >= minInterval) {
        lastRef.current = now;
        invalidate();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isPlaying, isVisible, fpsCap, invalidate]);

  // One-shot repaint while paused: any graphics or theme change paints
  // exactly one fresh frame instead of waiting for the (stopped) driver loop.
  useEffect(() => {
    const unsubGraphics = useGraphicsStore.subscribe(() => invalidate());
    const unsubTheme = useThemeStore.subscribe(() => invalidate());
    return () => {
      unsubGraphics();
      unsubTheme();
    };
  }, [invalidate]);

  return null;
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
export function Scene({ instrument, notes, scrollSpeed, isPlaying, isVisible }: SceneProps) {
  const [pianoHandle, setPianoHandle] = useState<PianoHandle | null>(null);
  const background = useThemeStore((s) => s.theme.background);
  const fog = useThemeStore((s) => s.theme.fog);
  const dpr = useGraphicsStore((s) => s.dpr);
  const enablePostFX = useGraphicsStore((s) => s.enablePostFX);

  return (
    <Canvas
      orthographic
      frameloop="demand"
      dpr={dpr}
      // antialias is a create-time GL flag — it cannot change live once the
      // context exists (unlike dpr, which r3f's configure() applies live via
      // setDpr/setPixelRatio, see discovery #187). We pick `true` here: a
      // static, sensible default that keeps Low/Medium edges clean. The real
      // performance lever is `dpr` (and frameloop='demand'), not antialias.
      gl={{ antialias: true, powerPreference: 'default' }}
      camera={{ position: [0, 20, 100], near: 0.1, far: 500 }}
      shadows={false}
    >
      <FrameDriver isPlaying={isPlaying} isVisible={isVisible} />
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

      {enablePostFX && <PostFX />}
    </Canvas>
  );
}
