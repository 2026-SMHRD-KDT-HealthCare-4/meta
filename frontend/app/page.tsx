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
}

interface Message {
  role: "system" | "user";
  content: string;
  metrics?: Metric;
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

  const [currentExpression, setCurrentExpression] = useState<{ label: string; probability: number; gaze: number }>({
    label: "neutral",
    probability: 0,
    gaze: 0,
  });

  const handleExpressionDetected = (label: string, probability: number, gaze: number) => {
    setCurrentExpression({ label, probability, gaze });
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
      } else if (data.type === "metrics_update") {
        setPendingMetrics(data.metrics);
        if (data.metrics && data.metrics.depth !== undefined) {
          setMetricsHistory((prev) => [...prev, data.metrics]);
        }
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
      }
    };

    return () => {
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, questionOptions]);

  const sendMessage = () => {
    if (!input.trim() || !socketRef.current || isTerminal) return;
    
    if (questionOptions && isManualInput) {
      const msg = { type: "select", content: input };
      socketRef.current.send(JSON.stringify(msg));
      setMessages((prev) => [...prev, { role: "system", content: input, metrics: pendingMetrics || undefined }]);
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
    setMessages((prev) => [...prev, { role: "system", content: selectedContent, metrics: pendingMetrics || undefined }]);
    setQuestionOptions(null);
    setIsManualInput(false);
  };

  const [isResultOpen, setIsResultOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"report" | "matrix">("report");

  const currentMetrics = metricsHistory[metricsHistory.length - 1];

  const talentTypes = [
    {
      type: "전문가형 (Expert)",
      criteria: "안정도 ≥ 70%, 지식 불확실성 ≤ 30%, 사고 단계 4↑",
      description: "깊은 실무 지식과 높은 자기 객관화 능력을 보유한 핵심 인재",
      color: "text-blue-400",
      bg: "bg-blue-400/10"
    },
    {
      type: "기초 성실형 (Rote Learner)",
      criteria: "안정도 ≥ 70%, 지식 불확실성 ≤ 30%, 사고 단계 3↓",
      description: "기초가 탄탄하고 정직하나 고차원적 사고 확장 필요",
      color: "text-green-400",
      bg: "bg-green-400/10"
    },
    {
      type: "위험 허풍형 (High-risk Bluffer)",
      criteria: "안정도 < 50%, 지식 불확실성 > 50%, 사고 단계 4↑",
      description: "화려한 언변에 비해 실질적 논리 구조와 확신이 부실함",
      color: "text-red-500",
      bg: "bg-red-500/10"
    },
    {
      type: "역량 미흡형 (Beginner)",
      criteria: "그 외 전체적인 지표 저하",
      description: "해당 분야에 대한 기초 지식 및 논리 구성 능력 부족",
      color: "text-gray-400",
      bg: "bg-gray-400/10"
    }
  ];

  const getVerdict = () => {
    if (!currentMetrics) return null;
    const { survival_probability: surv, semantic_energy: eng, bloom_level: bloom } = currentMetrics;

    if (surv >= 0.7 && eng <= 0.3 && bloom >= 4) {
      return {
        ...talentTypes[0],
        longDesc: "심층적 이해와 탁월한 자기 객관화 능력을 보유하고 있습니다. 압박 상황에서도 평정심을 유지하며, 자신의 지식 한계를 명확히 인지하고 가설을 세워 문제를 해결할 줄 아는 최상위 인재입니다.",
        action: "강력 추천 (Strong Hire)"
      };
    } else if (surv >= 0.7 && eng <= 0.3 && bloom < 4) {
      return {
        ...talentTypes[1],
        longDesc: "준비된 지식과 기초가 매우 탄탄하고 정직합니다. 다만 사고의 위계가 아직 이해 단계에 머물러 있어, 고차원적인 분석이나 창의적 대안 제시 능력은 추가 교육을 통해 확장될 가능성이 큽니다.",
        action: "채용 고려 (Hire)"
      };
    } else if (surv < 0.5 && eng > 0.5 && bloom >= 4) {
      return {
        ...talentTypes[2],
        longDesc: "사용하는 어휘는 넓어 보이나, 실제 지식의 확신도가 낮고 압박 질문에 논리가 쉽게 무너집니다. 아는 것과 모르는 것의 경계가 모호하여 협업 시 의사소통 오류를 일으킬 위험이 있습니다.",
        action: "재검토 필요 (Review)"
      };
    } else {
      return {
        ...talentTypes[3],
        longDesc: "전반적인 논리 구조가 불안정하며 인지 제어력이 낮습니다. 지식의 절대적인 양과 사고를 전개하는 프로세스 모두 보완이 필요하며, 현재로서는 해당 직무를 수행하기에 준비도가 부족합니다.",
        action: "채용 보류 (Hold)"
      };
    }
  };

  const verdict = getVerdict();

  const getExpressionLabel = (label: string) => {
    const labels: Record<string, string> = {
      neutral: "평온/중립",
      happy: "긍정/자신감",
      surprised: "당황/놀람",
      sad: "위축/슬픔",
      fearful: "불안/긴장",
      disgusted: "거부감/불쾌",
      angry: "공격적/흥분",
    };
    return labels[label] || "분석 중...";
  };

  if (!isClient) return <div className="h-screen bg-black" />;

  return (
    <div className="flex h-screen bg-black text-white font-mono overflow-hidden">
      {/* Main Container for Sidebar and Chat (1:1 Layout) */}
      <div className="flex flex-1 pb-48 overflow-hidden">
        
        {/* Left: Candidate Monitor (50%) - FIXED SIZE */}
        <div className="w-1/2 border-r border-gray-800 p-8 flex flex-col gap-8 bg-gray-900/30 overflow-hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-blue-500 tracking-tighter uppercase">지원자 실시간 모니터링</h2>
            <div className="flex items-center gap-3">
              <span className={`text-[10px] px-3 py-1 border rounded-full font-bold ${isConnected ? "text-green-500 border-green-500 animate-pulse" : "text-red-500 border-red-500"}`}>
                {isConnected ? "LIVE_ANALYSIS" : "DISCONNECTED"}
              </span>
            </div>
          </div>

          {/* Expanded Camera Feed */}
          <div className="flex-1 relative rounded-[2rem] overflow-hidden border-2 border-gray-800 shadow-[0_0_60px_rgba(59,130,246,0.15)]">
            <CameraFeed onExpressionDetected={handleExpressionDetected} />
          </div>
            
          {/* COMPRESSED ACTION BAR */}
          <div className="grid grid-cols-2 gap-6 h-24">
            {/* Emotion & Gaze Box */}
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

            {/* Final Report Action Button */}
            <button 
              onClick={() => setIsResultOpen(true)}
              disabled={!currentMetrics}
              className="h-full bg-blue-600 border border-blue-400 text-white text-[11px] font-black hover:bg-white hover:text-blue-600 transition-all shadow-[0_0_20px_rgba(37,99,235,0.2)] disabled:opacity-20 disabled:grayscale uppercase tracking-[0.2em] rounded-[1.5rem] flex flex-col items-center justify-center"
            >
              <span className="opacity-70 text-[9px] mb-0.5">GENERATE REPORT</span>
              <span className="text-base font-black">최종 역량 판별 보고서</span>
            </button>
          </div>
        </div>

        {/* Right: Interviewer Console (50%) - FIXED SIZE */}
        <div className="w-1/2 flex flex-col relative bg-black border-l border-gray-800">
          <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-950">
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-gray-400 font-mono uppercase tracking-[0.2em]">질문 설계 및 답변 분석 시스템</span>
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
              </div>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="px-5 py-2 border border-gray-800 hover:border-blue-500 text-[11px] font-bold text-gray-500 hover:text-blue-400 transition-all bg-black/50"
            >
              RESET
            </button>
          </div>

          {/* Chat History */}
          <div className="flex-1 p-10 overflow-y-auto space-y-10 font-mono text-base scrollbar-hide">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-gray-800 space-y-4 opacity-30">
                <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
                <p className="text-xs uppercase tracking-[0.4em] text-center font-black">분석 주제를 입력하여<br/>세션을 시작하십시오</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] p-7 rounded-[2rem] border shadow-2xl ${
                  msg.role === "user" 
                    ? "bg-blue-600 border-blue-400 text-white rounded-tr-none shadow-blue-500/10" 
                    : "bg-gray-900 border-gray-800 text-gray-200 rounded-tl-none shadow-black/50"
                }`}>
                  <p className="leading-relaxed text-base font-medium">{msg.content}</p>
                </div>
              </div>
            ))}
            
            {/* Options Area */}
            {questionOptions && (
              <div className="flex flex-col gap-5 pt-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-gray-800"></div>
                  <p className="text-[10px] text-blue-500 font-black uppercase tracking-[0.4em]">Next Action Required</p>
                  <div className="flex-1 h-px bg-gray-800"></div>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  <button 
                    onClick={() => selectOption(0)}
                    className={`p-6 border transition-all rounded-[1.5rem] text-left group ${
                      !isManualInput ? "bg-blue-900/10 border-blue-500/30 text-blue-200 hover:bg-blue-600 hover:text-white" : "bg-black/20 border-gray-800/50 text-gray-500 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <span className="text-[9px] font-black block mb-1.5 opacity-50 tracking-widest group-hover:text-white uppercase">A. Logic Focus (논리 검증)</span>
                    <p className="text-sm leading-relaxed">{questionOptions[0]}</p>
                  </button>
                  
                  <button 
                    onClick={() => selectOption(1)}
                    className={`p-6 border transition-all rounded-[1.5rem] text-left group ${
                      !isManualInput ? "bg-purple-900/10 border-purple-500/30 text-purple-200 hover:bg-purple-600 hover:text-white" : "bg-black/20 border-gray-800/50 text-gray-500 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <span className="text-[9px] font-black block mb-1.5 opacity-50 tracking-widest group-hover:text-white uppercase">B. Creative Focus (창의 확장)</span>
                    <p className="text-sm leading-relaxed">{questionOptions[1]}</p>
                  </button>

                  <button 
                    onClick={() => setIsManualInput(!isManualInput)}
                    className={`p-6 border transition-all rounded-[1.5rem] text-left group ${
                      isManualInput ? "bg-yellow-900/10 border-yellow-500/50 text-yellow-200 shadow-[0_0_20px_rgba(234,179,8,0.1)]" : "bg-black/40 border-gray-800/50 text-gray-500 hover:bg-gray-800"
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[9px] font-black block opacity-50 tracking-widest uppercase">C. Custom Probe (직접 질문 입력)</span>
                      {isManualInput && <span className="text-[8px] bg-yellow-600 text-black px-2 py-0.5 rounded-full font-black">ACTIVE</span>}
                    </div>
                    <p className="text-sm">{isManualInput ? "하단 입력창에서 질문을 직접 작성 중입니다. (토글 시 해제)" : "상황에 맞는 개별 질문을 직접 작성하고 싶을 때 활성화하십시오."}</p>
                  </button>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* COMPRESSED CHAT INPUT */}
          <div className="p-6 bg-gray-950 border-t border-gray-800">
            <div className={`relative flex items-center bg-black/50 border rounded-full px-8 py-2 transition-all ${isManualInput ? "border-yellow-500/60 shadow-[0_0_20px_rgba(234,179,8,0.1)]" : "border-gray-800 focus-within:border-blue-500"}`}>
              <div className={`text-xl font-bold mr-6 ${isManualInput ? "text-yellow-500" : "text-blue-500"}`}>
                {isManualInput ? "?" : ">"}
              </div>
              <input
                type="text"
                className="w-full bg-transparent border-none text-white py-3 focus:outline-none placeholder:text-gray-800 font-mono text-base"
                placeholder={isManualInput ? "심층 분석을 위한 커스텀 질문을 입력하십시오..." : "지원자의 응답 내용을 입력하십시오..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                disabled={!isConnected || isTerminal || (!!questionOptions && !isManualInput)}
              />
              <button
                className={`ml-4 px-10 py-2.5 text-[10px] font-black rounded-full transition-all ${
                  isManualInput ? "bg-yellow-600 text-white shadow-lg" : "bg-blue-600 text-white hover:bg-white hover:text-blue-600 shadow-lg"
                }`}
                onClick={sendMessage}
                disabled={!isConnected || isTerminal || (!!questionOptions && !isManualInput)}
              >
                {isManualInput ? "SEND_CUSTOM" : "ANALYZE"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* EXPANDED BOTTOM METRICS BAR (h-48) */}
      <div className="fixed bottom-0 left-0 right-0 h-48 bg-gray-950/95 backdrop-blur-3xl border-t border-gray-800 flex items-center px-12 gap-12 z-40">
        
        {/* Cognitive Stability Chart (EVD) */}
        <div className="w-[30%] h-full py-8 border-r border-gray-800 pr-12">
          <p className="text-[11px] text-gray-500 font-black uppercase mb-5 tracking-widest">인지적 안정도 추이 (Stability Index)</p>
          <div className="h-28 relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metricsHistory} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSurvFinal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={true} horizontal={false} />
                <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} stroke="#444" fontSize={11} width={35} />
                <Area type="monotone" dataKey="survival_probability" stroke="#3b82f6" strokeWidth={4} fill="url(#colorSurvFinal)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between items-center mt-3">
            <p className="text-[14px] font-mono font-bold text-blue-400">{(currentMetrics?.survival_probability || 0).toFixed(4)} stability_idx</p>
            <p className="text-[10px] text-gray-700 font-mono font-bold">SCALE 0-1</p>
          </div>
        </div>

        {/* Knowledge Uncertainty Chart (Semantic Energy) */}
        <div className="w-[30%] h-full py-8 border-r border-gray-800 pr-12">
          <p className="text-[11px] text-gray-500 font-black uppercase mb-5 tracking-widest">지식 불확실성 실시간 측정 (Uncertainty)</p>
          <div className="h-28 relative">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metricsHistory} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={true} horizontal={false} />
                <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} stroke="#444" fontSize={11} width={35} />
                <Line type="step" dataKey="semantic_energy" stroke="#ef4444" strokeWidth={4} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between items-center mt-3">
            <p className="text-[14px] font-mono font-bold text-red-500">{(currentMetrics?.semantic_energy || 0).toFixed(4)} noise_factor</p>
            <p className="text-[10px] text-gray-700 font-mono font-bold">SCALE 0-1</p>
          </div>
        </div>

        {/* Stats Blocks */}
        <div className="flex-1 flex gap-12 justify-around items-center h-full">
          <div className="text-center">
            <p className="text-[11px] text-gray-500 font-black uppercase mb-4 tracking-widest">사고 단계</p>
            <p className="text-7xl font-black text-white italic tracking-tighter">LV.{currentMetrics?.bloom_level || "0"}</p>
          </div>
          <div className="text-center">
            <p className="text-[11px] text-gray-500 font-black uppercase mb-4 tracking-widest">종합 역량 점수</p>
            <p className="text-7xl font-black text-yellow-500 tracking-tighter drop-shadow-[0_0_20px_rgba(234,179,8,0.2)]">
              {currentMetrics?.ciqs?.toFixed(2) || "0.00"}
            </p>
          </div>
        </div>
      </div>

      {/* Result Report Modal */}
      {isResultOpen && verdict && currentMetrics && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 sm:p-8">
          <div className="w-full max-w-5xl max-h-[90vh] bg-gray-900 border border-gray-800 p-8 sm:p-12 rounded-[2rem] shadow-2xl relative overflow-y-auto scrollbar-hide border-blue-500/20">
            {/* NEW: TOP-RIGHT CLOSE BUTTON ONLY */}
            <button 
              onClick={() => setIsResultOpen(false)}
              className="absolute top-6 right-8 text-gray-500 hover:text-white font-mono text-2xl p-2 transition-all"
              title="Close Report"
            >
              ✕
            </button>
            
            <div className="mb-12 flex justify-between items-start pr-8">
              <div>
                <p className="text-xs text-blue-500 font-black uppercase mb-2 tracking-[0.4em]">Competency Assessment Report</p>
                <h1 className="text-5xl font-black text-white tracking-tighter">AI 종합 역량 진단 결과</h1>
                <div className="w-20 h-1 bg-blue-600 mt-6"></div>
              </div>
              <div className="text-right flex flex-col items-end gap-2">
                 <p className="text-[10px] text-gray-600 font-mono tracking-widest uppercase">Certified AI Analysis</p>
                 <span className="px-3 py-1 bg-blue-600/10 border border-blue-500/30 text-blue-400 text-[10px] font-black rounded-full">MET-2026-X8912</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
              <div className="md:col-span-8 space-y-10">
                <div className="bg-white/5 p-8 rounded-[1.5rem] border border-white/10 shadow-2xl">
                  <div className="flex justify-between items-start mb-10">
                    <div className="flex-1 pr-4 overflow-hidden">
                      <p className="text-[11px] text-gray-500 uppercase font-black mb-2 tracking-widest">최종 판별 유형</p>
                      <p className={`text-4xl font-black ${verdict.color} tracking-tight leading-tight whitespace-pre`}>
                        {verdict.type.replace(' (', '\n(')}
                      </p>
                    </div>
                    <div className="flex flex-col items-center justify-center min-w-[140px] h-24 bg-white/5 rounded-2xl border border-white/10 shrink-0 px-4">
                      <p className="text-[10px] text-gray-500 font-black mb-2 uppercase tracking-widest">채용 권고</p>
                      <p className="text-xl font-black text-white uppercase italic tracking-tighter text-center leading-tight whitespace-pre-line">
                        {verdict.action.replace(' (', '\n(')}
                      </p>
                    </div>
                  </div>
                  <p className="text-lg text-gray-200 leading-relaxed font-sans font-light">
                    {verdict.longDesc}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-6">
                  <div className="bg-black/50 p-6 rounded-2xl border border-gray-800 text-center">
                    <p className="text-[10px] text-gray-500 font-black uppercase mb-3 tracking-widest">정서 안정성</p>
                    <p className="text-3xl font-black text-white">{(currentMetrics.survival_probability * 100).toFixed(1)}%</p>
                  </div>
                  <div className="bg-black/50 p-6 rounded-2xl border border-gray-800 text-center">
                    <p className="text-[10px] text-gray-500 font-black uppercase mb-3 tracking-widest">지식 확신도</p>
                    <p className="text-3xl font-black text-white">{(100 - currentMetrics.semantic_energy * 100).toFixed(1)}%</p>
                  </div>
                  <div className="bg-black/50 p-6 rounded-2xl border border-gray-800 text-center">
                    <p className="text-[10px] text-gray-500 font-black uppercase mb-3 tracking-widest">CIQS 지수</p>
                    <p className="text-3xl font-black text-yellow-500">{currentMetrics.ciqs.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <div className="md:col-span-4 space-y-6">
                <p className="text-[10px] text-gray-500 uppercase font-black mb-4 tracking-widest">Benchmarking Matrix</p>
                {talentTypes.map((t, i) => (
                  <div key={i} className={`p-5 rounded-2xl border transition-all duration-500 ${verdict.type === t.type ? "bg-blue-600/20 border-blue-500 shadow-lg scale-105" : "bg-black/40 border-gray-800/50 opacity-20 grayscale"}`}>
                    <div className="flex justify-between items-center mb-1">
                      <p className={`text-xs font-black ${t.color}`}>{t.type}</p>
                      {verdict.type === t.type && <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>}
                    </div>
                    <p className="text-[9px] text-gray-400 leading-tight font-medium">{t.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-16 pt-10 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                 <div className="w-10 h-10 border border-gray-800 rounded-xl flex items-center justify-center bg-gray-800/30">
                    <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" /></svg>
                 </div>
                 <p className="text-[10px] text-gray-600 font-mono tracking-tighter leading-relaxed">
                   Analysis Version 2.2-Final <br/>
                   Verification Protocol: Multimodal Hybrid (Vision + Logic + Semantic)
                 </p>
              </div>
              
              {/* PRIMARY ACTION: CENTERED AND LARGE PRINT BUTTON */}
              <button 
                onClick={() => window.print()} 
                className="flex-1 max-w-md py-5 bg-white text-black text-sm font-black uppercase tracking-[0.4em] rounded-full hover:bg-blue-600 hover:text-white transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] active:scale-95 flex items-center justify-center gap-3 group"
              >
                <svg className="w-5 h-5 group-hover:animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                SAVE / PRINT DIAGNOSIS PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terminal Collapse State */}
      {isTerminal && (
        <div className="fixed inset-0 z-[200] bg-red-950/70 backdrop-blur-3xl flex items-center justify-center p-6">
          <div className="bg-black border-4 border-red-600 p-20 rounded-[3rem] text-center max-w-3xl shadow-[0_0_200px_rgba(220,38,38,0.6)]">
            <div className="inline-block px-6 py-2 bg-red-600 text-white text-xs font-black mb-8 tracking-[0.4em] uppercase">Critical Security Protocol Active</div>
            <h2 className="text-8xl font-black text-red-600 mb-8 italic tracking-tighter">검증 불가 판정</h2>
            <div className="h-2 bg-red-600 mb-12 w-48 mx-auto"></div>
            <p className="text-gray-300 text-lg mb-16 uppercase tracking-[0.25em] leading-relaxed font-sans px-12">
              심층 탐침 과정에서 지원자의 논리 구조가 <br/>
              임계점을 이탈하여 전면적으로 붕괴되었습니다. <br/>
              인지적 신뢰도 결여로 인해 본 세션을 즉시 종료합니다.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-red-600 text-white px-20 py-5 font-black uppercase text-sm hover:bg-white hover:text-red-600 transition-all tracking-[0.6em] rounded-full shadow-[0_0_80px_rgba(220,38,38,0.4)] active:scale-95"
            >
              시스템 재부팅 (REBOOT)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
