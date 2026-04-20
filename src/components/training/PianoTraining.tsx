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
 * Walk-through of the piano model's construction, adapted from the authors'
 * GitHub repo (`andres-fr/iamusica_training`) and the paper "Onsets and
 * Velocities" (arXiv:2303.04485, Fernandez 2023). This is the model NoteJoscaz
 * ships as-is for piano transcription.
 */
export function PianoTraining() {
  return (
    <div id="piano" className="max-w-5xl mx-auto px-6 md:px-10">
      <Section
        id="piano-overview"
        eyebrow="Piano · Overview"
        title="A tiny CNN that beats big models at piano transcription."
        accent="piano"
      >
        <P>
          The piano pipeline is not our work. It's an almost-literal port of
          the <em>Onsets &amp; Velocities</em> (O&amp;V) system by Andrés
          Fernández, Eulàlia Febrer Coll, and Joan Lluís Travé Pla, developed
          inside the IAMúsica project. The paper and training code are public,
          and the results are frankly surprising: at only{' '}
          <Strong>~260k parameters</Strong> it gets within striking distance of
          Google Magenta's Onsets-and-Frames on MAESTRO — while being small
          enough to run inside a browser tab.
        </P>

        <StatRow
          items={[
            { label: 'Params', value: '~260k' },
            { label: 'F1 · onsets', value: '0.968' },
            { label: 'F1 · ons+vel', value: '0.945' },
            { label: 'Dataset', value: 'MAESTROv3' },
          ]}
        />

        <P>
          Everything below is reconstructed from the{' '}
          <a
            className="underline decoration-dotted hover:text-text text-piano"
            href="https://github.com/andres-fr/iamusica_training/tree/master/ov_piano"
            target="_blank"
            rel="noreferrer"
          >
            iamusica_training/ov_piano
          </a>{' '}
          repo and the{' '}
          <a
            className="underline decoration-dotted hover:text-text text-piano"
            href="https://arxiv.org/abs/2303.04485"
            target="_blank"
            rel="noreferrer"
          >
            paper
          </a>
          . If you want the one-line takeaway: the model predicts{' '}
          <Strong>onsets</Strong> (when a note starts) and{' '}
          <Strong>velocities</Strong> (how hard it was struck) frame-by-frame
          from a log-mel spectrogram, and everything else — note durations,
          pedal, dynamics — is either derived downstream or intentionally
          ignored.
        </P>
      </Section>

      <Section
        id="piano-inputs"
        eyebrow="Inputs & representation"
        title="Audio becomes a 229-bin log-mel image."
        accent="piano"
      >
        <P>
          The model never sees raw audio. During preprocessing each WAV is
          resampled to 16 kHz mono, chopped into overlapping windows, and
          converted into a log-mel spectrogram: a picture where the x-axis is
          time, the y-axis is pitch-perceptual frequency, and brightness is
          energy in dB.
        </P>

        <CodeBlock
          language="python"
          code={`# from ov_piano preprocessing defaults
TARGET_SR     = 16_000   # resample to 16 kHz
STFT_WINSIZE  = 2048     # FFT window
STFT_HOPSIZE  = 384      # 384 / 16000 ≈ 24 ms / frame
MELBINS       = 229      # height of the spectrogram "image"
MEL_FMIN      = 50       # Hz — below this is mostly rumble
MEL_FMAX      = 8_000    # Hz — covers piano's highest partials`}
        />

        <P>
          A hop size of 384 samples means one spectrogram frame every{' '}
          <Code>384 / 16000 ≈ 24 ms</Code>. That's the model's temporal
          resolution ceiling — it can never localize a note onset more
          precisely than ±12 ms just from the input alone.
        </P>

        <Callout variant="piano" title="Why 229 mel bins?">
          229 is an unusual number — you normally see 80 or 128. It's a direct
          inheritance from Magenta's Onsets-and-Frames paper: three bins per
          semitone across the piano range plus generous headroom. The authors
          kept it to make benchmarks directly comparable.
        </Callout>

        <H3>Labels: piano rolls, not MIDI events</H3>

        <P>
          The MAESTRO annotations are MIDI files, but the network needs
          frame-aligned targets. A{' '}
          <a
            className="underline decoration-dotted hover:text-text text-piano"
            href="https://github.com/andres-fr/iamusica_training/blob/master/ov_piano/data/midi.py"
            target="_blank"
            rel="noreferrer"
          >
            <Code>MidiToPianoRoll</Code>
          </a>{' '}
          converter quantizes every MIDI event to the same 24 ms grid and
          emits two binary matrices:
        </P>

        <List>
          <li>
            <Strong>Onset roll</Strong> · shape <Code>(88, T)</Code> · ones
            only on the exact frame a key is pressed.
          </li>
          <li>
            <Strong>Frame roll</Strong> · shape <Code>(88, T)</Code> · ones
            for every frame the key remains held (used for the auxiliary
            velocity mask).
          </li>
          <li>
            Three extra rows for sustain, soft, and tenuto pedal. The velocity
            head ignores pedals — pedals are a piano-only concept and the
            guitar fork zeros them out.
          </li>
        </List>
      </Section>

      <Section
        id="piano-architecture"
        eyebrow="Architecture"
        title="Context-Aware Modules, stacked three times."
        accent="piano"
      >
        <P>
          The whole network fits in a single Python file (
          <Code>ov_piano/models/ov.py</Code>). Skipping the config boilerplate,
          it's three things glued together:
        </P>

        <OrderedList>
          <li>
            <Strong>Stem.</Strong> A stack of <em>Context-Aware Modules</em>{' '}
            (CAMs) — depthwise 2D convolutions with hybrid dilations and a
            squeeze-excite gate — that chew through the 229-bin mel image and
            collapse it to a 1D feature map along time. Think of CAMs as a
            wide-receptive-field replacement for a ResNet block.
          </li>
          <li>
            <Strong>Onset head, three stages.</Strong> Each stage is another
            CAM pile plus a <Code>conv1x1</Code> MLP, independently supervised.
            The design is residual: stage <em>n+1</em> refines the predictions
            of stage <em>n</em>. At inference only the last stage is used.
          </li>
          <li>
            <Strong>Velocity head.</Strong> A smaller stage that only has to
            answer "how loud?" at frames where the onset head already fired.
            Training masks its loss so it never wastes capacity learning to
            predict velocity on silent frames.
          </li>
        </OrderedList>

        <Callout variant="piano" title="The 2-channel trick">
          The first input channel is the log-mel spectrogram. The second
          channel is its <em>first-order time derivative</em>. Onsets are
          transients — sharp local changes — so feeding the network the delta
          alongside the raw spectrogram makes onset detection dramatically
          easier. It also costs just one extra subtract per frame.
        </Callout>
      </Section>

      <Section
        id="piano-training"
        eyebrow="Training"
        title="40 5-second chunks per step, AdamWR, warm restarts."
        accent="piano"
      >
        <P>
          The default training config in the repo is the one that produced
          the paper's numbers. Relevant chunks:
        </P>

        <CodeBlock
          language="python"
          code={`"TRAIN_BS": 40,              # 40 samples per gradient step
"TRAIN_BATCH_SECS": 5.0,     # each sample is a 5-second chunk
"LR_MAX": 0.008,             # peak LR at the top of each cosine cycle
"LR_PERIOD": 1000,           # 1000 steps per cosine annealing cycle
"LR_DECAY": 0.975,           # LR_MAX *= 0.975 at each cycle end
"MOMENTUM": 0.95,            # Adam β1
"WEIGHT_DECAY": 0.0003,
"DROPOUT": 0.15,
"ONSET_POSITIVES_WEIGHT": 8.0,  # onsets are ~8× rarer than silence
"VEL_LOSS_LAMBDA": 10.0,     # balance velocity loss vs. onset loss
"XV_THRESHOLDS": [0.7, 0.725, 0.75, 0.775, 0.8]`}
        />

        <H3>Triple-onset loss tolerance</H3>

        <P>
          Naïvely training with a 24 ms grid means a prediction that fires{' '}
          <em>one frame late</em> gets the full loss penalty, even though the
          human ear can't hear the difference. The authors sidestep this by{' '}
          <Strong>spreading every onset label across 3 consecutive frames</Strong>{' '}
          before computing the BCE loss. Predictions within ±24 ms of the true
          onset are all treated as correct.
        </P>

        <CodeBlock
          language="python"
          code={`# "Triple onset" spreading — ±1 frame tolerance for free.
double = onsets.clone()
torch.maximum(onsets[..., :-1], onsets[..., 1:], out=double[..., 1:])
triple = double.clone()
torch.maximum(double[..., :-1], double[..., 1:], out=triple[..., 1:])
onsets_clip = triple.clip(0, 1)`}
        />

        <H3>AdamWR: Adam with warm restarts</H3>

        <P>
          The optimizer is a custom <Code>AdamWR</Code> — Adam with decoupled
          weight decay and cosine annealing with warm restarts. Every{' '}
          <Code>LR_PERIOD</Code> steps the learning rate cycles from ~0 up to{' '}
          <Code>LR_MAX</Code> and back down. The peak is multiplied by{' '}
          <Code>LR_DECAY</Code> at each cycle end so the restarts get softer
          over time. A checkpoint is saved at the bottom of every cycle — this
          is consistently where validation F1 is best, because the weights
          have just "cooled off" at the lowest LR.
        </P>
      </Section>

      <Section
        id="piano-results"
        eyebrow="Results"
        title="0.968 F1 on MAESTROv3 test."
        accent="piano"
      >
        <P>
          Evaluating the pretrained checkpoint against the MAESTRO test split
          with the project's <Code>eval.py</Code>:
        </P>

        <CodeBlock
          language="text"
          code={`                           PRECISION   RECALL    F1
ONSETS  (t=0.74, s=-0.01)  0.985842   0.950764  0.967756
ONS+VEL (t=0.74, s=-0.01)  0.962538   0.928580  0.945033`}
        />

        <P>
          <Code>t</Code> is the onset probability threshold and <Code>s</Code>{' '}
          is a small shift applied to the predicted time. They're picked
          jointly by sweeping on the validation set. The{' '}
          <Code>ONS+VEL</Code> row counts a note as correct only if both the
          onset time (±50 ms) <em>and</em> the velocity (±10%) are right.
        </P>

        <Callout variant="piano" title="Why this matters for the browser">
          Because the model is ~260k parameters, the exported ONNX file is a
          few megabytes. That's what makes it realistic to download on first
          page load and run client-side via <Code>onnxruntime-web</Code> with
          WebGPU fallback to WASM — which is exactly what NoteJoscaz does.
        </Callout>
      </Section>
    </div>
  );
}
