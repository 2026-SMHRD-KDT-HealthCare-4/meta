"use client";

import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import CameraFeed from "./components/CameraFeed";

interface Metric {
  semantic_energy: number;
  survival_probability: number;
  logic_consistency: boolean;
  bloom_level: number;
  ciqs: number;
  grade?: string;
  grade_label?: string;
  grade_color?: string;
  status_code?: string;
  status_msg?: string;
  depth: number;
  is_collapsed: boolean;
  gaze_focus?: number; 
  reason?: string; 
}

interface Message {
  role: "system" | "user";
  content: string;
  metrics?: Metric;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

export default function InterviewerConsole() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [metricsHistory, setMetricsHistory] = useState<Metric[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTerminal, setIsTerminal] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [questionOptions, setQuestionOptions] = useState<string[] | null>(null);
  const [isManualInput, setIsManualInput] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldListenRef = useRef(false);
  const baseInputRef = useRef(""); 

  const [currentExpression, setCurrentExpression] = useState({ label: "neutral", probability: 0, gaze: 0 });

  // RAG 관련 상태
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isInterviewStarted, setIsInterviewStarted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles].slice(0, 5));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      const newFiles = Array.from(e.dataTransfer.files);
      setFiles(prev => [...prev, ...newFiles].slice(0, 5));
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (files.length === 0) {
      setIsInterviewStarted(true);
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    files.forEach(file => formData.append("files", file));
    
    try {
      // localhost 대신 127.0.0.1 시도 (일부 환경 브라우저 이슈 대응)
      const response = await fetch("http://127.0.0.1:8000/upload", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Server error");
      }
      
      const data = await response.json();
      setSessionId(data.session_id);
      setIsInterviewStarted(true);
    } catch (error) {
      console.error("Upload failed:", error);
      alert(`파일 업로드에 실패했습니다: ${error instanceof Error ? error.message : "네트워크 오류"}\n백엔드 서버가 실행 중인지 확인해 주세요.`);
    } finally {
      setIsUploading(false);
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, questionOptions]);

  const handleExpressionDetected = (label: string, probability: number, gaze: number) => {
    setCurrentExpression({ label, probability, gaze });
  };

  const startSTT = () => {
    if (recognitionRef.current && !isListening) {
      baseInputRef.current = input; 
      shouldListenRef.current = true;
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {}
    }
  };

  const stopSTT = () => {
    shouldListenRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  useEffect(() => {
    setIsClient(true);
    if (!isInterviewStarted) return;

    socketRef.current = new WebSocket("ws://localhost:8000/ws/interview");

    socketRef.current.onopen = () => {
      setIsConnected(true);
      // 세션 ID가 있으면 초기 메시지로 전송
      socketRef.current?.send(JSON.stringify({ session_id: sessionId }));
    };
    socketRef.current.onclose = () => setIsConnected(false);
    socketRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "probe") {
        setMessages((prev) => [...prev, { role: "system", content: data.content, metrics: data.metrics }]);
        if (data.metrics?.depth !== undefined) setMetricsHistory((prev) => [...prev, data.metrics]);
        
        // 초기 추천 질문이 있으면 설정
        if (data.initial_recommendations) {
          setQuestionOptions(data.initial_recommendations);
        }
        
        setTimeout(startSTT, 100);
      } else if (data.type === "metrics_update") {
        if (data.metrics?.depth !== undefined) setMetricsHistory((prev) => [...prev, data.metrics]);
        setMessages((prev) => {
            const newM = [...prev];
            for (let i = newM.length - 1; i >= 0; i--) {
                if (newM[i].role === "user" && !newM[i].metrics) { newM[i].metrics = data.metrics; break; }
            }
            return newM;
        });
      } else if (data.type === "option_chunk") {
        setQuestionOptions((prev) => {
          const n = prev ? [...prev] : ["", ""];
          n[data.index] += data.content;
          return n;
        });
      } else if (data.type === "question_options_complete") {
        setQuestionOptions(data.options);
      } else if (data.type === "alert") {
        setMessages((prev) => [...prev, { role: "system", content: data.content }]);
      } else if (data.type === "terminal") {
        setMessages((prev) => [...prev, { role: "system", content: `🚨 [면접 전략 알림] ${data.content}` }]);
      }
    };

    if (typeof window !== "undefined") {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        recognitionRef.current = new SR();
        recognitionRef.current!.continuous = true;
        recognitionRef.current!.interimResults = true;
        recognitionRef.current!.lang = "ko-KR";

        recognitionRef.current!.onresult = (event: SpeechRecognitionEvent) => {
          let currentTranscript = "";
          for (let i = 0; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          const combined = baseInputRef.current.trim() 
            ? `${baseInputRef.current.trim()} ${currentTranscript}` 
            : currentTranscript;
          setInput(combined);
        };

        recognitionRef.current!.onend = () => {
          if (shouldListenRef.current && !isTerminal) {
            try { recognitionRef.current?.start(); } catch (e) {}
          } else { setIsListening(false); }
        };
      }
    }

    return () => {
      socketRef.current?.close();
      stopSTT();
    };
  }, [isInterviewStarted, isTerminal]);

  const toggleListening = () => {
    if (isListening) stopSTT(); else startSTT();
  };

  const sendMessage = () => {
    if (!input.trim() || isTerminal) return;
    stopSTT();
    const isSelect = !!(questionOptions && isManualInput);
    socketRef.current?.send(JSON.stringify({ 
      type: isSelect ? "select" : "answer", 
      content: input,
      expression: currentExpression.label, 
      expression_probability: currentExpression.probability, 
      gaze_focus: currentExpression.gaze 
    }));
    setMessages(prev => [...prev, { role: isSelect ? "system" : "user", content: input }]);
    setInput(""); setQuestionOptions(null); setIsManualInput(false);
  };

  const selectOption = (index: number) => {
    if (!questionOptions) return;
    const content = questionOptions[index];
    socketRef.current?.send(JSON.stringify({ type: "select", content }));
    setMessages(prev => [...prev, { role: "system", content }]);
    setQuestionOptions(null);
    setTimeout(startSTT, 500); 
  };

  const [isResultOpen, setIsResultOpen] = useState(false);
  const currentMetrics = metricsHistory[metricsHistory.length - 1];

  const getExpressionLabel = (label: string) => {
    const labels: Record<string, string> = {
      neutral: "평온/중립", happy: "긍정/자신감", surprised: "당황/놀람",
      sad: "위축/슬픔", fearful: "불안/긴장", disgusted: "거부감/불쾌", angry: "공격적/흥분",
    };
    return labels[label] || "분석 중...";
  };

  if (!isClient) return null;

  if (!isInterviewStarted) {
    return (
      <div className="flex h-screen bg-black text-white font-mono items-center justify-center p-8">
        <div className="max-w-2xl w-full bg-gray-900 border border-gray-800 p-12 rounded-[3rem] shadow-2xl flex flex-col gap-8">
          <div className="text-center">
            <h1 className="text-4xl font-black text-blue-500 uppercase tracking-tighter mb-2">AI Metacognition Interview</h1>
            <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">이력서 및 포트폴리오 업로드 (선택사항)</p>
          </div>

          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-3xl p-10 flex flex-col items-center gap-4 transition-all ${isDragging ? "border-blue-500 bg-blue-500/10" : "border-gray-800 hover:border-blue-500/50"}`}
          >
            <svg className={`w-12 h-12 transition-colors ${isDragging ? "text-blue-500" : "text-gray-700"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            <div className="text-center">
              <label className="cursor-pointer bg-gray-800 px-6 py-2 rounded-full text-xs font-black hover:bg-gray-700 transition-colors">
                파일 선택 또는 드래그
                <input type="file" multiple className="hidden" onChange={handleFileChange} accept=".pdf,.docx,.txt" />
              </label>
              <p className="mt-3 text-[10px] text-gray-600 uppercase font-bold">PDF, DOCX, TXT 지원 (최대 5개)</p>
            </div>
          </div>

          {files.length > 0 && (
            <div className="bg-black/40 rounded-2xl p-4 space-y-2">
              <p className="text-[10px] text-blue-500 font-black uppercase mb-2">선택된 파일 목록</p>
              {files.map((f, i) => (
                <div key={i} className="flex justify-between items-center text-xs text-gray-400 group">
                  <span className="truncate flex-1 pr-4">{f.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] opacity-50">{(f.size/1024).toFixed(1)}KB</span>
                    <button onClick={() => removeFile(i)} className="text-gray-600 hover:text-red-500 transition-colors">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button 
            onClick={uploadFiles} 
            disabled={isUploading}
            className={`w-full py-5 rounded-2xl text-[16px] font-black uppercase tracking-[0.4em] transition-all shadow-xl ${isUploading ? "bg-gray-800 text-gray-600" : "bg-blue-600 text-white hover:bg-white hover:text-blue-600"}`}
          >
            {isUploading ? "UPLOADING..." : "인터뷰 시작하기"}
          </button>
          
          <p className="text-center text-[9px] text-gray-700 uppercase font-bold">세션 종료 시 모든 데이터는 즉시 영구 삭제됩니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-black text-white font-mono overflow-hidden">
      <div className="flex flex-1 pb-56 overflow-hidden">
        
        {/* Left Monitor */}
        <div className="w-1/2 border-r border-gray-800 p-8 flex flex-col gap-6 bg-gray-900/30 overflow-hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-blue-500 uppercase tracking-tighter">지원자 실시간 모니터링</h2>
            <div className={`text-[10px] px-3 py-1 border rounded-full font-bold ${isConnected ? "text-green-500 border-green-500 animate-pulse" : "text-red-500 border-red-500"}`}>
                {isConnected ? "LIVE_ANALYSIS" : "OFFLINE"}
            </div>
          </div>

          <div className="flex-1 relative rounded-[2.5rem] overflow-hidden border-2 border-gray-800 shadow-2xl">
            <CameraFeed onExpressionDetected={handleExpressionDetected} />
          </div>
            
          <div className="grid grid-cols-2 gap-4 h-16">
            <div className="bg-black/60 border border-gray-800 px-6 rounded-2xl flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[9px] text-gray-500 font-black uppercase">Emotion/Gaze</span>
                <span className="text-xl font-black text-blue-400 leading-none">{getExpressionLabel(currentExpression.label)}</span>
              </div>
              <div className="text-right flex flex-col">
                <span className="text-[16px] font-mono font-bold text-white/50">{(currentExpression.probability*100).toFixed(0)}% / {(currentExpression.gaze*100).toFixed(0)}%</span>
              </div>
            </div>

            <button 
              onClick={() => setIsResultOpen(true)}
              className="h-full bg-blue-600 border border-blue-400 text-white text-[16px] font-black hover:bg-white hover:text-blue-600 transition-all uppercase tracking-[0.2em] rounded-2xl shadow-lg"
            >
              면접 상세 로그
            </button>
          </div>
        </div>

        {/* Right Console */}
        <div className="w-1/2 flex flex-col bg-black border-l border-gray-800 relative">
          <div className="p-4 border-b border-gray-800 bg-gray-950 flex justify-between items-center">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em]">질문 설계 및 답변 분석 시스템</span>
              {currentMetrics?.status_msg && (
                <span className={`text-[11px] font-black mt-1.5 animate-pulse flex items-center gap-1.5 ${currentMetrics.status_code === "STABLE" ? "text-green-500" : currentMetrics.status_code === "CAUTION" ? "text-yellow-500" : "text-red-500"}`}>
                  <span className="w-2 h-2 rounded-full bg-current"></span>
                  {currentMetrics.status_msg}
                </span>
              )}
            </div>
            <button onClick={() => window.location.reload()} className="text-[10px] text-gray-700 hover:text-red-500 transition-colors uppercase font-black tracking-widest">[ Reset Session ]</button>
          </div>

          <div className="flex-1 p-10 overflow-y-auto space-y-10 font-mono scrollbar-hide">
            {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-gray-800 opacity-20">
                    <p className="text-sm font-black uppercase tracking-[0.5em] text-center">주제를 입력하여 분석을 시작하십시오</p>
                </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] p-7 rounded-[2rem] border shadow-2xl ${msg.role === "user" ? "bg-blue-600 border-blue-400 text-white rounded-tr-none" : "bg-gray-900 border-gray-800 text-gray-200 rounded-tl-none"}`}>
                  <p className="leading-relaxed text-base font-medium">{msg.content}</p>
                </div>
              </div>
            ))}
            
            {questionOptions && (
              <div className="flex flex-col gap-4 pt-4 animate-in fade-in slide-in-from-bottom-8">
                <div className="flex items-center gap-4 px-10">
                  <div className="flex-1 h-px bg-gray-800"></div>
                  <p className="text-[9px] text-blue-500 font-black uppercase tracking-[0.4em]">Selection Required</p>
                  <div className="flex-1 h-px bg-gray-800"></div>
                </div>
                <div className="grid grid-cols-1 gap-4 px-4">
                  <button onClick={() => selectOption(0)} className={`p-5 border transition-all rounded-[1.5rem] text-left group ${!isManualInput ? "bg-blue-900/10 border-blue-500/30 text-blue-200 hover:bg-blue-600 hover:text-white" : "bg-black/20 border-gray-800/50 text-gray-500 opacity-40"}`}>
                    <span className="text-[8px] font-black block mb-1 opacity-50 uppercase">A. Logic Focus</span>
                    <p className="text-sm leading-relaxed font-bold">{questionOptions[0]}</p>
                  </button>
                  <button onClick={() => selectOption(1)} className={`p-5 border transition-all rounded-[1.5rem] text-left group ${!isManualInput ? "bg-purple-900/10 border-purple-500/30 text-purple-200 hover:bg-purple-600 hover:text-white" : "bg-black/20 border-gray-800/50 text-gray-500 opacity-40"}`}>
                    <span className="text-[8px] font-black block mb-1 opacity-50 uppercase">B. Creative Focus</span>
                    <p className="text-sm leading-relaxed font-bold">{questionOptions[1]}</p>
                  </button>
                  <button onClick={() => setIsManualInput(!isManualInput)} className={`p-4 border transition-all rounded-[1.5rem] text-center group hover:bg-yellow-600 hover:text-white ${isManualInput ? "bg-yellow-900/10 border-yellow-500/50 text-yellow-200" : "bg-black/40 border-gray-800/50 text-gray-600"}`}>
                    <span className="text-[14px] font-black uppercase tracking-widest">{isManualInput ? "직접 입력 모드 활성화 중" : "[ 직접 질문 입력하기 ]"}</span>
                  </button>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 bg-gray-950 border-t border-gray-800">
            <div className={`relative flex items-center bg-black/50 border rounded-full px-4 py-1.5 transition-all ${isManualInput ? "border-yellow-500/60 shadow-[0_0_15px_rgba(234,179,8,0.1)]" : "border-gray-800 focus-within:border-blue-500"}`}>
              <button onClick={toggleListening} className={`w-9 h-9 flex items-center justify-center rounded-full transition-all shrink-0 ${isListening ? "bg-red-500 text-white animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]" : "bg-gray-800 text-gray-500 hover:bg-gray-700"}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 00-3 3v8a3 3 0 006 0V5a3 3 0 00-3-3z" /></svg>
              </button>
              <div className={`text-lg font-bold mx-3 ${isManualInput ? "text-yellow-500" : "text-blue-500"}`}>{isManualInput ? "?" : ">"}</div>
              <input type="text" className="w-full bg-transparent border-none text-white py-2 focus:outline-none placeholder:text-gray-800 font-mono text-base" placeholder={isListening ? "음성 인식 중 (말이 끝나면 ANALYZE를 누르세요)..." : "답변 입력..."} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} disabled={!isConnected || isTerminal || (!!questionOptions && !isManualInput)} />
              <button className={`ml-3 px-8 py-2 text-[10px] font-black rounded-full transition-all ${isManualInput ? "bg-yellow-600 text-white" : "bg-blue-600 text-white hover:bg-white hover:text-blue-600 shadow-md"}`} onClick={sendMessage} disabled={!isConnected || isTerminal || (!!questionOptions && !isManualInput)}>{isManualInput ? "SEND" : "ANALYZE"}</button>
            </div>
          </div>
        </div>
      </div>

      {/* EXPANDED BOTTOM METRICS BAR (h-56) with STANDARDIZED BOXES */}
      <div className="fixed bottom-0 left-0 right-0 h-56 bg-gray-950/95 backdrop-blur-3xl border-t border-gray-800 grid grid-cols-5 p-6 gap-6 z-40">
        
        {/* Metric 1: Stability */}
        <div className="border border-blue-500/20 bg-blue-500/5 rounded-[2rem] p-5 flex flex-col justify-between">
          <p className="text-[12px] text-blue-500 font-black uppercase tracking-[0.2em]">인지적 안정도 추이</p>
          <div className="flex-1 relative my-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metricsHistory} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs><linearGradient id="cSurv" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={true} horizontal={false} />
                <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} stroke="#444" fontSize={11} width={25} />
                <Area type="monotone" dataKey="survival_probability" stroke="#3b82f6" strokeWidth={4} fill="url(#cSurv)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between items-baseline">
            <p className="text-sm font-mono font-black text-blue-400">{(currentMetrics?.survival_probability || 0).toFixed(4)}</p>
            <p className="text-[10px] text-gray-600 font-bold uppercase">Stability_Idx</p>
          </div>
        </div>

        {/* Metric 2: Uncertainty */}
        <div className="border border-red-500/20 bg-red-500/5 rounded-[2rem] p-5 flex flex-col justify-between">
          <p className="text-[12px] text-red-500 font-black uppercase tracking-[0.2em]">지식 불확실성 측정</p>
          <div className="flex-1 relative my-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metricsHistory} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={true} horizontal={false} />
                <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} stroke="#444" fontSize={11} width={25} />
                <Line type="step" dataKey="semantic_energy" stroke="#ef4444" strokeWidth={4} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between items-baseline">
            <p className="text-sm font-mono font-black text-red-400">{(currentMetrics?.semantic_energy || 0).toFixed(4)}</p>
            <p className="text-[10px] text-gray-600 font-bold uppercase">Noise_Factor</p>
          </div>
        </div>

        {/* Metric 3: Bloom Level */}
        <div className="border border-white/10 bg-white/5 rounded-[2rem] p-5 flex flex-col justify-between items-center">
          <p className="text-[12px] text-gray-400 font-black uppercase tracking-[0.2em] w-full text-left">사고 위계 단계</p>
          <p className="text-7xl font-black text-white italic tracking-tighter leading-none py-2">LV.{currentMetrics?.bloom_level || "0"}</p>
          <p className="text-[11px] text-gray-600 font-black uppercase tracking-widest w-full text-right">Cognitive Depth</p>
        </div>

        {/* Metric 4: CIQS */}
        <div className="border border-yellow-500/20 bg-yellow-500/5 rounded-[2rem] p-5 flex flex-col justify-between items-center">
          <p className="text-[12px] text-yellow-600 font-black uppercase tracking-[0.2em] w-full text-left">종합 메타인지 점수</p>
          <p className="text-7xl font-black text-yellow-500 tracking-tighter drop-shadow-[0_0_40px_rgba(234,179,8,0.25)] leading-none py-2">
            {currentMetrics?.ciqs?.toFixed(2) || "0.00"}
          </p>
          <p className="text-[11px] text-yellow-700 font-black uppercase tracking-widest w-full text-right">Metacognition Index</p>
        </div>

        {/* Metric 5: Grade (NEW) */}
        <div className="border border-gray-500/20 bg-gray-500/5 rounded-[2rem] p-5 flex flex-col justify-between items-center" style={{ borderColor: `${currentMetrics?.grade_color}44`, backgroundColor: `${currentMetrics?.grade_color}11` }}>
          <p className="text-[12px] font-black uppercase tracking-[0.2em] w-full text-left" style={{ color: currentMetrics?.grade_color || "#6b7280" }}>메타인지 역량 등급</p>
          <div className="flex flex-col items-center py-2">
            <p className="text-4xl font-black tracking-tighter leading-none mb-1" style={{ color: currentMetrics?.grade_color || "white" }}>
              {currentMetrics?.grade || "분석 중"}
            </p>
            <p className="text-xs font-bold uppercase tracking-[0.3em] opacity-60" style={{ color: currentMetrics?.grade_color || "white" }}>
              {currentMetrics?.grade_label || "Initial State"}
            </p>
          </div>
          <p className="text-[11px] font-black uppercase tracking-widest w-full text-right opacity-40">Performance Tier</p>
        </div>
      </div>

      {/* AUDIT MODAL */}
      {isResultOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 sm:p-8 print:bg-white print:p-0 print:static print:block print:z-0">
          <div className="print-container w-full max-w-6xl h-full max-h-[95vh] bg-gray-900 border border-blue-500/30 p-6 sm:p-10 rounded-[2rem] shadow-2xl relative overflow-hidden flex flex-col border-blue-500/20 print-modal">
            <button onClick={() => setIsResultOpen(false)} className="no-print absolute top-6 right-8 text-gray-500 hover:text-white font-mono text-2xl transition-all">✕</button>
            <div className="mb-6 text-center sm:text-left">
              <h1 className="text-3xl font-black text-white tracking-tighter leading-none print:text-black print:text-2xl print:mb-8">면접 기록</h1>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide print-scrollable">
              {messages.map((msg, idx) => (
                <div key={idx} className={`p-5 rounded-2xl border print-item ${msg.role === "system" ? "bg-white/5 border-white/10" : "bg-blue-600/5 border-blue-500/20"}`}>
                    <div className="flex justify-between items-center mb-3">
                        <span className={`text-[10px] font-black px-4 py-1 rounded-full uppercase tracking-widest ${msg.role === "system" ? "bg-gray-800 text-gray-400 print-label-question" : "bg-blue-600 text-white print-label-answer"}`}>
                            {msg.role === "system" ? "Question" : "Answer"}
                        </span>
                        {msg.metrics && (
                            <div className="flex gap-4 text-[16px] font-mono font-bold no-print">
                                <span className="text-blue-400">STABILITY: {msg.metrics.survival_probability.toFixed(2)}</span>
                                <span className="text-red-400">NOISE: {msg.metrics.semantic_energy.toFixed(2)}</span>
                                <span className="text-yellow-500">CIQS: {msg.metrics.ciqs.toFixed(2)}</span>
                            </div>
                        )}
                    </div>
                    <p className="text-base text-gray-100 leading-relaxed font-sans mb-4 print:text-black print:mb-2">{msg.content}</p>
                    
                    {/* 변동 사유 및 인사이트 표시 강화 - 인쇄 시에도 포함 (사용자 요청: 분석 인사이트가 핵심) */}
                    {msg.metrics?.reason && (
                        <div className="bg-black/60 border-l-4 border-blue-500 p-4 rounded-r-xl shadow-inner print:bg-white print:border-gray-300 print:border-l-2 print:shadow-none print:mt-4 print:py-2 print:px-4">
                            <p className="text-[10px] text-blue-400 font-black uppercase mb-1 tracking-widest flex items-center gap-2 print:text-black print:font-bold">
                                <svg className="w-3 h-3 no-print" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                분석 인사이트 (Analysis Insight)
                            </p>
                            <p className="text-sm text-gray-300 italic font-sans leading-relaxed print:text-gray-700 print:not-italic">
                                {msg.metrics.reason}
                            </p>
                        </div>
                    )}
                </div>
              ))}

              {/* PDF 인쇄 시 최하단에 표시될 지표 섹션 */}
              <div className="hidden print:block mt-12 pt-10 border-t-2 border-black break-inside-avoid">
                <h2 className="text-3xl font-black mb-8 text-black tracking-tighter">지표</h2>
                <div className="grid grid-cols-3 gap-6">
                  <div className="border border-black p-6 rounded-xl">
                    <p className="text-xs font-bold text-gray-600 uppercase mb-2">종합 메타인지 점수</p>
                    <p className="text-4xl font-black text-black">{(currentMetrics?.ciqs || 0).toFixed(2)}</p>
                  </div>
                  <div className="border border-black p-6 rounded-xl">
                    <p className="text-xs font-bold text-gray-600 uppercase mb-2">사고 위계 단계</p>
                    <p className="text-4xl font-black text-black">LV.{currentMetrics?.bloom_level || "0"}</p>
                  </div>
                  <div className="border border-black p-6 rounded-xl">
                    <p className="text-xs font-bold text-gray-600 uppercase mb-2">메타인지 역량 등급</p>
                    <p className="text-3xl font-black text-black">{currentMetrics?.grade || "N/A"}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="no-print mt-6 pt-6 border-t border-gray-800 flex justify-center">
              <button onClick={() => window.print()} className="px-12 py-4 bg-white text-black text-[16px] font-black uppercase tracking-[0.4em] rounded-full hover:bg-blue-600 hover:text-white transition-all shadow-xl">Export to PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
