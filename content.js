(() => {
  const fetchPageSlug = () => {
    const match = location.pathname.match(/^\/wiki\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  };

  const pageSlug = fetchPageSlug();
  if (!pageSlug) return;

  const buildUI = () => {
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.top = "16px";
    container.style.right = "16px";
    container.style.zIndex = "999999";
    container.style.background = "#0b0f1a";
    container.style.color = "#f2f2f2";
    container.style.border = "1px solid #2a3350";
    container.style.borderRadius = "10px";
    container.style.padding = "10px 12px";
    container.style.fontSize = "13px";
    container.style.fontFamily = "system-ui, sans-serif";
    container.style.boxShadow = "0 6px 20px rgba(0,0,0,0.35)";
    container.style.maxWidth = "260px";
    return container;
  };

  const uiContainer = buildUI();

  const createHeader = () => {
    const header = document.createElement("div");
    header.textContent = "スタレ音声+画像";
    header.style.fontWeight = "600";
    header.style.marginBottom = "6px";
    return header;
  };

  uiContainer.appendChild(createHeader());

  const createDownloadButton = () => {
    const btn = document.createElement("button");
    btn.textContent = "ダウンロードしよ！";
    btn.style.background = "#2d6cdf";
    btn.style.color = "#fff";
    btn.style.border = "0";
    btn.style.padding = "6px 10px";
    btn.style.borderRadius = "8px";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "13px";
    return btn;
  };

  const downloadBtn = createDownloadButton();
  uiContainer.appendChild(downloadBtn);

  const createStatusDisplay = () => {
    const display = document.createElement("div");
    display.textContent = "待ってます";
    display.style.marginTop = "8px";
    display.style.opacity = "0.9";
    display.style.whiteSpace = "pre-wrap";
    return display;
  };

  const statusDisplay = createStatusDisplay();
  uiContainer.appendChild(statusDisplay);

  document.body.appendChild(uiContainer);

  const updateStatus = (text) => {
    statusDisplay.textContent = text;
  };

  const sanitizeFilename = (name) => {
    return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "character";
  };

  const normalizeTextToken = (value) => {
    return decodeURIComponent(value || "")
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const extractCharacterNameFromPage = () => {
    const h1 = document.querySelector("#firstHeading");
    if (h1 && h1.textContent) return h1.textContent.trim();
    const title = document.title || "character";
    return title.split("-")[0].trim();
  };

  const isCharacterPage = () => {
    const normalizedSlug = normalizeTextToken(pageSlug);
    const normalizedHeading = normalizeTextToken(extractCharacterNameFromPage());
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

  if (!isCharacterPage()) return;

  const resolveAbsoluteUrl = (url) => {
    if (!url) return null;
    if (url.startsWith("//")) return "https:" + url;
    try {
      return new URL(url, location.origin).href;
    } catch {
      return null;
    }
  };

  const extractFilenameFromUrl = (url) => {
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

  const extractVoiceItems = (doc) => {
    const entries = [];
    const seenUrls = new Set();

    const extractJapaneseText = (el) => {
      const trElement = el.closest('tr');
      if (!trElement) return '';
      
      const spans = trElement.querySelectorAll('span[lang="ja"]');
      if (spans.length > 0) {
        let fileName = spans[spans.length - 1].textContent.trim();
        if (fileName.startsWith('▶')) {
          fileName = fileName.slice(1).trim();
        }
        return fileName;
      }
      return '';
    };

    const addVoiceEntry = (src, el) => {
      const url = resolveAbsoluteUrl(src);
      if (!url) return;
      const name = extractFilenameFromUrl(url).toLowerCase();
      if (!name.startsWith("latest")) return;
      if (seenUrls.has(url)) return;
      seenUrls.add(url);
      
      let jpText = extractJapaneseText(el);
      entries.push({ url, line: jpText || '' });
    };

    doc.querySelectorAll("audio, audio source").forEach((el) => {
      const src = el.getAttribute("src") || el.getAttribute("data-src");
      if (src) addVoiceEntry(src, el);
    });

    doc.querySelectorAll("a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (href.match(/\.(mp3|ogg|wav)(\?|$)/i)) {
        addVoiceEntry(href, a);
      }
    });

    return entries;
  };

  // API使ってます
  const extractImageFiles = (doc) => {
    const imageFiles = new Set();

    doc.querySelectorAll('a[href*="/wiki/File:"]').forEach((a) => {
      const href = a.getAttribute("href");
      if (!href) return;

      const fileName = decodeURIComponent(href.split("/wiki/File:")[1] || "");

      if (/\.(mp4|webm|ogv)$/i.test(fileName)) return;
      if (!/\.(png|webp|gif|jpg|jpeg)$/i.test(fileName)) return;

      imageFiles.add(fileName);
    });

    return Array.from(imageFiles);
  };

  const fetchImageUrlsFromApi = async (fileNames) => {
    const results = [];

    if (fileNames.length === 0) return results;

    const chunks = Array.from(
      { length: Math.ceil(fileNames.length / 50) },
      (_, i) => fileNames.slice(i * 50, i * 50 + 50)
    );

    for (const chunk of chunks) {
      const titles = chunk.map((name) => `File:${name}`).join("|");

      const apiUrl = `${location.origin}/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url&format=json`;

      try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        for (const pageId in data.query.pages) {
          const page = data.query.pages[pageId];
          const imageInfo = page.imageinfo?.[0];
          
          if (imageInfo && imageInfo.url) {
            results.push({
              url: imageInfo.url,
              fileName: page.title.replace("File:", ""),
            });
          }
        }
      } catch (err) {
        console.error("API fetch error:", err);
      }
    }

    return results;
  };

  const fetchDocumentSafe = async (url) => {
    try {
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) {
        if (res.status === 404) {
          return null;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const html = await res.text();
      return new DOMParser().parseFromString(html, "text/html");
    } catch (err) {
      return null;
    }
  };

  const processConcurrently = async (items, limit, worker) => {
    const results = new Array(items.length);
    let i = 0;
    let active = 0;
    return new Promise((resolve, reject) => {
      const runNext = () => {
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
              runNext();
            })
            .catch(reject);
        }
      };
      runNext();
    });
  };

  const sanitizeLineText = (text) => {
    if (!text || text.length === 0) return null;
    
    let cleaned = text
      .replace(/[▶▷►▸▹]/g, "")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim();
    
    if (!cleaned || cleaned.length === 0) return null;
    return cleaned.slice(0, 180);
  };

  const convertAudioBufferToWav = (audioBuffer) => {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length * numChannels * 2;
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);

    const writeStringToView = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    let offset = 0;
    writeStringToView(offset, "RIFF");
    offset += 4;
    view.setUint32(offset, 36 + length, true);
    offset += 4;
    writeStringToView(offset, "WAVE");
    offset += 4;
    writeStringToView(offset, "fmt ");
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
    writeStringToView(offset, "data");
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

  const isAnimatedWebp = (arrayBuffer) => {
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length < 16) return false;
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

  const convertImageToPng = async (blob) => {
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

  const downloadItemsToZip = async (items, folder, label, opts = {}) => {
    const nameCount = new Map();
    let done = 0;
    let failed = 0;

    const audioCtx = opts.kind === "audio" ? new AudioContext() : null;

    if (items.length === 0) return { done, failed };

    await processConcurrently(items, 4, async (item) => {
      const url = typeof item === "string" ? item : item.url;
      updateStatus(`${label} ダウンロード中... ${done}/${items.length}`);
      try {
        const res = await fetch(url, { credentials: "omit" });
        if (!res.ok) throw new Error(`Bad status ${res.status}`);
        let blob = await res.blob();

        let filename;
        if (opts.kind === "audio") {
          let line = typeof item === "string" ? "" : item.line;
          let baseName = sanitizeLineText(line);
          
          if (!baseName) {
            baseName = "voice";
          }
          
          let count = nameCount.get(baseName) || 0;
          if (count === 0) {
            filename = `${baseName}.wav`;
          } else {
            filename = `(${count + 1}x) ${baseName}.wav`;
          }
          nameCount.set(baseName, count + 1);
          
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          blob = convertAudioBufferToWav(audioBuffer);
        } else {
          filename = item.fileName || extractFilenameFromUrl(url);
          const originalExt = filename.split('.').pop().toLowerCase();
          const arrayBuffer = await blob.arrayBuffer();
          
          if (originalExt === 'webp' || blob.type === 'image/webp') {
            const isAnimated = isAnimatedWebp(arrayBuffer);
            
            if (isAnimated) {
              if (!filename.toLowerCase().endsWith('.webp')) {
                filename = filename.replace(/\.[^.]*$/, '') + '.webp';
              }
            } else {
              blob = await convertImageToPng(new Blob([arrayBuffer], { type: blob.type }));
              filename = filename.replace(/\.webp$/i, '.png');
              if (!filename.toLowerCase().endsWith('.png')) {
                filename = filename.replace(/\.[^.]*$/, '') + '.png';
              }
            }
          } else if (originalExt === 'gif' || blob.type === 'image/gif') {
            if (!filename.toLowerCase().endsWith('.gif')) {
              filename = filename.replace(/\.[^.]*$/, '') + '.gif';
            }
          } else {
            if (!filename.match(/\.[a-z0-9]+$/i)) {
              const ext = blob.type.split("/")[1];
              if (ext) filename += `.${ext}`;
            }
          }
          
          const key = filename.toLowerCase();
          const count = (nameCount.get(key) || 0) + 1;
          nameCount.set(key, count);
          if (count > 1) {
            const dot = filename.lastIndexOf(".");
            if (dot > 0) {
              filename = `(${count}x) ${filename.slice(0, dot)}${filename.slice(dot)}`;
            } else {
              filename = `(${count}x) ${filename}`;
            }
          }
        }

        folder.file(filename, blob);
        done++;
      } catch (err) {
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

  downloadBtn.addEventListener("click", async () => {
    downloadBtn.disabled = true;
    downloadBtn.style.opacity = "0.7";

    try {
      updateStatus("ページを調べてます...");
      const headingName = extractCharacterNameFromPage();
      const characterName = sanitizeFilename(headingName);
      const rawPageSlug = decodeURIComponent(pageSlug);
      const nameTokens = [
        normalizeTextToken(headingName),
        normalizeTextToken(rawPageSlug),
        normalizeTextToken(rawPageSlug.replace(/\s*\([^)]*\)\s*/g, " "))
      ].filter(Boolean);

      const encodedSlug = encodeURIComponent(rawPageSlug);
      const voicePageUrl = `${location.origin}/wiki/${encodedSlug}/Voice-Overs/Japanese`;
      const mediaPageUrl = `${location.origin}/wiki/${encodedSlug}/Media`;

      updateStatus("ページを取得中...");
      
      const [voiceDoc, mediaDoc] = await Promise.all([
        fetchDocumentSafe(voicePageUrl),
        fetchDocumentSafe(mediaPageUrl)
      ]);

      let voiceEntries = [];
      let mediaItems = [];

      if (voiceDoc) {
        updateStatus("音声を抽出中...");
        voiceEntries = extractVoiceItems(voiceDoc);
      }

      if (mediaDoc) {
        updateStatus("画像を抽出中...");
        const imageFiles = extractImageFiles(mediaDoc);
        
        if (imageFiles.length > 0) {
          updateStatus(`画像URLを取得中... (${imageFiles.length}件)`);
          mediaItems = await fetchImageUrlsFromApi(imageFiles);
        }
      }

      if (voiceEntries.length === 0 && mediaItems.length === 0) {
        updateStatus("データが見つからなかった！");
        return;
      }

      const zipArchive = new JSZip();
      const rootFolder = zipArchive.folder(characterName);
      
      if (voiceEntries.length > 0) {
        const voiceFolder = rootFolder.folder("セリフ素材");
        await downloadItemsToZip(voiceEntries, voiceFolder, "音声", { kind: "audio" });
      }
      
      if (mediaItems.length > 0) {
        const mediaFolder = rootFolder.folder("画像");
        await downloadItemsToZip(mediaItems, mediaFolder, "画像", { kind: "media" });
      }

      updateStatus("ZIP作成中...");
      const zipBlob = await zipArchive.generateAsync(
        { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
        (meta) => {
          const pct = Math.floor(meta.percent || 0);
          updateStatus(`ZIP作成中... ${pct}%`);
        }
      );

      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${characterName}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

      const voiceMsg = voiceEntries.length > 0 ? `音声 ${voiceEntries.length}件` : "";
      const mediaMsg = mediaItems.length > 0 ? `画像 ${mediaItems.length}件` : "";
      updateStatus(`完了！ ${voiceMsg} ${mediaMsg}`.trim());
      
    } catch (err) {
      updateStatus(`エラー: ${err.message || err}`);
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.style.opacity = "1";
    }
  });
})();
