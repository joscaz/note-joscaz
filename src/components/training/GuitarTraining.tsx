import {
  Callout,
  Code,
  CodeBlock,
  H3,
  List,
  OrderedList,
  P,
  Section,
  StatRow,
  Strong,
} from './Prose';

/**
 * Fine-tuning log for the guitar model. The architecture and framework are
 * inherited from the O&V piano model (see PianoTraining.tsx). What's new here
 * is the dataset (GuitarSet, ~360 recordings), pitch augmentation, and a
 * carefully chosen low learning rate so the pretrained piano weights aren't
 * overwritten.
 */
export function GuitarTraining() {
  return (
    <div id="guitar" className="max-w-5xl mx-auto px-6 md:px-10">
      <Section
        id="guitar-overview"
        eyebrow="Guitar · Overview"
        title="Piano weights, fine-tuned on 360 guitar recordings."
        accent="guitar"
      >
        <P>
          The guitar model doesn't retrain from scratch. It <Strong>starts
          from the pretrained piano checkpoint</Strong> and fine-tunes on{' '}
          <a
            className="underline decoration-dotted hover:text-text text-guitar"
            href="https://guitarset.weebly.com/"
            target="_blank"
            rel="noreferrer"
          >
            GuitarSet
          </a>{' '}
          for a couple of thousand steps. The assumption is simple: piano and
          guitar produce very different timbres, but the <em>idea</em> of
          "something transient is happening at pitch X right now" is a shared
          acoustic concept. The learned feature extractors transfer; only the
          final layers need to adapt.
        </P>

        <StatRow
          items={[
            { label: 'Pretrained', value: 'piano' },
            { label: 'Dataset', value: 'GuitarSet' },
            { label: 'Best step', value: '2000' },
            { label: 'Val loss', value: '0.0449' },
          ]}
        />

        <P>
          Fine-tuning converges ~5× faster than training from scratch:{' '}
          <Code>val_loss = 0.0449</Code> at step 2,000 with transfer vs.{' '}
          <Code>0.0593</Code> at step 10,500 from random init on the same
          config. All the scaffolding below — preprocessing, training loop,
          inference — was written for this project to plug into the original
          O&amp;V code.
        </P>

        <Callout variant="guitar" title="Same architecture, different data">
          The network definition is literally <Code>OnsetsAndVelocities</Code>{' '}
          from <Code>ov_piano/models/ov.py</Code>. Keeping the shapes
          identical is what lets the piano checkpoint load with{' '}
          <Code>strict=True</Code> and no surgery.
        </Callout>
      </Section>

      <Section
        id="guitar-data"
        eyebrow="Data"
        title="GuitarSet: 360 recordings, ×5 pitch-shifted."
        accent="guitar"
      >
        <P>
          GuitarSet ships ~360 short solo guitar recordings with per-string
          MIDI-style annotations in the{' '}
          <a
            className="underline decoration-dotted hover:text-text text-guitar"
            href="https://jams.readthedocs.io/"
            target="_blank"
            rel="noreferrer"
          >
            JAMS
          </a>{' '}
          format. That's a tiny dataset by deep-learning standards. To stretch
          it, every recording is processed at five pitch offsets:
        </P>

        <CodeBlock
          language="python"
          code={`AUGMENT_PITCH_SHIFTS: List[int] = (0, -1, 1, -2, 2)
# 0  = original
# ±1, ±2 = shifted up/down by one or two semitones
# → ~360 recordings × 5 = ~1,800 effective training samples`}
        />

        <H3>How the pitch shift actually works</H3>

        <P>
          Instead of running a proper time-stretching algorithm, preprocessing
          uses a <Strong>resample trick</Strong>: treat the audio as if it
          were recorded at a slightly different sample rate, then resample
          back down to 16 kHz. The net effect is that the signal plays faster
          (shorter, higher-pitched) or slower (longer, lower-pitched). The
          JAMS timestamps are scaled by the same factor so labels stay in
          sync.
        </P>

        <CodeBlock
          language="python"
          code={`# +1 semitone → factor ≈ 1.059 (slightly faster = slightly higher pitch)
speed_factor = 2 ** (semitone / 12.0)

# Resample from an imagined "higher" rate back to 16 kHz, dropping samples.
eff_sr    = int(TARGET_SR * speed_factor)
resampler = torchaudio.transforms.Resample(eff_sr, TARGET_SR)
wave_aug  = resampler(wave_orig)`}
        />

        <H3>JAMS → MIDI → piano roll</H3>

        <P>
          The label pipeline has one extra stage relative to piano. GuitarSet
          annotations live in JAMS, not MIDI, so we first convert each JAMS
          file into a temporary MIDI on disk and then run the same{' '}
          <Code>MidiToPianoRoll</Code> converter the piano pipeline uses.
          Crucially, <Code>MIDI_SUS_EXTEND</Code> is forced to{' '}
          <Code>False</Code> — guitars have no sustain pedal, so no note is
          ever allowed to bleed beyond its notated offset.
        </P>

        <P>
          Finally, when a pitch shift is non-zero we also roll the piano-roll
          matrix rows by the same number of semitones. Notes shifted off the
          88-key range are just discarded:
        </P>

        <CodeBlock
          language="python"
          code={`def shift_roll(r, shift):
    new_r = np.zeros_like(r)
    if shift > 0:
        new_r[shift:, :] = r[:-shift, :]
    elif shift < 0:
        new_r[:shift, :] = r[-shift:, :]
    return new_r`}
        />
      </Section>

      <Section
        id="guitar-training"
        eyebrow="Fine-tuning loop"
        title="Low LR, short chunks, validate every 500 steps."
        accent="guitar"
      >
        <P>
          The training script mirrors the piano one, with three deliberate
          changes aimed at transfer learning:
        </P>

        <OrderedList>
          <li>
            <Strong>Lower peak LR.</Strong> <Code>LR_MAX = 0.001</Code> instead
            of the piano run's <Code>0.008</Code>. Starting with the piano
            weights and hammering them with an 8× higher LR would erase the
            pretrained features. Fine-tuning wants a gentle touch.
          </li>
          <li>
            <Strong>Shorter chunks.</Strong> <Code>TRAIN_BATCH_SECS = 3.0</Code>{' '}
            and <Code>TRAIN_BS = 16</Code>. GuitarSet recordings are short
            licks; longer chunks would mostly be silence or repetition.
          </li>
          <li>
            <Strong>File-level split, not frame-level.</Strong> 80% of
            recordings go to train, 20% to validation. The model never
            indirectly sees validation audio through overlapping training
            chunks.
          </li>
        </OrderedList>

        <CodeBlock
          language="python"
          code={`@dataclass
class ConfDef:
    SNAPSHOT_INPATH: Optional[str] = None   # ← point at piano checkpoint

    TRAIN_BS: int           = 16
    TRAIN_BATCH_SECS: float = 3.0
    CONV1X1: List[int]      = (200, 200)    # must match piano

    LR_MAX: float        = 0.001            # 8× smaller than piano run
    LR_PERIOD: int       = 1000
    LR_DECAY: float      = 0.98
    DROPOUT: float       = 0.2
    WEIGHT_DECAY: float  = 0.0003

    ONSET_POSITIVES_WEIGHT: float = 8.0
    VEL_LOSS_LAMBDA: float        = 10.0
    TRAINABLE_ONSETS: bool        = True    # fine-tune full model

    NUM_EPOCHS: int = 20
    XV_EVERY: int   = 500`}
        />

        <H3>Loading the piano weights</H3>

        <P>
          Because the two models share <em>exactly</em> the same architecture,
          weight loading is a one-liner and no key-renaming is required:
        </P>

        <CodeBlock
          language="python"
          code={`model = OnsetsAndVelocities(
    in_chans=2, in_height=229, out_height=88,
    conv1x1head=CONF.CONV1X1,
    bn_momentum=CONF.BATCH_NORM,
    leaky_relu_slope=CONF.LEAKY_RELU_SLOPE,
    dropout_drop_p=CONF.DROPOUT,
).to(CONF.DEVICE)

if CONF.SNAPSHOT_INPATH is not None:
    # Transfer learning: overwrite the random init with piano weights.
    load_model(model, CONF.SNAPSHOT_INPATH, eval_phase=False)`}
        />

        <H3>Loss: the same triple-onset trick, validated on held-out files</H3>

        <P>
          Both the training step and the validation pass use the piano model's
          "triple onset spreading" to absorb ±1 frame timing error (see the
          piano section above). Validation uses full-length recordings rather
          than random chunks, so the held-out loss reflects performance on
          complete playing passages, not just lucky snippets.
        </P>

        <Callout variant="guitar" title="Why only loss-based validation?">
          A proper F1 validation would require re-opening the original JAMS
          files from the HDF5 metadata during training. Doable, but the
          scaffolding cost wasn't worth it for fine-tuning: loss on held-out
          files correlated well with downstream transcription quality, and
          that's what actually picks the best checkpoint.
        </Callout>
      </Section>

      <Section
        id="guitar-inference"
        eyebrow="Inference"
        title="Peak-pick, squeeze out squeaks, 'smart sustain'."
        accent="guitar"
      >
        <P>
          The inference script turns raw audio into a playable <Code>.mid</Code>{' '}
          file in four steps. Nothing fancy, but each step has a reason.
        </P>

        <OrderedList>
          <li>
            <Strong>Load + resample.</Strong> WAV goes straight through
            torchaudio. MP3 is shelled out to ffmpeg first — torchaudio's MP3
            backend is flaky across platforms and we don't want a surprise on
            the user's machine.
          </li>
          <li>
            <Strong>Spectrogram → model.</Strong> Same{' '}
            <Code>TorchWavToLogmel(16000, 2048, 384, 229, 50, 8000)</Code> as
            during training. The model returns three onset stages; we only use
            the last, most-refined one.
          </li>
          <li>
            <Strong>Peak picking.</Strong> For each of the 88 pitches, keep
            frames where onset probability is above{' '}
            <Code>ONSET_THRESHOLD = 0.5</Code> <em>and</em> strictly greater
            than both neighbors. This collapses the broad probability bumps
            the network tends to emit into single, crisp onsets.
          </li>
          <li>
            <Strong>Smart sustain + squeak removal.</Strong> Every note is
            held until the next onset on the same pitch, capped at 2 seconds.
            Anything shorter than 50 ms is discarded as string buzz / fret
            noise / model false positive.
          </li>
        </OrderedList>

        <CodeBlock
          language="python"
          code={`# Peak picking per pitch
for t in np.where(onsets[k] > ONSET_THRESHOLD)[0]:
    val = onsets[k, t]
    if t > 0            and onsets[k, t-1] >= val: continue  # not a local max
    if t < num_frames-1 and onsets[k, t+1] >= val: continue
    valid_onsets.append(t)

# Smart-sustain duration = gap to next onset, capped at 2 s
for i, t in enumerate(valid_onsets):
    next_t  = valid_onsets[i+1] if i+1 < len(valid_onsets) else t + max_frames
    dur     = min(next_t - t, max_frames)
    if dur * seconds_per_frame < MIN_DURATION:   # < 50 ms → squeak, skip
        continue
    write_note_on(t, k, vel=int(velocities[k, t] * 127))
    write_note_off(t + dur, k)`}
        />

        <Callout variant="guitar" title="Program 25 = Acoustic Guitar (Steel)">
          The exported MIDI carries GM program 25 so that downstream DAWs and
          piano-roll viewers play the file with an acoustic-guitar soundfont
          by default, even though under the hood the note grid is piano-style.
        </Callout>
      </Section>

      <Section
        id="guitar-limitations"
        eyebrow="Limitations"
        title="One laptop, one very hot afternoon."
        accent="guitar"
      >
        <P>
          The honest caveat: this fine-tuning run was done on a{' '}
          <Strong>personal MacBook Pro (M1 Pro)</Strong>. No cloud GPU, no
          training cluster — just Apple Silicon running flat out on battery
          power. It worked, but it wasn't a great time.
        </P>

        <List>
          <li>
            <Strong>~15+ hours</Strong> of wall-clock training for the full
            fine-tuning run. My laptop was essentially unusable for anything
            else during that window.
          </li>
          <li>
            <Strong>Sustained thermal throttling.</Strong> The chassis got hot
            enough that macOS was throttling the SoC for large stretches of
            the run, which means the effective compute was well below what
            the M1 Pro can do when properly cooled. Translation: the final{' '}
            <Code>val_loss = 0.0449</Code> checkpoint almost certainly isn't
            the best a longer or better-cooled run could produce.
          </li>
          <li>
            <Strong>Memory-bound batch size.</Strong> <Code>TRAIN_BS = 16</Code>{' '}
            was chosen partly for the transfer-learning reasons above and
            partly because anything larger wouldn't fit comfortably in unified
            memory alongside Chrome and an IDE. A bigger batch on bigger
            hardware would smooth out the gradient noise and likely help
            convergence.
          </li>
          <li>
            <Strong>No full F1 validation.</Strong> As noted earlier, the
            cross-validation loop only tracks held-out loss, not note-level
            F1. It correlates well, but it's not the same metric the piano
            paper reports, so the numbers here aren't directly comparable.
          </li>
          <li>
            <Strong>ONNX export is a feature-subset of the real model.</Strong>{' '}
            The in-browser model is an ONNX export of the PyTorch checkpoint.
            Export flattens a few custom pieces (padding modes, the last
            onset-stage selection) which means the browser predictions can
            drift very slightly from what the original <Code>.torch</Code>{' '}
            file would output in Python.
          </li>
        </List>
      </Section>

      <Section
        id="guitar-future"
        eyebrow="Future work"
        title="Better hardware, native weights, maybe a backend."
        accent="guitar"
      >
        <List>
          <li>
            <Strong>Another training iteration on proper hardware.</Strong> A
            cloud GPU (or at minimum a desktop with active cooling) should
            let the run finish in a fraction of the time, enable a larger
            batch size, and — most importantly — keep the chip off the thermal
            ceiling. I expect a non-trivial jump in val loss and in
            transcription quality, especially for fast passages where the
            current model occasionally misses closely-spaced onsets.
          </li>
          <li>
            <Strong>Ship the raw <Code>.torch</Code> via a small backend.</Strong>{' '}
            The long-term plan is to stand up a thin inference service that
            loads the exact same PyTorch checkpoint the training loop saves,
            instead of the ONNX export the browser uses today. That removes
            the "feature-subset" caveat above, unlocks batched inference for
            longer files, and makes swapping in new checkpoints a one-line
            deploy rather than a re-export.
          </li>
          <li>
            <Strong>Proper F1-based validation.</Strong> Re-hydrate the JAMS
            files from HDF5 metadata during the cross-validation pass so each
            checkpoint can be scored with the same precision/recall/F1 metric
            the piano paper uses. That lets me compare apples-to-apples across
            runs and pick checkpoints on the metric I actually care about.
          </li>
          <li>
            <Strong>Explore more aggressive augmentation.</Strong> Pitch-shift
            ±2 semitones helps, but GuitarSet also contains a lot of
            single-style playing. Adding some mild impulse-response convolution
            (room reverb, amp cabs) during training should make the model more
            robust to the amateur recordings users will actually upload.
          </li>
        </List>
      </Section>

      <Section
        id="guitar-reflections"
        eyebrow="What I learned"
        title="Transfer learning is the cheat code."
        accent="guitar"
      >
        <List>
          <li>
            Transfer learning pays off <em>massively</em> when the source task
            shares low-level physics with the target task. Onset detection is
            essentially "find sharp transients at pitch X" — identical for
            piano and guitar once you squint at the spectrogram.
          </li>
          <li>
            Architectural conservatism beats cleverness when you're fine-tuning.
            Leaving <Code>CONV1X1</Code>, <Code>DROPOUT</Code>,{' '}
            <Code>BATCH_NORM</Code>, and input shapes untouched meant{' '}
            <Code>load_model(strict=True)</Code> just worked — no missing-key
            gymnastics.
          </li>
          <li>
            Pitch augmentation via resampling is an almost-free way to multiply
            a small dataset. You don't need a fancy time-stretching library;
            abusing <Code>torchaudio.transforms.Resample</Code> is perfectly
            fine for ±2 semitones.
          </li>
          <li>
            The post-processing (peak picking, squeak removal, smart sustain)
            is where guitars stop sounding like pianos. The network is
            instrument-agnostic; the MIDI writer is where guitar-specific
            musical taste lives.
          </li>
        </List>
      </Section>
    </div>
  );
}
