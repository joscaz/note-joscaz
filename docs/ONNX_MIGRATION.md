# ONNX migration — how the browser-side pipeline was built

This document captures **what** was done to move Note Forge's transcription
pipeline from a FastAPI backend serving a PyTorch model to a fully
client-side ONNX pipeline running in `onnxruntime-web`, and **why** each
decision was made the way it was. Read it as a reference for future ONNX
ports rather than as a changelog.

Related artifacts:

- Export script: `my-own-mt3/export_onnx.py`
- Browser pipeline: `src/services/onnx/{audioPrep,session,chunker,decoder,midiBuilder}.ts`
- Orchestrator: `src/services/transcriptionService.ts`
- Shipped models: `public/models/{piano,guitar}.onnx`

### Upstream credit

This port stands entirely on the Onsets & Velocities architecture and the
piano model released by the **IAMúsica** project — supported by research
grant 389062, INV-23/2021 from the *Institut d'Estudis Baleàrics* — by
Eulàlia Febrer Coll, Joan Lluís Travé Pla, and Andrés Fernández Rodríguez.
The guitar model is the same architecture fine-tuned on guitar data for this
project; the original architecture, training code, and piano weights are all
their work. Paper: [arXiv:2303.04485](https://arxiv.org/abs/2303.04485).

```bibtex
@inproceedings{onsvel,
  title     = {{Onsets and Velocities}: Affordable Real-Time Piano Transcription Using Convolutional Neural Networks},
  author    = {Andres Fernandez},
  year      = {2023},
  booktitle = {{EUSIPCO} Proceedings},
}
```

---

## 1. The architectural shift

**Before**: FastAPI backend served predictions. Browser sent audio →
Python ran `torchaudio` + `OnsetsAndVelocities` + decoder → returned MIDI
bytes.

**After**: Everything runs in the browser. ONNX model downloads once,
caches, and runs on the user's GPU/CPU. No backend, no infra.

The key design decision was **where to draw the ONNX boundary**:

| Option | What goes in ONNX | Pros | Cons |
|---|---|---|---|
| A. Just the CNN | Browser does STFT + mel + decode in JS | Small graph | Duplicate feature extraction logic, drift risk |
| B. **STFT + mel + CNN** | Browser only does audio decode + decoder | Guaranteed feature parity | STFT inside ONNX is tricky |
| C. Everything | Browser only does file I/O | Simplest frontend | Decoder is hard to express as a graph |

Note Forge picked **B**. The CNN and its exact input features are a single
auditable artifact, and the decoder stays in TypeScript because it's
loop-heavy control flow (NMS, velocity gather, duration synthesis) that's
awkward in a graph.

---

## 2. The `Wave2Midi` wrapper pattern

The checkpoint is just an `OnsetsAndVelocities` module. To get a graph
that takes raw audio and returns `(onsets, velocities)`, `export_onnx.py`
builds a thin wrapper:

```python
class Wave2Midi(nn.Module):
    def __init__(self, model):
        super().__init__()
        self.logmel = ExportSafeLogmel(...)
        self.model = model

    def forward(self, wave):
        logmel = self.logmel(wave).unsqueeze(0)
        probs_stages, vels = self.model(logmel, trainable_onsets=True)
        probs = F.pad(torch.sigmoid(probs_stages[-1]), (1, 0))
        vels = F.pad(torch.sigmoid(vels), (1, 0))
        return probs, vels
```

Two things to note:

1. **Sigmoid and pad moved inside the graph.** In the original Python
   inference script those were done manually after the forward pass.
   Baking them in means the browser only has to memcpy the tensor out of
   WebGPU and hand it to the decoder — no per-element JS math.
2. **`F.pad(..., (1, 0))` on the time axis** compensates for the
   `x.diff(dim=-1)` call inside `OnsetsAndVelocities` that eats one frame.
   This keeps the frame count consistent with what the decoder expects.

General pattern: **wrap the module, bake in whatever pre/post-processing
is stateless and deterministic, keep stateful / control-flow-heavy code
outside the graph.**

---

## 3. The exporter saga (why `dynamo=False` + opset 17)

PyTorch ships two ONNX exporters:

- **TorchScript exporter** (classic): traces the module, produces ONNX
  via a big table of symbolic rules (`symbolic_opset9.py`,
  `symbolic_opset17.py`, …). Mature, predictable, but only supports ops
  someone wrote a symbolic rule for.
- **Dynamo exporter** (`dynamo=True`, the 2.5+ default): uses
  `torch.export` to capture a graph via FX, then lowers it to ONNX via
  `onnxscript`. Handles more ops, more dynamic shapes, but emits higher
  opsets by default and leaves shape metadata that can confuse downstream
  tools.

This project had to fight five separate exporter issues, each with a
specific fix:

| Symptom | Root cause | Fix |
|---|---|---|
| `No Adapter To Version 17 for Pad` | Dynamo emits opset-18 Pad, onnxscript tries to downgrade to 17 and fails | Disable dynamo: `torch.onnx.export(..., dynamo=False)` |
| `InferenceError: Inferred shape and existing shape differ (16) vs (8)` during quantization | Dynamo left stale shape metadata on the dynamic time axis | Same fix + `quant_pre_process(auto_merge=True)` before `quantize_dynamic` |
| `STFT does not currently support complex types` | opset-17 `STFT` symbolic can't handle `torch.stft(return_complex=True)` | Replace `torch.stft` with hand-rolled conv1d STFT (see §4) |
| `Unsupported: ONNX export of operator Unfold, input size not accessible` | `Tensor.unfold` has no symbolic when the input length is dynamic | Same conv1d fix — framing is implicit in the convolution stride |
| `Unsupported: aten::diff` | Opset-17 has no symbolic for `diff` | Monkey-patch `forward_onsets` on the instance to use `x[..., 1:] - x[..., :-1]` |

**General lesson:** when the dynamo path gives trouble, fall back to
`dynamo=False` + opset 17 and rewrite the handful of unsupported ops in
terms of primitives (Slice, Sub, Conv, Matmul, Pad). Primitives will
always work across opsets and runtimes.

The `dynamo=False` kwarg only exists on torch 2.5+, so the export script
guards it:

```python
import inspect
if "dynamo" in inspect.signature(torch.onnx.export).parameters:
    export_kwargs["dynamo"] = False
```

---

## 4. The conv1d-STFT trick (the single most valuable piece)

`torch.stft` and `torchaudio.transforms.Spectrogram` aren't exportable at
opset 17 because they emit `onnx::STFT` on a complex tensor. A clean,
exporter-friendly replacement uses a **1-D convolution whose kernel bakes
the window into the DFT basis**.

For each frequency bin `k ∈ [0, N/2]`:

```
W_real[k, n] = hann[n] * cos(2π k n / N)
W_imag[k, n] = hann[n] * sin(2π k n / N)
```

Then:

```python
x = F.pad(wave.view(1, 1, -1), (N//2, N//2), mode='reflect')
real = F.conv1d(x, w_real, stride=hop)   # (1, n_freqs, num_frames)
imag = F.conv1d(x, w_imag, stride=hop)
power = real*real + imag*imag
mel = mel_fbank_t @ power.squeeze(0)     # (n_mels, num_frames)
log_mel = 10 * torch.log10(torch.clamp(mel, min=1e-10))
log_mel = torch.maximum(log_mel, log_mel.max() - 80.0)
```

Why this is mathematically equivalent to the torchaudio path:

- Reflect-padding by `N//2` matches
  `torch.stft(center=True, pad_mode='reflect')`.
- `conv1d` with `stride=hop` implicitly does framing (windows of `N`
  samples at `hop` stride) — that's exactly what `unfold` does, but
  `conv1d` has a symbolic rule.
- The sliding dot-product between the wave and `W_real[k]` **is** the
  real part of the DFT of each windowed frame; same for sin/imag.
- `power = real² + imag²` avoids complex dtypes entirely.
- The mel filterbank is lifted directly out of a real
  `torchaudio.MelSpectrogram` instance, so we inherit torchaudio's exact
  scale (`htk` vs `slaney`) and normalization convention.
- `10 · log10(clamp(., 1e-10))` plus `max(x, x.max() - 80)` reproduces
  `AmplitudeToDB(stype='power', top_db=80)` verbatim.

### The parity guardrail

`_verify_logmel_parity` runs the real `TorchWavToLogmel` and
`ExportSafeLogmel` on random audio and asserts
`max |diff| < 1e-3 dB` before every export. If torchaudio ever changes a
default, the export aborts instead of silently shipping a broken model.

**General lesson:** when an ONNX op isn't supported, look for a
mathematically equivalent formulation in terms of conv / matmul / unary
ops. Precompute anything that doesn't depend on input data as a buffer.
Treat the parity test as part of the artifact, not a nice-to-have.

---

## 5. Monkey-patching `forward_onsets`

`OnsetsAndVelocities.forward_onsets` calls `x.diff(dim=-1)` once. Rather
than fork the upstream training repo, the export script patches the
method on the loaded instance:

```python
def _patch_forward_onsets_for_export(model):
    import types
    def forward_onsets(self, x):
        xdiff = x[..., 1:] - x[..., :-1]  # was: x.diff(dim=-1)
        # ... rest identical ...
    model.forward_onsets = types.MethodType(forward_onsets, model)
```

Good pattern for ONNX migrations:

- **Don't modify the training repo** — that separates concerns and keeps
  reproducibility clean.
- **Patch the instance, not the class** — `types.MethodType(fn, instance)`
  binds the method only to this object, so other code paths (training,
  regular inference) are untouched.
- **Keep the body byte-identical** except for the one line you're
  swapping — makes the diff trivially reviewable.

---

## 6. Quantization

`quantize_dynamic` with `QUInt8` cut the piano model from ~4 MB to ~1 MB.
Two gotchas:

1. **Pre-process first.** `quantize_dynamic` runs ONNX shape inference on
   the raw export. If the export has any shape metadata that disagrees
   with inferred shapes, you get
   `Inferred shape and existing shape differ in dimension 0: (N) vs (N/2)`.
   The fix is
   `onnxruntime.quantization.shape_inference.quant_pre_process(..., auto_merge=True)`
   which runs symbolic + ONNX shape inference and merges disagreements
   rather than raising.
2. **Dynamic quantization is weights-only.** Activations stay float32,
   which means there's no calibration dataset required and no accuracy
   regression for this model type. For conv-heavy models where weights
   dominate size, this is the right default.

---

## 7. Browser integration

### Session management — `src/services/onnx/session.ts`

- **Lazy-load per instrument** — don't download the guitar model until
  someone picks guitar.
- **Try `webgpu` EP first, fall back to `wasm`** (SIMD-threaded) — gives
  ~5–10× speedup on machines with WebGPU and graceful degradation on
  older browsers.
- **`?url` imports on `onnxruntime-web`'s JSEP WASM files** so Vite
  bundles only what we actually reference, not all 98 MB of ORT variants.

### Chunked inference — `src/services/onnx/chunker.ts`

Long files blow out browser memory if fed whole. The chunker:

1. Splits into ~20 s chunks with ~2 s overlap.
2. Runs `InferenceSession.run` per chunk.
3. Concatenates the logit tensors, dropping half the overlap from each
   side.

This mirrors Python's `strided_inference` and gives identical results to
a single big run.

### Audio prep — `src/services/onnx/audioPrep.ts`

- `AudioContext.decodeAudioData` handles every format the browser
  supports (mp3, wav, m4a, ogg, flac).
- `OfflineAudioContext` resamples to 16 kHz mono at arbitrary quality
  without blocking the main thread.

### Decoder parity across instruments — `src/services/onnx/decoder.ts`

The two reference scripts in
`InsiderFM_Services/apps/audio-transcription-model/instruments/<name>/inference.py`
use different post-processing:

| Step | Piano | Guitar |
|---|---|---|
| Pre-NMS smoothing | Gaussian blur (ksize 11, σ 1) | None (raw probs) |
| NMS | Equal-to-max (ties kept) | Strict `>` neighbors (ties rejected) |
| Velocity read | Mean over 3 frames (reflect-padded) | Single frame |
| Short-note policy | Clamp up to 80 ms | Drop if < 50 ms |

This is expressed as two `DecodeOptions` presets
(`PIANO_DECODE_OPTIONS`, `GUITAR_DECODE_OPTIONS`) and a minimum-duration
map in `midiBuilder.ts`. One decoder implementation, instrument-specific
config — easy to extend if we add a third instrument.

---

## 8. Debugging playbook for future ONNX work

When an export fails, ask these questions **in order**:

1. **Which exporter?** Dynamo or TorchScript? Try the other one.
2. **Which opset?** If the dynamo path emits a higher opset than your
   target, either bump the target or disable dynamo.
3. **Which op is failing?** The error almost always names an `aten::*`
   op. Check if it has a symbolic rule at your opset. If not, rewrite the
   call in terms of supported primitives (Slice, Gather, Reshape, Conv,
   Matmul, Pad, Sub, Mul, Sum).
4. **Dynamic shapes?** Some ops (like `unfold`) only fail when the input
   length is symbolic. Either make the shape static or rewrite in terms
   of ops that handle dynamic shape (conv is usually your friend).
5. **Complex dtypes?** ONNX's STFT/FFT story is still rough. Unroll to
   real-valued conv/matmul.
6. **Shape inference failures during quantization?** Run
   `quant_pre_process(auto_merge=True)` first.
7. **Parity after the fix?** Write a parity test against the original
   PyTorch module. If you skipped this step, you don't know if the fix
   preserved semantics.

---

## 9. What we now have

- `my-own-mt3/export_onnx.py`: reproducible export + quantize pipeline
  with a parity guardrail, two checkpoints → `piano.int8.onnx` +
  `guitar.int8.onnx`.
- `note-forge/public/models/`: the quantized models, shipped to the
  browser.
- `note-forge/src/services/onnx/`: a self-contained audio → MIDI
  pipeline (prep, session, chunker, decoder, midi builder) that matches
  the InsiderFM inference scripts bit-for-bit per instrument.
- A working fallback to mock MIDI if the model fails to load, so the
  demo page never dead-ends.

The whole thing runs on GitHub Pages (or any static host) with no
backend.
