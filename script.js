// Elemen UI
const audioInput = document.getElementById('audioInput');
const detectBeatsButton = document.getElementById('detectBeats');
const exportAllButton = document.getElementById('exportAll');
const slicesList = document.getElementById('slicesList');
let audioBuffer;
let audioContext;
let wavesurfer;
let slices = [];

// Inisialisasi Wavesurfer
document.addEventListener('DOMContentLoaded', () => {
  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: 'violet',
    progressColor: 'purple',
    backend: 'MediaElement',
    height: 100
  });
});

// Muat file audio
audioInput.addEventListener('change', async (event) => {
  try {
    const file = event.target.files[0];
    const arrayBuffer = await file.arrayBuffer();
    audioContext = new AudioContext();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Muat ke Wavesurfer
    wavesurfer.load(URL.createObjectURL(new Blob([arrayBuffer], { type: file.type })));
  } catch (error) {
    alert('Gagal memuat file audio!');
    console.error(error);
  }
});

// Deteksi beat
detectBeatsButton.addEventListener('click', () => {
  if (!audioBuffer) {
    alert('Silakan muat audio terlebih dahulu!');
    return;
  }
  
  const tempo = 120; // BPM
  slices = createSlices(audioBuffer, tempo);
  displaySlices(slices);
});

// Buat slice berdasarkan tempo
function createSlices(buffer, tempo) {
  const secondsPerBeat = 60 / tempo;
  const secondsPerBar = secondsPerBeat * 4;
  const sliceDuration = secondsPerBar / 8;
  
  let slices = [];
  let startTime = 0;
  
  while (startTime < buffer.duration) {
    const endTime = Math.min(startTime + sliceDuration, buffer.duration);
    slices.push({ startTime, endTime });
    startTime = endTime;
  }
  
  return slices;
}

// Generate nama slice (C1, C#1, D1, dst)
function generateSliceNames(count) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  let names = [];
  let octave = 1;
  
  for (let i = 0; i < count; i++) {
    names.push(`${notes[i % 12]}${octave}`);
    if (notes[i % 12] === 'B') octave++;
  }
  
  return names;
}

// Tampilkan slice di UI
function displaySlices(slices) {
  slicesList.innerHTML = '';
  const names = generateSliceNames(slices.length);
  
  slices.forEach((slice, i) => {
    const div = document.createElement('div');
    div.className = 'slice';
    div.innerHTML = `
      <span>${names[i]} (${slice.startTime.toFixed(2)}s-${slice.endTime.toFixed(2)}s)</span>
      <button onclick="playSlice(${slice.startTime}, ${slice.endTime})">Play</button>
      <button class="export-btn" data-index="${i}">Export</button>
    `;
    slicesList.appendChild(div);
  });
}

// Play slice
function playSlice(start, end) {
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start(0, start, end - start);
}

// Ekspor semua slice ke ZIP
exportAllButton.addEventListener('click', async () => {
  if (!slices.length) {
    alert('Tidak ada slice yang bisa diekspor!');
    return;
  }
  
  const zip = new JSZip();
  const names = generateSliceNames(slices.length);
  const baseName = audioInput.files[0].name.replace(/\.[^/.]+$/, '');
  
  // Tampilkan loading
  const loading = document.createElement('div');
  loading.textContent = 'Membuat ZIP...';
  slicesList.appendChild(loading);
  
  // Ekspor semua slice
  for (let i = 0; i < slices.length; i++) {
    loading.textContent = `Memproses ${i+1}/${slices.length}...`;
    const wav = await createSliceWav(slices[i].startTime, slices[i].endTime);
    zip.file(`${names[i]}.wav`, wav);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  // Download ZIP
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `a.${baseName}.zip`);
  loading.textContent = 'Selesai!';
  setTimeout(() => loading.remove(), 2000);
});

// Buat file WAV dari slice
async function createSliceWav(start, end) {
  const duration = end - start;
  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    duration * audioBuffer.sampleRate,
    audioBuffer.sampleRate
  );
  
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0, start, duration);
  
  return bufferToWav(await offlineCtx.startRendering());
}

// Konversi AudioBuffer ke WAV
function bufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length * numChannels * 2 + 44;
  const bufferWav = new ArrayBuffer(length);
  const view = new DataView(bufferWav);
  
  // Write WAV header
  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + buffer.length * numChannels * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, buffer.length * numChannels * 2, true);
  
  // Write audio samples
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return bufferWav;
}