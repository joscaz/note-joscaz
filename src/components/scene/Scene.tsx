import { Suspense, useState, useEffect, useRef } from 'react';
import { Canvas, useThree, useStore } from '@react-three/fiber';
import type { RootStore } from '@react-three/fiber';
import { Piano, type PianoHandle } from './Piano';
import { FallingBars } from './FallingBars';
import { Particles } from './Particles';
import { PostFX } from './PostFX';
import type { InstrumentType } from '../../utils/noteColors';
import type { NoteEvent } from '../../services/audioEngine';
import { useThemeStore } from '../../services/themeStore';
import { useGraphicsStore } from '../../services/graphicsStore';

/**
 * Export-time graphics override (see design §4 / §7, exportRenderer.ts).
 * When present, Scene renders with THESE knobs instead of reading the live
 * useGraphicsStore — export always forces postFX + particles ON regardless
 * of the live thermal preset, and uses a fixed dpr=1 (resolution is already
 * pinned by the export preset's width/height, so device-pixel-ratio scaling
 * would just waste GPU work / blow past the target frame size).
 */
export interface ExportGraphicsOverride {
  enablePostFX: true;
  enableParticles: true;
  particlePoolSize: number;
}

interface SceneProps {
  instrument: InstrumentType;
  notes: readonly NoteEvent[];
  scrollSpeed: number;
  isPlaying: boolean;
  isVisible: boolean;
  /**
   * When set, Scene is in export/capture mode: frameloop is 'never' (driven
   * imperatively by exportRenderer via r3f's `advance()`), and postFX/
   * particles are forced from this override instead of the live store.
   */
  exportOverride?: ExportGraphicsOverride;
  /**
   * Forwards THIS canvas's r3f RootStore to the caller. exportRenderer needs
   * `store.getState()` to pass as `advance()`'s explicit `state` argument —
   * calling `advance(timestamp)` with no state argument would update EVERY
   * mounted r3f root (including the live on-screen Canvas), not just this
   * offscreen one. Also exposes `gl` (the WebGLRenderer / canvas to read
   * pixels back from) via the same state object.
   */
  onGlReady?: (store: RootStore) => void;
  /**
   * Fires once the Piano model/keys finish loading (Piano's own onReady,
   * surfaced here). The Piano loads via Suspense — async, GLTF — so the
   * FIRST advance() call must not happen before this fires, or the earliest
   * captured frames would show an empty scene (no piano, no bars, since
   * FallingBars/Particles only mount once pianoHandle is set).
   */
  onSceneReady?: () => void;
}

interface FrameDriverProps {
  isPlaying: boolean;
  isVisible: boolean;
  /** Export mode drives frames imperatively via advance() — the rAF/store-subscribe driver must stay fully inert. */
  exportMode: boolean;
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
function FrameDriver({ isPlaying, isVisible, exportMode }: FrameDriverProps) {
  const invalidate = useThree((s) => s.invalidate);
  const fpsCap = useGraphicsStore((s) => s.fpsCap);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);

  useEffect(() => {
    if (exportMode || !isVisible || !isPlaying) return;
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
  }, [isPlaying, isVisible, fpsCap, invalidate, exportMode]);

  // One-shot repaint while paused: any graphics or theme change paints
  // exactly one fresh frame instead of waiting for the (stopped) driver loop.
  // Skipped entirely in export mode — exportRenderer drives every frame
  // itself via advance(), and live-store churn during capture must not
  // sneak in an extra uncontrolled repaint.
  useEffect(() => {
    if (exportMode) return;
    const unsubGraphics = useGraphicsStore.subscribe(() => invalidate());
    const unsubTheme = useThemeStore.subscribe(() => invalidate());
    return () => {
      unsubGraphics();
      unsubTheme();
    };
  }, [invalidate, exportMode]);

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
function GlExporter({ onGlReady }: { onGlReady: (store: RootStore) => void }) {
  const store = useStore();
  useEffect(() => { onGlReady(store); }, [store, onGlReady]);
  return null;
}

export function Scene({ instrument, notes, scrollSpeed, isPlaying, isVisible, exportOverride, onGlReady, onSceneReady }: SceneProps) {
  const [pianoHandle, setPianoHandle] = useState<PianoHandle | null>(null);

  useEffect(() => {
    if (pianoHandle) onSceneReady?.();
  }, [pianoHandle, onSceneReady]);
  const background = useThemeStore((s) => s.theme.background);
  const fog = useThemeStore((s) => s.theme.fog);
  const liveDpr = useGraphicsStore((s) => s.dpr);
  const livePostFX = useGraphicsStore((s) => s.enablePostFX);
  const livePoolSize = useGraphicsStore((s) => s.particlePoolSize);

  const exportMode = exportOverride != null;
  // Export pins dpr=1: the target pixel size is already the export preset's
  // width/height (passed via the Canvas's CSS size), so any dpr>1 would
  // render a larger-than-requested framebuffer for no benefit.
  const dpr = exportMode ? 1 : liveDpr;
  const enablePostFX = exportMode ? exportOverride.enablePostFX : livePostFX;
  const particlePoolSize = exportMode ? exportOverride.particlePoolSize : livePoolSize;

  return (
    <Canvas
      orthographic
      frameloop={exportMode ? 'never' : 'demand'}
      dpr={dpr}
      // antialias is a create-time GL flag — it cannot change live once the
      // context exists (unlike dpr, which r3f's configure() applies live via
      // setDpr/setPixelRatio, see discovery #187). We pick `true` here: a
      // static, sensible default that keeps Low/Medium edges clean. The real
      // performance lever is `dpr` (and frameloop='demand'), not antialias.
      gl={{ antialias: true, powerPreference: 'default', preserveDrawingBuffer: exportMode }}
      camera={{ position: [0, 20, 100], near: 0.1, far: 500 }}
      shadows={false}
    >
      <FrameDriver isPlaying={isPlaying} isVisible={isVisible} exportMode={exportMode} />
      {onGlReady && <GlExporter onGlReady={onGlReady} />}
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
        <Particles
          pianoHandle={pianoHandle}
          instrument={instrument}
          notes={notes}
          forceEnabled={exportMode || undefined}
          forcePoolSize={exportMode ? particlePoolSize : undefined}
        />
      )}

      {enablePostFX && <PostFX />}
    </Canvas>
  );
}
