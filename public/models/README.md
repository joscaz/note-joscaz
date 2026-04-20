# Models

The browser-side transcription pipeline loads these files directly:

- `piano.onnx` — piano transcription model
- `guitar.onnx` — guitar transcription model

Both are expected to be the int8-quantized outputs of the export script in the
`my-own-mt3` repo:

```bash
cd ~/Documents/RandomProgProjects/my-own-mt3
source venv/bin/activate
python export_onnx.py
cp onnx_out/piano.int8.onnx  ../note-joscaz/public/models/piano.onnx
cp onnx_out/guitar.int8.onnx ../note-joscaz/public/models/guitar.onnx
```

If you prefer un-quantized float32 weights (larger, slightly more accurate),
copy `piano.onnx` / `guitar.onnx` from `onnx_out/` instead.

## Graph contract

Each model exposes:

- **input** `wave`: `float32[samples]` — mono audio at 16 kHz, normalized
  roughly to `[-1, 1]`.
- **outputs**:
  - `onsets`: `float32[1, 88, frames]` — per-frame onset probability per
    piano key (MIDI 21..108), already `sigmoid`-ed and left-padded by 1 to
    match `frames = ceil(samples / 384)`.
  - `velocities`: `float32[1, 88, frames]` — velocity in `[0, 1]` per key per
    frame, same shape/padding as `onsets`.

The browser runs NMS peak-picking on `onsets` and reads `velocities` at the
peak locations to build the final MIDI.

## Credits

The Onsets & Velocities architecture and the piano model were developed by
the **IAMúsica** project — supported by research grant 389062, INV-23/2021
from the *Institut d'Estudis Baleàrics* — by Eulàlia Febrer Coll, Joan Lluís
Travé Pla, and Andrés Fernández Rodríguez. The guitar model is the same
architecture fine-tuned on guitar data for this project.

Paper: [arXiv:2303.04485](https://arxiv.org/abs/2303.04485). See the repo
`README.md` for the full citation.
