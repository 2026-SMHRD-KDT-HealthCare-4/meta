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
  reason?: string; // 변동 사유
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

  const [currentExpression, setCurrentExpression] = useState<{ label: string; probability: number; gaze: number }>({
    label: "neutral",
    probability: 0,
    gaze: 0,
  });

  const handleExpressionDetected = (label: string, probability: number, gaze: number) => {
    setCurrentExpression({ label, probability, gaze });
  };

  const startSTT = () => {
    if (recognitionRef.current) {
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
        if (data.metrics && data.metrics.depth !== undefined) {
          setMetricsHistory((prev) => [...prev, data.metrics]);
        }
        setTimeout(startSTT, 100);
      } else if (data.type === "metrics_update") {
        setPendingMetrics(data.metrics);
        if (data.metrics && data.metrics.depth !== undefined) {
          setMetricsHistory((prev) => [...prev, data.metrics]);
        }
        // 가장 최근 사용자 메시지에 메트릭 연결 (로그 확인용)
        setMessages((prev) => {
            const newMessages = [...prev];
            for (let i = newMessages.length - 1; i >= 0; i--) {
                if (newMessages[i].role === "user" && !newMessages[i].metrics) {
                    newMessages[i].metrics = data.metrics;
                    break;
                }
            }
            return newMessages;
        });
      } else if (data.type === "option_chunk") {
        setQuestionOptions((prev) => {
          const newOptions = prev ? [...prev] : ["", ""];
          newOptions[data.index] = (newOptions[data.index] || "") + data.content;
          return newOptions;
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
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current!.continuous = true;
        recognitionRef.current!.interimResults = true;
        recognitionRef.current!.lang = "ko-KR";

        recognitionRef.current!.onresult = (event: SpeechRecognitionEvent) => {
          let transcript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          if (transcript) {
            setInput(prev => {
                const base = prev.trim();
                return base ? `${base} ${transcript}` : transcript;
            });
          }
        };

        recognitionRef.current!.onerror = () => { setIsListening(false); };

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, questionOptions]);

  const sendMessage = () => {
    if (!input.trim() || !socketRef.current || isTerminal) return;
    stopSTT();

    if (questionOptions && isManualInput) {
      const msg = { type: "select", content: input };
      socketRef.current.send(JSON.stringify(msg));
      setMessages((prev) => [...prev, { role: "system", content: input }]);
      setQuestionOptions(null);
      setIsManualInput(false);
    } else {
      const msg = { 
        type: "answer", 
        content: input,
        expression: currentExpression.label,
        expression_probability: currentExpression.probability,
        gaze_focus: currentExpression.gaze 
      };
      socketRef.current.send(JSON.stringify(msg));
      setMessages((prev) => [...prev, { role: "user", content: input }]);
    }
    setInput("");
  };

  const selectOption = (index: number) => {
    if (!questionOptions || !socketRef.current) return;
    const selectedContent = questionOptions[index];
    const msg = { type: "select", content: selectedContent };
    socketRef.current.send(JSON.stringify(msg));
    setMessages((prev) => [...prev, { role: "system", content: selectedContent }]);
    setQuestionOptions(null);
    setIsManualInput(false);
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

  if (!isClient) return <div className="h-screen bg-black" />;

  return (
    <div className="flex h-screen bg-black text-white font-mono overflow-hidden">
      <div className="flex flex-1 pb-48 overflow-hidden">
        
        {/* Left: Monitor */}
        <div className="w-1/2 border-r border-gray-800 p-8 flex flex-col gap-8 bg-gray-900/30 overflow-hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-blue-500 tracking-tighter uppercase">지원자 실시간 모니터링</h2>
            <div className="flex items-center gap-3">
              <span className={`text-[10px] px-3 py-1 border rounded-full font-bold ${isConnected ? "text-green-500 border-green-500 animate-pulse" : "text-red-500 border-red-500"}`}>
                {isConnected ? "LIVE_ANALYSIS" : "DISCONNECTED"}
              </span>
            </div>
          </div>

          <div className="flex-1 relative rounded-[2rem] overflow-hidden border-2 border-gray-800 shadow-[0_0_60px_rgba(59,130,246,0.15)]">
            <CameraFeed onExpressionDetected={handleExpressionDetected} />
          </div>
            
          <div className="grid grid-cols-2 gap-6 h-24">
            <div className="bg-black/60 border border-gray-800 p-4 px-6 rounded-[1.5rem] backdrop-blur-md flex flex-col justify-center">
              <div className="flex justify-between items-start mb-1">
                <p className="text-[9px] text-gray-500 uppercase font-black tracking-[0.15em]">정서 / 시선 집중도</p>
                <div className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${currentExpression.gaze > 0.7 ? "bg-green-500" : "bg-yellow-500"}`}></div>
                    <span className="text-[8px] font-bold">{(currentExpression.gaze * 100).toFixed(0)}% Focus</span>
                </div>
              </div>
              <div className="flex items-end justify-between">
                <p className={`text-2xl font-black tracking-tighter ${
                  currentExpression.label === 'angry' || currentExpression.label === 'sad' || currentExpression.label === 'fearful' 
                  ? 'text-red-500' : 'text-blue-400'
                }`}>
                  {getExpressionLabel(currentExpression.label)}
                </p>
                <p className="text-lg font-mono font-bold text-white opacity-80">
                  {(currentExpression.probability * 100).toFixed(0)}%
                </p>
              </div>
            </div>

            <button 
              onClick={() => setIsResultOpen(true)}
              disabled={messages.length === 0}
              className="h-full bg-blue-600 border border-blue-400 text-white text-[11px] font-black hover:bg-white hover:text-blue-600 transition-all shadow-[0_0_20px_rgba(37,99,235,0.2)] disabled:opacity-20 disabled:grayscale uppercase tracking-[0.2em] rounded-[1.5rem] flex flex-col items-center justify-center"
            >
              <span className="opacity-70 text-[9px] mb-0.5">INTERVIEW LOG AUDIT</span>
              <span className="text-base font-black">면접 상세 로그 및 감사</span>
            </button>
          </div>
        </div>

        {/* Right: Console */}
        <div className="w-1/2 flex flex-col relative bg-black border-l border-gray-800">
          <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-950">
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-gray-400 font-mono uppercase tracking-[0.2em]">질문 설계 및 답변 분석 시스템</span>
            </div>
            <button onClick={() => window.location.reload()} className="px-5 py-2 border border-gray-800 hover:border-blue-500 text-[11px] font-bold text-gray-500 hover:text-blue-400 transition-all bg-black/50">RESET</button>
          </div>

          <div className="flex-1 p-10 overflow-y-auto space-y-10 font-mono text-base scrollbar-hide">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-gray-800 space-y-4 opacity-30">
                <p className="text-xs uppercase tracking-[0.4em] text-center font-black">분석 주제를 입력하여<br/>세션을 시작하십시오</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] p-7 rounded-[2rem] border shadow-2xl ${
                  msg.role === "user" 
                    ? "bg-blue-600 border-blue-400 text-white rounded-tr-none" 
                    : "bg-gray-900 border-gray-800 text-gray-200 rounded-tl-none"
                }`}>
                  <p className="leading-relaxed text-base font-medium">{msg.content}</p>
                </div>
              </div>
            ))}
            
            {questionOptions && (
              <div className="flex flex-col gap-5 pt-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-gray-800"></div>
                  <p className="text-[10px] text-blue-500 font-black uppercase tracking-[0.4em]">Next Action Required</p>
                  <div className="flex-1 h-px bg-gray-800"></div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <button onClick={() => selectOption(0)} className={`p-6 border transition-all rounded-[1.5rem] text-left group ${!isManualInput ? "bg-blue-900/10 border-blue-500/30 text-blue-200 hover:bg-blue-600 hover:text-white" : "bg-black/20 border-gray-800/50 text-gray-500 opacity-60"}`}>
                    <span className="text-[9px] font-black block mb-1.5 opacity-50 tracking-widest group-hover:text-white uppercase">A. Logic Focus (논리 검증)</span>
                    <p className="text-sm leading-relaxed">{questionOptions[0]}</p>
                  </button>
                  <button onClick={() => selectOption(1)} className={`p-6 border transition-all rounded-[1.5rem] text-left group ${!isManualInput ? "bg-purple-900/10 border-purple-500/30 text-purple-200 hover:bg-purple-600 hover:text-white" : "bg-black/20 border-gray-800/50 text-gray-500 opacity-60"}`}>
                    <span className="text-[9px] font-black block mb-1.5 opacity-50 tracking-widest group-hover:text-white uppercase">B. Creative Focus (창의 확장)</span>
                    <p className="text-sm leading-relaxed">{questionOptions[1]}</p>
                  </button>
                  <button onClick={() => setIsManualInput(!isManualInput)} className={`p-6 border transition-all rounded-[1.5rem] text-left group ${isManualInput ? "bg-yellow-900/10 border-yellow-500/50 text-yellow-200" : "bg-black/40 border-gray-800/50 text-gray-500 hover:bg-gray-800"}`}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[9px] font-black block opacity-50 tracking-widest uppercase">C. Custom Probe (직접 질문 입력)</span>
                    </div>
                    <p className="text-sm">{isManualInput ? "직접 작성 모드 활성화됨" : "상황에 맞는 개별 질문을 직접 작성하십시오."}</p>
                  </button>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-6 bg-gray-950 border-t border-gray-800">
            <div className={`relative flex items-center bg-black/50 border rounded-full px-4 py-2 transition-all ${isManualInput ? "border-yellow-500/60" : "border-gray-800 focus-within:border-blue-500"}`}>
              <button onClick={toggleListening} className={`w-10 h-10 flex items-center justify-center rounded-full transition-all shrink-0 ${isListening ? "bg-red-500 text-white animate-pulse" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 00-3 3v8a3 3 0 006 0V5a3 3 0 00-3-3z" /></svg></button>
              <div className={`text-xl font-bold mx-4 ${isManualInput ? "text-yellow-500" : "text-blue-500"}`}>{isManualInput ? "?" : ">"}</div>
              <input type="text" className="w-full bg-transparent border-none text-white py-3 focus:outline-none placeholder:text-gray-800 font-mono text-base" placeholder={isListening ? "음성 수집 중..." : "답변 입력..."} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} disabled={!isConnected || isTerminal || (!!questionOptions && !isManualInput)} />
              <button className={`ml-4 px-10 py-2.5 text-[10px] font-black rounded-full transition-all ${isManualInput ? "bg-yellow-600 text-white shadow-lg" : "bg-blue-600 text-white hover:bg-white hover:text-blue-600 shadow-lg"}`} onClick={sendMessage} disabled={!isConnected || isTerminal || (!!questionOptions && !isManualInput)}>{isManualInput ? "SEND_CUSTOM" : "ANALYZE"}</button>
            </div>
          </div>
        </div>
      </div>

      {/* EXPANDED BOTTOM METRICS BAR */}
      <div className="fixed bottom-0 left-0 right-0 h-48 bg-gray-950/95 backdrop-blur-3xl border-t border-gray-800 flex items-center px-12 gap-12 z-40">
        <div className="w-[30%] h-full py-8 border-r border-gray-800 pr-12">
          <p className="text-[11px] text-gray-500 font-black uppercase mb-5 tracking-widest">인지적 안정도 추이</p>
          <div className="h-28 relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metricsHistory} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                <defs><linearGradient id="colorSurvFinal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={true} horizontal={false} />
                <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} stroke="#444" fontSize={11} width={35} />
                <Area type="monotone" dataKey="survival_probability" stroke="#3b82f6" strokeWidth={4} fill="url(#colorSurvFinal)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="w-[30%] h-full py-8 border-r border-gray-800 pr-12">
          <p className="text-[11px] text-gray-500 font-black uppercase mb-5 tracking-widest">지식 불확실성 측정</p>
          <div className="h-28 relative">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metricsHistory} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={true} horizontal={false} />
                <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} stroke="#444" fontSize={11} width={35} />
                <Line type="step" dataKey="semantic_energy" stroke="#ef4444" strokeWidth={4} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex-1 flex gap-12 justify-around items-center h-full">
          <div className="text-center">
            <p className="text-[11px] text-gray-500 font-black uppercase mb-4 tracking-widest">사고 단계</p>
            <p className="text-7xl font-black text-white italic tracking-tighter">LV.{currentMetrics?.bloom_level || "0"}</p>
          </div>
          <div className="text-center">
            <p className="text-[11px] text-gray-500 font-black uppercase mb-4 tracking-widest">종합 역량 점수</p>
            <p className="text-7xl font-black text-yellow-500 tracking-tighter shadow-yellow-500/20">{currentMetrics?.ciqs?.toFixed(2) || "0.00"}</p>
          </div>
        </div>
      </div>

      {/* NEW: AUDIT LOG MODAL */}
      {isResultOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/95 backdrop-blur-3xl p-6">
          <div className="w-full max-w-5xl max-h-[90vh] bg-gray-900 border border-blue-500/30 p-12 rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col">
            <button onClick={() => setIsResultOpen(false)} className="absolute top-10 right-10 text-gray-500 hover:text-white font-mono text-2xl p-2 transition-all">✕</button>
            
            <div className="mb-10">
              <p className="text-sm text-blue-500 font-black uppercase mb-3 tracking-[0.4em]">Internal Interview Audit Log</p>
              <h1 className="text-6xl font-black text-white tracking-tighter">실시간 면접 지표 감사 로그</h1>
              <div className="w-32 h-1.5 bg-blue-600 mt-6"></div>
            </div>

            <div className="flex-1 overflow-y-auto pr-4 space-y-6 scrollbar-hide">
              {messages.map((msg, idx) => (
                <div key={idx} className={`p-6 rounded-2xl border ${msg.role === "system" ? "bg-gray-800/20 border-gray-800" : "bg-blue-600/5 border-blue-500/20"}`}>
                  <div className="flex justify-between items-start mb-4">
                    <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase ${msg.role === "system" ? "bg-gray-800 text-gray-400" : "bg-blue-600 text-white"}`}>
                        {msg.role === "system" ? "질문 (PROBE)" : "답변 (RESPONSE)"}
                    </span>
                    {msg.metrics && (
                        <div className="flex gap-4 text-[10px] font-mono">
                            <span className="text-blue-400">안정도: {msg.metrics.survival_probability.toFixed(2)}</span>
                            <span className="text-red-400">불확실성: {msg.metrics.semantic_energy.toFixed(2)}</span>
                            <span className="text-yellow-500">CIQS: {msg.metrics.ciqs.toFixed(2)}</span>
                        </div>
                    )}
                  </div>
                  <p className="text-lg text-gray-200 leading-relaxed mb-4">{msg.content}</p>
                  
                  {msg.metrics?.reason && (
                    <div className="mt-4 p-4 bg-black/40 border-l-4 border-red-500 rounded-r-xl">
                        <p className="text-[10px] text-red-500 font-black uppercase mb-1">지표 변동 및 분석 사유 (Logic Insight)</p>
                        <p className="text-sm text-gray-400 italic">{msg.metrics.reason}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-10 pt-8 border-t border-gray-800 flex justify-between items-center">
              <p className="text-[10px] text-gray-600 font-mono tracking-tighter">The above logs contain real-time cognitive shift data and logical consistency analysis results.</p>
              <button onClick={() => window.print()} className="px-14 py-4 bg-white text-black text-xs font-black uppercase tracking-[0.3em] rounded-full hover:bg-blue-600 hover:text-white transition-all">Export Log to PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Terminal Collapse State */}
      {isTerminal && (
        <div className="fixed inset-0 z-[200] bg-red-950/70 backdrop-blur-3xl flex items-center justify-center p-6">
          <div className="bg-black border-4 border-red-600 p-20 rounded-[3rem] text-center max-w-3xl shadow-[0_0_200px_rgba(220,38,38,0.6)]">
            <h2 className="text-8xl font-black text-red-600 mb-8 italic tracking-tighter">검증 불가 판정</h2>
            <p className="text-gray-300 text-lg mb-16 uppercase tracking-[0.25em] leading-relaxed">심층 탐침 과정에서 지원자의 논리 구조가 <br/> 임계점을 이탈하여 전면적으로 붕괴되었습니다.</p>
            <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-20 py-5 font-black uppercase text-sm hover:bg-white hover:text-red-600 transition-all tracking-[0.6em] rounded-full">시스템 재부팅 (REBOOT)</button>
          </div>
        </div>
      )}
    </div>
  );
}
