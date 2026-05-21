import React from 'react';
import { useCoverLetterStore } from '@/app/lib/useCoverLetterStore';
import { api } from '@/app/lib/coverletterApi';
import { ChevronLeft, ChevronRight, Search, Target } from 'lucide-react';

const JDStep: React.FC = () => {
  const { profile, jdContext, setJdContext, setStep, setIsLoading, setError, userId, setDraft } = useCoverLetterStore();
  const [localJob, setLocalJob] = React.useState(profile.target_job);

  const handleFetchJD = async () => {
    if (!localJob.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.buildJd(localJob);
      setJdContext(response.data);
    } catch (err: any) {
      setError('직무 데이터를 가져오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!jdContext) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.generateDraft(userId, jdContext);
      setDraft(response.data);
      setStep(3);
    } catch (err: any) {
      setError('초안 생성 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-800">직무 역량 컨텍스트 구축</h2>
        <p className="text-gray-500 text-sm mt-1">워크넷 API를 통해 현재 시장의 직무 요구사항을 분석합니다.</p>
      </div>

      <div className="flex gap-2 max-w-md mx-auto mb-8">
        <input
          type="text"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="직종 키워드 (예: 백엔드 개발자)"
          value={localJob}
          onChange={(e) => setLocalJob(e.target.value)}
        />
        <button
          onClick={handleFetchJD}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2"
        >
          <Search size={18} /> 분석
        </button>
      </div>

      {jdContext && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-blue-50 rounded-xl p-6 border border-blue-100">
            <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
              <Target size={20} /> 이 직종에서 많이 요구하는 역량이에요
            </h3>
            
            <div className="flex flex-wrap gap-3 mb-6">
              {jdContext.keywords.map((kw, i) => (
                <div key={i} className="bg-white px-4 py-2 rounded-lg shadow-sm border border-blue-200 flex items-center gap-2">
                  <span className="font-bold text-blue-600">{kw.keyword}</span>
                  <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400" style={{ width: `${kw.frequency * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto border border-blue-100">
              {jdContext.context}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between mt-10">
        <button
          onClick={() => setStep(1)}
          className="text-gray-500 hover:text-gray-700 px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all"
        >
          <ChevronLeft size={20} /> 이전으로
        </button>
        
        {jdContext && (
          <button
            onClick={handleGenerateDraft}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1"
          >
            초안 생성하기 <ChevronRight size={20} />
          </button>
        )}
      </div>
    </div>
  );
};

export default JDStep;
