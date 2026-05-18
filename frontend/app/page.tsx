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
  const [pendingMetrics, setPendingMetrics] = useState<Metric | null>(null);
  const [isClient, setIsClient] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldListenRef = useRef(false);
  const baseInputRef = useRef(""); 

  const [currentExpression, setCurrentExpression] = useState({ label: "neutral", probability: 0, gaze: 0 });

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
    socketRef.current = new WebSocket("ws://localhost:8000/ws/interview");

    socketRef.current.onopen = () => setIsConnected(true);
    socketRef.current.onclose = () => setIsConnected(false);
    socketRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "probe") {
        setMessages((prev) => [...prev, { role: "system", content: data.content, metrics: data.metrics }]);
        if (data.metrics?.depth !== undefined) setMetricsHistory((prev) => [...prev, data.metrics]);
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
      } else if (data.type === "terminal") {
        setIsTerminal(true);
        setMessages((prev) => [...prev, { role: "system", content: data.content }]);
        stopSTT();
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
  }, [isTerminal]);

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
                <span className="text-[10px] font-mono font-bold text-white/50">{(currentExpression.probability*100).toFixed(0)}% / {(currentExpression.gaze*100).toFixed(0)}%</span>
              </div>
            </div>

            <button 
              onClick={() => setIsResultOpen(true)}
              className="h-full bg-blue-600 border border-blue-400 text-white text-[11px] font-black hover:bg-white hover:text-blue-600 transition-all uppercase tracking-[0.2em] rounded-2xl shadow-lg"
            >
              면접 상세 로그 감사 (Audit)
            </button>
          </div>
        </div>

        {/* Right Console */}
        <div className="w-1/2 flex flex-col bg-black border-l border-gray-800 relative">
          <div className="p-4 border-b border-gray-800 bg-gray-950 flex justify-between items-center">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em]">질문 설계 및 답변 분석 시스템</span>
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
                  <button onClick={() => setIsManualInput(!isManualInput)} className={`p-4 border transition-all rounded-[1.5rem] text-center group ${isManualInput ? "bg-yellow-900/10 border-yellow-500/50 text-yellow-200" : "bg-black/40 border-gray-800/50 text-gray-600"}`}>
                    <span className="text-[9px] font-black uppercase tracking-widest">{isManualInput ? "직접 입력 모드 활성화 중" : "[ 직접 질문 입력하기 ]"}</span>
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

      {/* EXPANDED BOTTOM METRICS BAR (h-56) with INDIVIDUAL BORDERS */}
      <div className="fixed bottom-0 left-0 right-0 h-56 bg-gray-950/95 backdrop-blur-3xl border-t border-gray-800 grid grid-cols-4 p-5 gap-6 z-40">
        
        {/* Metric 1: Stability */}
        <div className="border border-blue-500/20 bg-blue-500/5 rounded-3xl p-5 flex flex-col">
          <p className="text-[10px] text-blue-500 font-black uppercase mb-4 tracking-widest">인지적 안정도 추이</p>
          <div className="flex-1 relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metricsHistory} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs><linearGradient id="cSurv" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={true} horizontal={false} />
                <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} stroke="#444" fontSize={10} width={25} />
                <Area type="monotone" dataKey="survival_probability" stroke="#3b82f6" strokeWidth={3} fill="url(#cSurv)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs font-mono font-bold text-blue-400">{(currentMetrics?.survival_probability || 0).toFixed(4)} stability_idx</p>
        </div>

        {/* Metric 2: Uncertainty */}
        <div className="border border-red-500/20 bg-red-500/5 rounded-3xl p-5 flex flex-col">
          <p className="text-[10px] text-red-500 font-black uppercase mb-4 tracking-widest">지식 불확실성 측정</p>
          <div className="flex-1 relative">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metricsHistory} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={true} horizontal={false} />
                <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} stroke="#444" fontSize={10} width={25} />
                <Line type="step" dataKey="semantic_energy" stroke="#ef4444" strokeWidth={3} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs font-mono font-bold text-red-400">{(currentMetrics?.semantic_energy || 0).toFixed(4)} noise_factor</p>
        </div>

        {/* Metric 3: Bloom Level */}
        <div className="border border-white/10 bg-white/5 rounded-3xl p-5 flex flex-col items-center justify-center">
          <p className="text-[10px] text-gray-500 font-black uppercase mb-2 tracking-widest">사고 단계</p>
          <p className="text-8xl font-black text-white italic tracking-tighter">LV.{currentMetrics?.bloom_level || "0"}</p>
          <p className="text-[10px] text-gray-600 mt-2 font-bold uppercase tracking-widest">Cognitive Depth</p>
        </div>

        {/* Metric 4: CIQS */}
        <div className="border border-yellow-500/20 bg-yellow-500/5 rounded-3xl p-5 flex flex-col items-center justify-center">
          <p className="text-[10px] text-yellow-600 font-black uppercase mb-2 tracking-widest">종합 역량 점수</p>
          <p className="text-8xl font-black text-yellow-500 tracking-tighter drop-shadow-[0_0_30px_rgba(234,179,8,0.2)]">
            {currentMetrics?.ciqs?.toFixed(2) || "0.00"}
          </p>
          <p className="text-[10px] text-yellow-700 mt-2 font-bold uppercase tracking-widest">Metacognition Index</p>
        </div>
      </div>

      {/* AUDIT MODAL */}
      {isResultOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-xl p-8">
          <div className="w-full max-w-5xl max-h-[90vh] bg-gray-900 border border-blue-500/30 p-12 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col border-blue-500/20">
            <button onClick={() => setIsResultOpen(false)} className="absolute top-10 right-10 text-gray-500 hover:text-white font-mono text-2xl transition-all">✕</button>
            <div className="mb-10 text-center sm:text-left">
              <p className="text-xs text-blue-500 font-black uppercase mb-2 tracking-[0.4em]">Interview Audit History</p>
              <h1 className="text-5xl font-black text-white tracking-tighter leading-none">실시간 면접 지표 감사 로그</h1>
            </div>
            <div className="flex-1 overflow-y-auto space-y-6 pr-4 scrollbar-hide">
              {messages.map((msg, idx) => (
                <div key={idx} className={`p-8 rounded-3xl border ${msg.role === "system" ? "bg-white/5 border-white/10" : "bg-blue-600/5 border-blue-500/20"}`}>
                    <div className="flex justify-between items-center mb-6">
                        <span className={`text-[10px] font-black px-5 py-1.5 rounded-full uppercase tracking-widest ${msg.role === "system" ? "bg-gray-800 text-gray-400" : "bg-blue-600 text-white"}`}>
                            {msg.role === "system" ? "Question" : "Answer"}
                        </span>
                        {msg.metrics && (
                            <div className="flex gap-6 text-[11px] font-mono font-bold">
                                <span className="text-blue-400">STABILITY: {msg.metrics.survival_probability.toFixed(2)}</span>
                                <span className="text-red-400">NOISE: {msg.metrics.semantic_energy.toFixed(2)}</span>
                                <span className="text-yellow-500">CIQS: {msg.metrics.ciqs.toFixed(2)}</span>
                            </div>
                        )}
                    </div>
                    <p className="text-xl text-gray-100 leading-relaxed font-sans mb-6">{msg.content}</p>
                    
                    {/* 변동 사유 및 인사이트 표시 강화 */}
                    {msg.metrics?.reason && (
                        <div className="bg-black/60 border-l-4 border-blue-500 p-6 rounded-r-2xl shadow-inner">
                            <p className="text-[11px] text-blue-400 font-black uppercase mb-2 tracking-widest flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                분석 인사이트 (Analysis Insight)
                            </p>
                            <p className="text-base text-gray-300 italic font-sans leading-relaxed">
                                {msg.metrics.reason}
                            </p>
                        </div>
                    )}
                </div>
              ))}
            </div>
            <div className="mt-10 pt-8 border-t border-gray-800 flex justify-center">
              <button onClick={() => window.print()} className="px-16 py-5 bg-white text-black text-xs font-black uppercase tracking-[0.4em] rounded-full hover:bg-blue-600 hover:text-white transition-all shadow-xl">Export Diagnostic Log to PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Terminal Collapse State */}
      {isTerminal && (
        <div className="fixed inset-0 z-[200] bg-red-950/80 backdrop-blur-3xl flex items-center justify-center p-6">
          <div className="bg-black border-4 border-red-600 p-20 rounded-[4rem] text-center max-w-3xl shadow-[0_0_200px_rgba(220,38,38,0.5)]">
            <h2 className="text-8xl font-black text-red-600 mb-8 italic tracking-tighter uppercase leading-none">검증 불가 판정</h2>
            <div className="h-2 bg-red-600 mb-10 w-48 mx-auto"></div>
            <p className="text-gray-300 text-xl mb-16 uppercase tracking-[0.25em] leading-relaxed font-sans px-12">심층 탐침 과정에서 지원자의 논리 구조가 <br/> 임계점을 이탈하여 전면적으로 붕괴되었습니다.</p>
            <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-24 py-6 font-black uppercase text-sm hover:bg-white hover:text-red-600 transition-all tracking-[0.6em] rounded-full shadow-2xl">시스템 재부팅 (REBOOT)</button>
          </div>
        </div>
      )}
    </div>
  );
}

function getExpressionLabel(label: string) {
    const labels: Record<string, string> = {
      neutral: "평온/중립", happy: "긍정/자신감", surprised: "당황/놀람",
      sad: "위축/슬픔", fearful: "불안/긴장", disgusted: "거부감/불쾌", angry: "공격적/흥분",
    };
    return labels[label] || "분석 중...";
}
