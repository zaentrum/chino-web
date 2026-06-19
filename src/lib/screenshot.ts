/**
 * Capture the current page as a JPEG blob for bug reports.
 *
 * html2canvas re-renders the DOM onto a canvas — it cannot paint
 * <video> elements (they come out black), so the `onclone` hook swaps
 * every visible video in the CLONED document for a same-size canvas
 * onto which we drawImage() the ORIGINAL video's current frame. The
 * player's stream is MSE-fed from our own origin, so the frame isn't
 * CORS-tainted and the draw succeeds.
 *
 * Strictly best-effort: resolves null on ANY failure (never throws) —
 * a missing screenshot must never block a bug report.
 */
export async function captureScreenshot(): Promise<Blob | null> {
  try {
    // Lazy-loaded — html2canvas is ~200 kB and only ever needed when a
    // report is being filed, so keep it out of the startup bundle.
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      logging: false,
      // Cap the capture at ~1600px wide so a 4K display doesn't
      // produce a multi-MB JPEG (the server rejects > 3 MB anyway).
      scale: Math.min(1, 1600 / window.innerWidth),
      onclone: (clonedDoc) => {
        // querySelectorAll order is document order and the clone is a
        // deep copy, so originals[i] corresponds to clones[i].
        const originals = Array.from(document.querySelectorAll('video'));
        const clones = Array.from(clonedDoc.querySelectorAll('video'));
        clones.forEach((cloneVideo, i) => {
          const orig = originals[i];
          if (!orig || !orig.videoWidth || !orig.videoHeight) return;
          const rect = orig.getBoundingClientRect();
          // Hidden / zero-size videos (e.g. prefetch warmers) stay as-is.
          if (rect.width < 1 || rect.height < 1) return;
          try {
            const frame = clonedDoc.createElement('canvas');
            const w = Math.max(1, Math.round(rect.width));
            const h = Math.max(1, Math.round(rect.height));
            frame.width = w;
            frame.height = h;
            const ctx = frame.getContext('2d');
            if (!ctx) return;
            // Letterbox like the player's default object-fit: contain
            // so the frame lands at the same place on screen.
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, w, h);
            const fit = Math.min(w / orig.videoWidth, h / orig.videoHeight);
            const dw = orig.videoWidth * fit;
            const dh = orig.videoHeight * fit;
            ctx.drawImage(orig, (w - dw) / 2, (h - dh) / 2, dw, dh);
            // Keep the element's layout identity so the clone renders
            // the canvas exactly where the video sat.
            frame.className = cloneVideo.className;
            frame.style.cssText = cloneVideo.style.cssText;
            cloneVideo.replaceWith(frame);
          } catch {
            // Tainted / detached / draw failure — leave the (black)
            // video in place rather than abort the whole capture.
          }
        });
      },
    });
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8),
    );
  } catch {
    return null;
  }
}
