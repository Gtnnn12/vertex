/**
 * Reliable animated-GIF detection for the browser.
 *
 * A single `image/gif` file is not necessarily animated — it can contain one
 * frame. Rather than trusting the mimetype, this parses the GIF byte stream and
 * counts the image descriptors (frames). A GIF is considered animated when it
 * contains more than one frame.
 *
 * The GIF87a/GIF89a layout is:
 *   header   (6 bytes: "GIF87a" | "GIF89a")
 *   LSD      (7 bytes: logical screen descriptor)
 *   ...global color table (optional, variable)
 *   ...blocks:
 *       0x21  extension introducer
 *          · followed by a label + sub-blocks
 *       0x2C  image descriptor (one "frame")
 *       0x3B  trailer
 *
 * We walk the block stream, skipping extension sub-blocks (each starts with a
 * sub-block size byte; a 0x00 terminator ends the extension) and counting 0x2C
 * image descriptors.
 */
export function isAnimatedGif(
  input: Blob | ArrayBuffer | Uint8Array,
): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const readBytes = async (): Promise<Uint8Array> => {
      if (input instanceof Uint8Array) return input;
      if (input instanceof ArrayBuffer) return new Uint8Array(input);
      const buf = await input.arrayBuffer();
      return new Uint8Array(buf);
    };

    readBytes()
      .then((bytes) => {
        if (bytes.length < 6) return resolve(false);

        const header = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
        if (header !== 'GIF') return resolve(false);

        const version = String.fromCharCode(bytes[3], bytes[4], bytes[5]);
        if (version !== '87a' && version !== '89a') return resolve(false);

        let offset = 6;
        // Skip global color table (present when the 0x80 flag is set).
        if (offset + 7 > bytes.length) return resolve(false);
        const flags = bytes[10];
        if (flags & 0x80) {
          const gctSize = 2 ** ((flags & 0x07) + 1);
          offset += 7 + gctSize * 3;
        } else {
          offset += 7;
        }

        let frameCount = 0;
        while (offset < bytes.length) {
          const block = bytes[offset];
          if (block === 0x3b) break; // trailer
          if (block === 0x21) {
            // Extension: label byte, then sub-blocks until 0x00.
            offset += 2;
            while (offset < bytes.length) {
              const size = bytes[offset];
              offset += 1;
              if (size === 0) break;
              offset += size;
              if (offset > bytes.length) return resolve(false);
            }
            continue;
          }
          if (block === 0x2c) {
            // Image descriptor: 9 bytes then optional local color table.
            frameCount += 1;
            if (frameCount > 1) return resolve(true);
            if (offset + 9 > bytes.length) return resolve(false);
            const lctFlag = bytes[offset + 9];
            offset += 10;
            if (lctFlag & 0x80) {
              offset += 2 ** ((lctFlag & 0x07) + 1) * 3;
              if (offset > bytes.length) return resolve(false);
            }
            // Skip the image data: LZW min code size byte, then sub-blocks.
            offset += 1;
            while (offset < bytes.length) {
              const size = bytes[offset];
              offset += 1;
              if (size === 0) break;
              offset += size;
              if (offset > bytes.length) return resolve(false);
            }
            continue;
          }
          // Unknown block — treat as end of useful stream.
          break;
        }

        return resolve(false);
      })
      .catch((err) => reject(err));
  });
}
