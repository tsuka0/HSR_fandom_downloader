(() => {
  const getPageSlug = () => {
    const match = location.pathname.match(/^\/wiki\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  };

  const pageSlug = getPageSlug();
  if (!pageSlug) return;

  const ui = document.createElement("div");
  ui.style.position = "fixed";
  ui.style.top = "16px";
  ui.style.right = "16px";
  ui.style.zIndex = "999999";
  ui.style.background = "#0b0f1a";
  ui.style.color = "#f2f2f2";
  ui.style.border = "1px solid #2a3350";
  ui.style.borderRadius = "10px";
  ui.style.padding = "10px 12px";
  ui.style.fontSize = "13px";
  ui.style.fontFamily = "system-ui, sans-serif";
  ui.style.boxShadow = "0 6px 20px rgba(0,0,0,0.35)";
  ui.style.maxWidth = "260px";

  const title = document.createElement("div");
  title.textContent = "スタレ音声+画像";
  title.style.fontWeight = "600";
  title.style.marginBottom = "6px";
  ui.appendChild(title);

  const button = document.createElement("button");
  button.textContent = "ダウンロードしよ！";
  button.style.background = "#2d6cdf";
  button.style.color = "#fff";
  button.style.border = "0";
  button.style.padding = "6px 10px";
  button.style.borderRadius = "8px";
  button.style.cursor = "pointer";
  button.style.fontSize = "13px";
  ui.appendChild(button);

  const status = document.createElement("div");
  status.textContent = "待ってます";
  status.style.marginTop = "8px";
  status.style.opacity = "0.9";
  status.style.whiteSpace = "pre-wrap";
  ui.appendChild(status);

  document.body.appendChild(ui);

  const setStatus = (text) => {
    status.textContent = text;
  };

  const safeName = (name) => {
    return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "character";
  };

  const normalizeToken = (value) => {
    return decodeURIComponent(value || "")
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const getCharacterName = () => {
    const h1 = document.querySelector("#firstHeading");
    if (h1 && h1.textContent) return h1.textContent.trim();
    const title = document.title || "character";
    return title.split("-")[0].trim();
  };

  const looksLikeCharacterPage = () => {
    const normalizedSlug = normalizeToken(pageSlug);
    const normalizedHeading = normalizeToken(getCharacterName());
    if (!normalizedSlug || !normalizedHeading) return false;
    if (normalizedSlug === normalizedHeading) return true;
    if (normalizedHeading.includes(normalizedSlug) || normalizedSlug.includes(normalizedHeading)) {
      return true;
    }

    const categoriesText = Array.from(
      document.querySelectorAll(".page-header__categories a, .page-header__categories-in")
    )
      .map((el) => el.textContent || "")
      .join(" ")
      .toLowerCase();

    return /playable characters|characters|character/.test(categoriesText);
  };

  if (!looksLikeCharacterPage()) return;

  const normalizeUrl = (url) => {
    if (!url) return null;
    if (url.startsWith("//")) return "https:" + url;
    try {
      return new URL(url, location.origin).href;
    } catch {
      return null;
    }
  };

  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

  const filenameFromUrl = (url) => {
    try {
      const u = new URL(url);
      const path = u.pathname.split("/");
      const last = path[path.length - 1];
      const clean = decodeURIComponent(last.split("?")[0]);
      return clean || "file";
    } catch {
      return "file";
    }
  };

  const extractVoiceEntries = (doc) => {
    const entries = [];
    const seen = new Set();

//こんなクソコードでごめん、これしか思いつかんかったんだ
    const cleanDetailsText = (text) => {
      return (text || "")
        .replace(/https?:\/\/\S+/gi, " ")
        .replace(/\b[a-z0-9_-]+\.(ogg|mp3|wav)\b/gi, " ")
        .replace(/\bFile:\S+/gi, " ")
        .replace(/[▶▷►▸▹]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    };

    const findDetailsText = (el) => {
      if (!el) return "";
      const row = el.closest("tr");
      if (row) {
        const table = row.closest("table");
        if (table) {
          const allRows = Array.from(table.querySelectorAll("tr"));
          const headerRow = allRows.find((tr) =>
            Array.from(tr.children).some((cell) =>
              (cell.textContent || "").trim().toLowerCase().includes("details")
            )
          );
          if (headerRow) {
            const headers = Array.from(headerRow.children);
            const detailsIndex = headers.findIndex((h) =>
              (h.textContent || "").trim().toLowerCase().includes("details")
            );
            if (detailsIndex >= 0) {
              const cells = Array.from(row.children);
              const cell = cells[detailsIndex];
              if (cell) {
                return cleanDetailsText(cell.textContent || "");
              }
            }
          }
        }
      }

      const label = el.closest("tr, li, div")?.querySelector(
        "*:is(dt, th, div, span)"
      );
      if (label && (label.textContent || "").trim().toLowerCase() === "details") {
        const next = label.nextElementSibling;
        if (next) return cleanDetailsText(next.textContent || "");
      }

      return "";
    };

    const add = (src, line) => {
      const url = normalizeUrl(src);
      if (!url) return;
      const name = filenameFromUrl(url).toLowerCase();
      if (!name.startsWith("latest")) return;
      if (seen.has(url)) return;
      seen.add(url);
      entries.push({ url, line: line || "" });
    };

    doc.querySelectorAll("audio, audio source").forEach((el) => {
      const src = el.getAttribute("src") || el.getAttribute("data-src");
      const line = findDetailsText(el);
      if (src) add(src, line);
    });

    doc.querySelectorAll("a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (href.match(/\.(mp3|ogg|wav)(\?|$)/i)) {
        const line = findDetailsText(a);
        add(href, line);
      }
    });

    return entries;
  };

  const extractMediaUrls = (doc, nameTokens) => {
    const urls = [];

    const tokenMatch = (text) => {
      const lower = (text || "").toLowerCase();
      return nameTokens.some((t) => t && lower.includes(t));
    };

    // Prefer file links from the Media page to avoid unrelated site assets
    doc
      .querySelectorAll(
        ".category-page__members a, .mw-category-generated a, .gallerybox a, a[href*=\"/wiki/File:\"]"
      )
      .forEach((a) => {
        const href = a.getAttribute("href") || "";
        if (!href.includes("/wiki/File:")) return;
        const fileName = decodeURIComponent(href.split("/wiki/File:")[1] || "");
        if (!tokenMatch(fileName)) return;
        // Use the thumbnail or full static URL if present
        const img = a.querySelector("img");
        const src = img ? img.getAttribute("data-src") || img.getAttribute("src") : null;
        if (src) urls.push(normalizeUrl(src));
      });

    // Fallback: pick inline images/videos that include the character token
    doc.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("data-src") || img.getAttribute("src");
      const file = filenameFromUrl(normalizeUrl(src || "") || "");
      if (src && tokenMatch(file)) urls.push(normalizeUrl(src));
      const srcset = img.getAttribute("srcset");
      if (srcset) {
        srcset.split(",").forEach((part) => {
          const u = part.trim().split(" ")[0];
          const f = filenameFromUrl(normalizeUrl(u) || "");
          if (u && tokenMatch(f)) urls.push(normalizeUrl(u));
        });
      }
    });

    doc.querySelectorAll("video source").forEach((source) => {
      const src = source.getAttribute("src") || source.getAttribute("data-src");
      const file = filenameFromUrl(normalizeUrl(src || "") || "");
      if (src && tokenMatch(file)) urls.push(normalizeUrl(src));
    });

    return uniq(urls);
  };

  const fetchDoc = async (url) => {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`Fetch failed: ${url}`);
    const html = await res.text();
    return new DOMParser().parseFromString(html, "text/html");
  };

  const mapWithConcurrency = async (items, limit, worker) => {
    const results = new Array(items.length);
    let i = 0;
    let active = 0;
    return new Promise((resolve, reject) => {
      const next = () => {
        if (i >= items.length && active === 0) {
          resolve(results);
          return;
        }
        while (active < limit && i < items.length) {
          const idx = i++;
          active++;
          Promise.resolve(worker(items[idx], idx))
            .then((res) => {
              results[idx] = res;
              active--;
              next();
            })
            .catch(reject);
        }
      };
      next();
    });
  };

  const sanitizeLine = (text) => {
    const cleaned = (text || "")
      .replace(/[▶▷►▸▹]/g, " ")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return "voice";
    return cleaned.slice(0, 180);
  };

  const encodeWav = (audioBuffer) => {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length * numChannels * 2;
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    let offset = 0;
    writeString(offset, "RIFF");
    offset += 4;
    view.setUint32(offset, 36 + length, true);
    offset += 4;
    writeString(offset, "WAVE");
    offset += 4;
    writeString(offset, "fmt ");
    offset += 4;
    view.setUint32(offset, 16, true);
    offset += 4;
    view.setUint16(offset, 1, true);
    offset += 2;
    view.setUint16(offset, numChannels, true);
    offset += 2;
    view.setUint32(offset, sampleRate, true);
    offset += 4;
    view.setUint32(offset, sampleRate * numChannels * 2, true);
    offset += 4;
    view.setUint16(offset, numChannels * 2, true);
    offset += 2;
    view.setUint16(offset, 16, true);
    offset += 2;
    writeString(offset, "data");
    offset += 4;
    view.setUint32(offset, length, true);
    offset += 4;

    const channels = [];
    for (let c = 0; c < numChannels; c++) {
      channels.push(audioBuffer.getChannelData(c));
    }
    let idx = 0;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let c = 0; c < numChannels; c++) {
        let sample = channels[c][i];
        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset + idx, sample * 0x7fff, true);
        idx += 2;
      }
    }

    return new Blob([buffer], { type: "audio/wav" });
  };

  const isAnimatedWebP = (arrayBuffer) => {
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length < 16) return false;
    // Look for "ANIM" chunk
    for (let i = 0; i < bytes.length - 4; i++) {
      if (
        bytes[i] === 0x41 &&
        bytes[i + 1] === 0x4e &&
        bytes[i + 2] === 0x49 &&
        bytes[i + 3] === 0x4d
      ) {
        return true;
      }
    }
    return false;
  };

  const decodeImageToPng = async (blob) => {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    return pngBlob || blob;
  };

  const downloadIntoZip = async (items, folder, label, opts = {}) => {
    const nameCount = new Map();
    let done = 0;
    let failed = 0;

    const audioCtx = opts.kind === "audio" ? new AudioContext() : null;

    await mapWithConcurrency(items, 4, async (item) => {
      const url = typeof item === "string" ? item : item.url;
      setStatus(`${label} ダウンロード中... ${done}/${items.length}`);
      try {
        const res = await fetch(url, { credentials: "omit" });
        if (!res.ok) throw new Error(`Bad status ${res.status}`);
        let blob = await res.blob();

        let filename = filenameFromUrl(url);
        if (opts.kind === "audio") {
          const line = typeof item === "string" ? "" : item.line;
          filename = `${sanitizeLine(line)}.wav`;
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          blob = encodeWav(audioBuffer);
        } else if (opts.kind === "media") {
          const isWebp = blob.type === "image/webp" || filename.toLowerCase().endsWith(".webp");
          if (isWebp) {
            const arrayBuffer = await blob.arrayBuffer();
            const animated = isAnimatedWebP(arrayBuffer);
            if (!animated) {
              blob = await decodeImageToPng(new Blob([arrayBuffer], { type: blob.type }));
              if (filename.match(/\.[a-z0-9]+$/i)) {
                filename = filename.replace(/\.[a-z0-9]+$/i, ".png");
              } else {
                filename = `${filename}.png`;
              }
            }
          }
        }

        if (!filename.match(/\.[a-z0-9]+$/i)) {
          const ext = blob.type.split("/")[1];
          if (ext) filename += `.${ext}`;
        }

        const key = filename.toLowerCase();
        const count = (nameCount.get(key) || 0) + 1;
        nameCount.set(key, count);
        if (count > 1) {
          const dot = filename.lastIndexOf(".");
          if (dot > 0) {
            filename = `${filename.slice(0, dot)}_${count}${filename.slice(dot)}`;
          } else {
            filename = `${filename}_${count}`;
          }
        }

        folder.file(filename, blob);
        done++;
      } catch {
        failed++;
        done++;
      }
    });

    if (audioCtx) {
      try {
        await audioCtx.close();
      } catch {}
    }

    return { done, failed };
  };

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.style.opacity = "0.7";

    try {
      setStatus("ページを調べてます、待っててね...");
      const headingName = getCharacterName();
      const characterName = safeName(headingName);
      const rawPageSlug = decodeURIComponent(pageSlug);
      const nameTokens = [
        normalizeToken(headingName),
        normalizeToken(rawPageSlug),
        normalizeToken(rawPageSlug.replace(/\s*\([^)]*\)\s*/g, " "))
      ].filter(Boolean);

      const encodedSlug = encodeURIComponent(rawPageSlug);
      const voiceUrl = `${location.origin}/wiki/${encodedSlug}/Voice-Overs/Japanese`;
      const mediaUrl = `${location.origin}/wiki/${encodedSlug}/Media`;

      const [voiceDoc, mediaDoc] = await Promise.all([
        fetchDoc(voiceUrl),
        fetchDoc(mediaUrl)
      ]);

      const voiceEntries = extractVoiceEntries(voiceDoc);
      const mediaUrls = extractMediaUrls(mediaDoc, nameTokens);

      if (voiceEntries.length === 0 && mediaUrls.length === 0) {
        setStatus("データが見つからなかった！");
        return;
      }

      const zip = new JSZip();
      const root = zip.folder(characterName);
      const voiceFolder = root.folder("セリフ素材");
      const mediaFolder = root.folder("画像");

      setStatus(`音声 ${voiceEntries.length}件 / 画像・動画 ${mediaUrls.length}件`);

      const voiceResult = await downloadIntoZip(voiceEntries, voiceFolder, "音声", {
        kind: "audio"
      });
      const mediaResult = await downloadIntoZip(mediaUrls, mediaFolder, "画像", {
        kind: "media"
      });

      setStatus("ZIPにしてるよ...");
      const zipBlob = await zip.generateAsync(
        { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
        (meta) => {
          const pct = Math.floor(meta.percent || 0);
          setStatus(`ZIPにしてるよ... ${pct}%`);
        }
      );

      const downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${characterName}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

      setStatus(
        `出来たぞ、音声 ${voiceResult.done}件(失敗${voiceResult.failed}) / 画像・動画 ${mediaResult.done}件(無理ぽ${mediaResult.failed})`
      );
    } catch (err) {
      setStatus(`エラー: ${err.message || err}`);
    } finally {
      button.disabled = false;
      button.style.opacity = "1";
    }
  });
})();
