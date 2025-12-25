import { useState, useRef, useEffect } from "react";
import { Mic, Square, Settings, Copy, Download, Clock, Check } from "lucide-react";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
// Note: Ensure you ran: npm install @tauri-apps/plugin-dialog @tauri-apps/plugin-fs
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import "./App.css";

// Securely pull the API Key from Vite environment
const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [fullHistory, setFullHistory] = useState<string[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [copied, setCopied] = useState(false);

  const socketRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  // 1. Session Timer Logic
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      setSeconds(0);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  // 2. Auto-scroll History
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [fullHistory]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      // Safety check for API Key
      if (!DEEPGRAM_API_KEY) {
        console.error("Missing API Key in .env");
        alert("Error: VITE_DEEPGRAM_API_KEY is not defined in your .env file.");
        return;
      }

      const deepgram = createClient(DEEPGRAM_API_KEY);
      const connection = deepgram.listen.live({
        model: "nova-2",
        language: "en-US",
        smart_format: true,
        interim_results: true,
      });

      socketRef.current = connection;

      connection.on(LiveTranscriptionEvents.Open, async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0 && connection.getReadyState() === 1) {
            connection.send(event.data);
          }
        };

        recorder.start(250);
        setIsRecording(true);
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const text = data.channel.alternatives[0].transcript;
        if (text) {
          setTranscript(text);
          setIsVisible(true);

          if (data.is_final) {
            setFullHistory((prev) => [...prev, text]);
          }

          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => setIsVisible(false), 10000);
        }
      });

      connection.on(LiveTranscriptionEvents.Error, (err) => {
        console.error("Deepgram Socket Error:", err);
      });

    } catch (err) {
      console.error("Setup Error:", err);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    setIsVisible(false);
    if (socketRef.current) socketRef.current.finish();
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  };

  const copyToClipboard = () => {
    const textToCopy = fullHistory.join(" ");
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveSession = async () => {
    if (fullHistory.length === 0) return;
    try {
      const filePath = await save({
        filters: [{ name: 'Text', extensions: ['txt'] }],
        defaultPath: 'vocalist-transcript.txt'
      });

      if (filePath) {
        const content = fullHistory.join("\n");
        await writeTextFile(filePath, content);
      }
    } catch (err) {
      console.error("Save Error:", err);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo-section">
          <div className="logo-dot"></div>
          <span>VOCALIST PRO</span>
        </div>
        
        {isRecording && (
          <div className="timer">
            <Clock size={14} style={{ marginRight: 6 }} /> {formatTime(seconds)}
          </div>
        )}

        <div className="header-actions">
          {fullHistory.length > 0 && (
            <>
              <button className="icon-btn" onClick={copyToClipboard} title="Copy All">
                {copied ? <Check size={18} style={{ color: '#4ade80' }} /> : <Copy size={18} />}
              </button>
              <button className="icon-btn" onClick={saveSession} title="Save to File">
                <Download size={18} />
              </button>
            </>
          )}
          <Settings size={18} className="icon-btn" />
        </div>
      </header>

      <main className="content">
        <div className="history-pane">
          {fullHistory.length === 0 && !isRecording && (
            <p style={{ color: '#4b5563', textAlign: 'center', marginTop: '40px' }}>
              Your session history will appear here...
            </p>
          )}
          {fullHistory.map((h, i) => (
            <div key={i} className="history-item">{h}</div>
          ))}
          <div ref={historyEndRef} />
        </div>

        <div className="live-area">
          <div className="visualizer-container">
            {[...Array(10)].map((_, i) => (
              <div 
                key={i} 
                className={`bar ${isRecording ? 'animating' : ''}`} 
                style={{ animationDelay: `${i * 0.05}s` }}
              ></div>
            ))}
          </div>
          
          <p className={`text-content ${isVisible ? 'visible' : 'hidden'}`}>
            {transcript || (isRecording ? "Listening..." : "")}
          </p>
        </div>
      </main>

      <footer className="footer">
        <button 
          className={`record-btn ${isRecording ? 'active' : ''}`} 
          onClick={isRecording ? stopRecording : startRecording}
        >
          {isRecording ? <Square size={24} fill="currentColor" /> : <Mic size={24} />}
        </button>
      </footer>
    </div>
  );
}

export default App;