/**
 * Dependency-free, STORE-ONLY (uncompressed) ZIP writer.
 *
 * Why no library: package.json has no zip dependency (jszip/fflate or
 * otherwise) at the time this was written — checked deliberately before
 * adding one. WebP frames are already compressed, so DEFLATE would spend CPU
 * for near-zero size benefit; STORE (compression method 0) is the correct
 * choice here, not just the easy one. This mirrors the project's existing
 * convention of small, dependency-free binary encoders — see
 * exportAudio.ts's `audioBufferToWavBlob`, which takes the same approach for
 * WAV.
 *
 * The backend (Python) extracts via the stdlib `zipfile` module, which is a
 * strict, spec-compliant reader — so every header field and CRC32 below must
 * be byte-correct: local file header + data, repeated per entry, followed by
 * one central directory record per entry, then a single end-of-central-
 * directory record. Field layout follows the PKZIP APPNOTE.TXT format
 * (general-purpose ZIP spec used by zipfile, 7-Zip, macOS Archive Utility,
 * etc.) restricted to the STORE method and 32-bit (non-Zip64) sizes/offsets —
 * sufficient here since a frame archive (sub-200MB cap, see design §6) never
 * approaches the 4GB Zip64 threshold.
 */

export interface ZipEntryInput {
  /** Entry name as it should appear inside the archive, e.g. "frame_000001.webp". */
  name: string;
  data: Uint8Array;
}

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;

/** Precomputed CRC32 lookup table (standard IEEE 802.3 polynomial 0xEDB88320),
 * built once and reused for every entry — same table-driven approach ffmpeg/
 * zlib/zipfile itself uses internally. */
const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time encoding used by the ZIP format's mtime fields. A fixed,
 * arbitrary timestamp is fine here — the backend only reads file CONTENT by
 * name order, never the embedded mtime. */
function dosDateTime(): { date: number; time: number } {
  const now = new Date();
  const date =
    ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const time =
    (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  return { date, time };
}

class ByteWriter {
  private chunks: Uint8Array[] = [];
  private length = 0;

  writeBytes(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  writeUint16(value: number): void {
    const buf = new Uint8Array(2);
    new DataView(buf.buffer).setUint16(0, value, true);
    this.writeBytes(buf);
  }

  writeUint32(value: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, value, true);
    this.writeBytes(buf);
  }

  /** Current total length, in bytes, of everything written so far — used as
   * each entry's recorded offset into the eventual archive. */
  get offset(): number {
    return this.length;
  }

  /** Returns a plain ArrayBuffer (not Uint8Array) — Blob's BlobPart typing
   * pins ArrayBufferView to ArrayBuffer specifically (not the more general
   * ArrayBufferLike a fresh Uint8Array's `.buffer` is typed as), so handing
   * back the buffer directly sidesteps that mismatch. */
  toArrayBuffer(): ArrayBuffer {
    const out = new Uint8Array(this.length);
    let pos = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, pos);
      pos += chunk.length;
    }
    return out.buffer;
  }
}

const textEncoder = new TextEncoder();

/**
 * Builds a single STORE-only ZIP archive from `entries`, preserving input
 * order. Returns a Blob ready to attach as the `frames` multipart field.
 */
export function buildZipArchive(entries: readonly ZipEntryInput[]): Blob {
  const writer = new ByteWriter();
  const { date, time } = dosDateTime();

  interface CentralRecord {
    nameBytes: Uint8Array;
    crc: number;
    size: number;
    localHeaderOffset: number;
  }
  const centralRecords: CentralRecord[] = [];

  // --- Local file header + raw data, per entry ---
  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const localHeaderOffset = writer.offset;

    writer.writeUint32(LOCAL_FILE_HEADER_SIG);
    writer.writeUint16(20); // version needed to extract (2.0 — base spec, no Zip64)
    writer.writeUint16(0); // general purpose bit flag (none set)
    writer.writeUint16(0); // compression method = 0 (STORE)
    writer.writeUint16(time);
    writer.writeUint16(date);
    writer.writeUint32(crc);
    writer.writeUint32(size); // compressed size == uncompressed size (STORE)
    writer.writeUint32(size);
    writer.writeUint16(nameBytes.length);
    writer.writeUint16(0); // extra field length
    writer.writeBytes(nameBytes);
    writer.writeBytes(entry.data);

    centralRecords.push({ nameBytes, crc, size, localHeaderOffset });
  }

  // --- Central directory: one record per entry ---
  const centralDirOffset = writer.offset;
  for (const rec of centralRecords) {
    writer.writeUint32(CENTRAL_DIR_HEADER_SIG);
    writer.writeUint16(20); // version made by
    writer.writeUint16(20); // version needed to extract
    writer.writeUint16(0); // general purpose bit flag
    writer.writeUint16(0); // compression method = 0 (STORE)
    writer.writeUint16(time);
    writer.writeUint16(date);
    writer.writeUint32(rec.crc);
    writer.writeUint32(rec.size);
    writer.writeUint32(rec.size);
    writer.writeUint16(rec.nameBytes.length);
    writer.writeUint16(0); // extra field length
    writer.writeUint16(0); // file comment length
    writer.writeUint16(0); // disk number start
    writer.writeUint16(0); // internal file attributes
    writer.writeUint32(0); // external file attributes
    writer.writeUint32(rec.localHeaderOffset);
    writer.writeBytes(rec.nameBytes);
  }
  const centralDirSize = writer.offset - centralDirOffset;

  // --- End of central directory record ---
  writer.writeUint32(END_OF_CENTRAL_DIR_SIG);
  writer.writeUint16(0); // disk number
  writer.writeUint16(0); // disk with central directory
  writer.writeUint16(centralRecords.length); // entries on this disk
  writer.writeUint16(centralRecords.length); // total entries
  writer.writeUint32(centralDirSize);
  writer.writeUint32(centralDirOffset);
  writer.writeUint16(0); // comment length

  return new Blob([writer.toArrayBuffer()], { type: 'application/zip' });
}
