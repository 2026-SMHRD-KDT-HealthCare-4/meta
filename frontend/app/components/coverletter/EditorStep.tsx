import React from 'react';
import { useCoverLetterStore } from '@/app/lib/useCoverLetterStore';
import { api } from '@/app/lib/coverletterApi';
import { ChevronLeft, ChevronRight, Info, AlertCircle } from 'lucide-react';

const EditorStep: React.FC = () => {
  const { draft, editedSections, setEditedSection, setStep, setIsLoading, setError, userId, setEvaluation } = useCoverLetterStore();
  const [activeTab, setActiveTab] = React.useState(0);

  React.useEffect(() => {
    // Initialize editedSections if empty
    if (draft && Object.keys(editedSections).length === 0) {
      draft.sections.forEach(s => {
        const fullContent = `${s.situation}\n\n${s.action_draft}\n\n${s.result_hint}`;
        setEditedSection(s.section_name, fullContent);
      });
    }
  }, [draft]);

  const handleNext = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.evaluateDraft(userId, editedSections);
      setEvaluation(response.data);
      setStep(4);
    } catch (err: any) {
      setError('평가 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!draft) return null;

  const currentSection = draft.sections[activeTab];
  const currentContent = editedSections[currentSection.section_name] || '';

  // Simple placeholder highlighting (in a real app, use a proper code/rich-text editor)
  const renderHighlightedContent = (text: string) => {
    const parts = text.split(/(\[.*?\])/);
    return parts.map((part, i) => 
      part.startsWith('[') && part.endsWith(']') ? 
      <span key={i} className="bg-yellow-200 text-yellow-800 font-bold px-1 rounded">{part}</span> : 
      part
    );
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4 mb-6 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">초안 편집 및 완성</h2>
          <p className="text-gray-500 text-sm mt-1">STAR 구조에 맞춰 생성된 초안입니다. 노란색 플레이스홀더를 채워 완성도를 높여보세요.</p>
        </div>
        <div className="flex gap-1">
          {draft.sections.map((s, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`px-4 py-2 rounded-t-lg font-bold text-sm transition-all ${
                activeTab === i ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {s.section_name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="relative">
            <textarea
              className="w-full border-2 border-blue-100 rounded-xl p-6 min-h-[400px] focus:ring-4 focus:ring-blue-50/50 focus:border-blue-400 outline-none transition-all font-sans text-lg leading-relaxed text-gray-800 shadow-inner"
              value={currentContent}
              onChange={(e) => setEditedSection(currentSection.section_name, e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-amber-50 rounded-xl p-5 border border-amber-100 shadow-sm">
            <h4 className="font-bold text-amber-900 flex items-center gap-2 mb-3">
              <Info size={18} /> 편집 팁
            </h4>
            <ul className="text-sm text-amber-800 space-y-2 list-disc list-inside">
              <li>AI가 추천한 <strong>STAR 구조</strong>를 유지하면 논리적입니다.</li>
              <li>상황(S) - 과제/행동(A) - 결과(R) 순서가 적절한지 확인하세요.</li>
              <li>구체적인 수치([수치 입력])는 신뢰도를 높여줍니다.</li>
            </ul>
          </div>

          <div className="bg-blue-50 rounded-xl p-5 border border-blue-100 shadow-sm">
            <h4 className="font-bold text-blue-900 flex items-center gap-2 mb-3">
              <AlertCircle size={18} /> 이 섹션에 필요한 데이터
            </h4>
            <div className="flex flex-wrap gap-2">
              {currentSection.placeholder_metrics.map((m, i) => (
                <span key={i} className="bg-white px-3 py-1 rounded-md text-xs font-bold text-blue-600 border border-blue-200">
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between mt-10">
        <button
          onClick={() => setStep(2)}
          className="text-gray-500 hover:text-gray-700 px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all"
        >
          <ChevronLeft size={20} /> 이전으로
        </button>
        
        <button
          onClick={handleNext}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1"
        >
          품질 검증하기 <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
};

export default EditorStep;
