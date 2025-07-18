/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// Tipe untuk data narasi yang terstruktur
interface NarrationData {
  summary: string;
  detailed: string;
}

const App = () => {
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [videoUrl, setVideoUrl] = React.useState<string | null>(null);
  const [narration, setNarration] = React.useState<NarrationData | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string>('');
  
  const [activeTab, setActiveTab] = React.useState<'detailed' | 'summary'>('detailed');
  const [isPlaying, setIsPlaying] = React.useState<boolean>(false);
  const [isVideoBlurred, setIsVideoBlurred] = React.useState<boolean>(false);

  const videoRef = React.useRef<HTMLVideoElement>(null);

  // State untuk pengaturan suara
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = React.useState<SpeechSynthesisVoice | null>(null);
  const [speechRate, setSpeechRate] = React.useState(1);

  React.useEffect(() => {
    const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        if (availableVoices.length === 0) return;

        const indonesianVoices = availableVoices.filter(voice => voice.lang.startsWith('id'));
        const relevantVoices = indonesianVoices.length > 0 ? indonesianVoices : availableVoices;
        
        setVoices(relevantVoices);
        if (!selectedVoice || !relevantVoices.some(v => v.name === selectedVoice.name)) {
            setSelectedVoice(relevantVoices[0] || null);
        }
    };

    // 'voiceschanged' event bisa tidak konsisten, jadi kita panggil langsung dan set listener
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    return () => {
        window.speechSynthesis.cancel();
    };
  }, []);

  const resetState = () => {
    setSelectedFile(null);
    setNarration(null);
    setError('');
    setIsPlaying(false);
    setIsVideoBlurred(false); // Reset blur state
    window.speechSynthesis.cancel();
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    resetState();
    const file = event.target.files ? event.target.files[0] : null;
    if (file && file.type.startsWith('video/')) {
      setSelectedFile(file);
      setVideoUrl(URL.createObjectURL(file));
    } else {
      setSelectedFile(null);
      if (file) {
        setError('Silakan pilih file video yang valid.');
      }
    }
  };

  const fileToGenerativePart = (file: File) => {
    return new Promise<{ inlineData: { mimeType: string, data: string } }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          const base64Data = reader.result.split(',')[1];
          resolve({
            inlineData: {
              mimeType: file.type,
              data: base64Data,
            },
          });
        } else {
          reject(new Error("Gagal membaca file sebagai base64."));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleGenerateNarration = async () => {
    if (!selectedFile) {
      setError('Silakan pilih file video terlebih dahulu.');
      return;
    }
    setIsLoading(true);
    setError('');
    setNarration(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const videoPart = await fileToGenerativePart(selectedFile);
      const prompt = `
        Anda adalah seorang narator video profesional. Tugas Anda adalah menganalisis konten video ini dan membuat dua versi narasi dalam format JSON:
        1.  "summary": Ringkasan singkat dan menarik dari keseluruhan video (sekitar 2-3 kalimat).
        2.  "detailed": Narasi yang mendetail, menjelaskan adegan demi adegan atau poin demi poin yang terjadi dalam video.

        Pastikan narasi terdengar alami, informatif, dan sesuai dengan visual yang ditampilkan. Fokus pada elemen-elemen kunci dalam video.
        Gunakan bahasa Indonesia yang baik dan benar.
      `;
      
      const schema = {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          detailed: { type: Type.STRING },
        },
        required: ["summary", "detailed"]
      };

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          parts: [
            { text: prompt },
            videoPart,
          ]
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });
      
      const jsonText = response.text.trim();
      const parsedNarration: NarrationData = JSON.parse(jsonText);
      setNarration(parsedNarration);

    } catch (err: any) {
      console.error(err);
      setError(`Terjadi kesalahan saat membuat narasi: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handlePlaySync = () => {
    if (!videoRef.current || !narration) return;
    
    if (isPlaying) {
      videoRef.current.pause();
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      videoRef.current.currentTime = 0;
      videoRef.current.play();

      const textToSpeak = activeTab === 'detailed' ? narration.detailed : narration.summary;
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      if(selectedVoice) {
        utterance.voice = selectedVoice;
      }
      utterance.rate = speechRate;
      
      utterance.onstart = () => {
        setIsPlaying(true);
      };
      
      utterance.onend = () => {
        setIsPlaying(false);
        if(videoRef.current) videoRef.current.pause();
      };
      
      window.speechSynthesis.speak(utterance);
    }
  };
  
  const handleNarrationEdit = (e: React.FocusEvent<HTMLDivElement>) => {
    const newText = e.currentTarget.textContent || '';
    if (narration) {
      setNarration({ ...narration, [activeTab]: newText });
    }
  };

  const downloadText = () => {
      if (!narration) return;
      const text = activeTab === 'detailed' ? narration.detailed : narration.summary;
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `narasi-${activeTab}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  // This is a placeholder as direct audio download is complex
  const downloadAudio = () => {
      alert("Fitur unduh audio sedang dalam pengembangan. Anda dapat menggunakan perekam layar untuk saat ini.");
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Narator Video AI</h1>
        <p>Unggah video pendek (disarankan &lt; 1 menit) dan dapatkan narasi yang dibuat secara otomatis oleh AI. Anda bisa mengedit, memilih suara, dan menyinkronkannya dengan video.</p>
      </div>

      {!narration && !isLoading && (
        <div className="file-upload-area" onClick={() => document.getElementById('file-upload')?.click()}>
            <input type="file" id="file-upload" accept="video/*" onChange={handleFileChange} />
            <label htmlFor="file-upload" className="file-upload-label">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9A2.25 2.25 0 0 0 13.5 5.25h-9A2.25 2.25 0 0 0 2.25 7.5v9A2.25 2.25 0 0 0 4.5 18.75Z" />
                </svg>
                {selectedFile ? <span>{selectedFile.name}</span> : <span>Klik untuk memilih atau jatuhkan file video di sini</span>}
            </label>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {selectedFile && !narration && !isLoading && (
        <button className="btn" onClick={handleGenerateNarration} disabled={isLoading}>
          Buat Narasi
        </button>
      )}

      {isLoading && (
          <div className="loader">
              <div className="spinner"></div>
              <span>AI sedang menganalisis video dan membuat narasi... Mohon tunggu.</span>
          </div>
      )}

      {narration && videoUrl && (
        <div className="results-layout">
          <div className="video-container">
            <div className="video-player-wrapper">
                <video ref={videoRef} src={videoUrl} className={isVideoBlurred ? 'blurred' : ''} key={videoUrl}></video>
            </div>
            <div className="video-controls">
                <span className="toggle-switch-label">Sembunyikan Video</span>
                <label className="toggle-switch">
                    <input type="checkbox" checked={isVideoBlurred} onChange={(e) => setIsVideoBlurred(e.target.checked)} />
                    <span className="slider round"></span>
                </label>
            </div>
            
            <button
                className={`action-btn sync-button ${isPlaying ? 'playing' : ''}`}
                onClick={handlePlaySync}
            >
                {isPlaying ? (
                    <>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 6.5v11h11v-11h-11ZM5 5h14v14H5V5Z" /></svg>
                        Hentikan Sinkronisasi
                    </>
                ) : (
                    <>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v14l11-7-11-7Z" /></svg>
                        Putar & Sinkronkan
                    </>
                )}
            </button>
            <button className="btn" style={{marginTop: '1rem', backgroundColor: 'var(--text-light)'}} onClick={resetState}>Unggah Video Lain</button>
          </div>

          <div className="narration-container">
            <div className="tab-buttons">
              <button
                className={`tab-btn ${activeTab === 'detailed' ? 'active' : ''}`}
                onClick={() => setActiveTab('detailed')}
              >
                Narasi Detail
              </button>
              <button
                className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
                onClick={() => setActiveTab('summary')}
              >
                Ringkasan
              </button>
            </div>
            <div className="results-content">
                <div 
                    contentEditable
                    suppressContentEditableWarning={true}
                    className="editable-narration"
                    onBlur={handleNarrationEdit}
                    key={activeTab}
                >
                    {activeTab === 'detailed' ? narration.detailed : narration.summary}
                </div>
            </div>

            <div className="voice-settings">
                <div className="setting-control">
                    <label htmlFor="voice-select">Suara Narator:</label>
                    <select
                        id="voice-select"
                        value={selectedVoice ? selectedVoice.name : ''}
                        onChange={(e) => setSelectedVoice(voices.find(v => v.name === e.target.value) || null)}
                    >
                        {voices.map(voice => (
                            <option key={voice.name} value={voice.name}>
                                {voice.name} ({voice.lang})
                            </option>
                        ))}
                    </select>
                </div>
                <div className="setting-control">
                    <label htmlFor="rate-slider">Kecepatan:</label>
                    <input
                        type="range"
                        id="rate-slider"
                        min="0.5"
                        max="2"
                        step="0.1"
                        value={speechRate}
                        onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                    />
                </div>
            </div>
            <div className="action-buttons">
                 <button className="action-btn download-text-button" onClick={downloadText}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 15.586 6.707 10.293l1.414-1.414L12 12.758l3.879-3.879 1.414 1.414L12 15.586ZM12 18H6v-2h6v2Zm6-8h-4V4h-4v6H6l6 6 6-6Z" /></svg>
                    Unduh Teks
                </button>
                <button className="action-btn download-audio-button" onClick={downloadAudio}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 19V5h12.4l-4.7 4.7 1.4 1.4 6.3-6.3V19H3ZM3 17h18v-2H3v2Z" /></svg>
                    Unduh Audio
                </button>
            </div>
            <p className="audio-download-notice">Unduh audio menggunakan suara dan kecepatan yang dipilih. (Fitur dalam pengembangan)</p>
          </div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
