import React from 'react';
import { useCoverLetterStore } from '@/app/lib/useCoverLetterStore';
import { api } from '@/app/lib/coverletterApi';
import { ChevronLeft, Download, RefreshCw, CheckCircle2, XCircle, Building2 } from 'lucide-react';

const QAStep: React.FC = () => {
  const { evaluation, setEvaluation, editedSections, jdContext, setStep, setIsLoading, setError, userId, setDraft } = useCoverLetterStore();
  const [companyInfo, setCompanyInfo] = React.useState('');

  const handleWeave = async () => {
    if (!companyInfo.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.weaveDraft(userId, companyInfo);
      setDraft(response.data);
      // After weaving, we need to re-evaluate
      const evalResponse = await api.evaluateDraft(userId, editedSections);
      setEvaluation(evalResponse.data);
      // Go back to editor to see the weaved result
      setStep(3);
    } catch (err: any) {
      setError('기업 정보 반영 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!jdContext) {
      setError('직무 정보가 없습니다.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      console.log('Downloading DOCX for:', jdContext.job_name);
      const response = await api.downloadDocx(jdContext.job_name, editedSections);
      console.log('Download response:', response);
      
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `자기소개서_${jdContext.job_name}.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Download error details:', err);
      setError(`문서 다운로드 중 오류가 발생했습니다: ${err.message || '알 수 없는 오류'}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!evaluation) return null;

  const MetricCard = ({ label, value, threshold = 0.5 }: { label: string, value: number, threshold?: number }) => {
    const isPassed = value >= threshold;
    return (
      <div className={`p-4 rounded-xl border ${isPassed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-bold text-gray-700">{label}</span>
          {isPassed ? <CheckCircle2 size={18} className="text-green-600" /> : <XCircle size={18} className="text-red-600" />}
        </div>
        <div className="text-2xl font-black text-gray-900">{(value * 100).toFixed(0)}%</div>
        <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
          <div className={`h-full ${isPassed ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${value * 100}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-800">최종 품질 검증 및 맞춤화</h2>
        <p className="text-gray-500 text-sm mt-1">AI가 분석한 품질 지표입니다. 모든 항목이 통과되어야 다운로드가 가능합니다.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="직무 정렬도" value={evaluation.job_alignment} />
        <MetricCard label="콘텐츠 보존율" value={evaluation.content_preservation} />
        <MetricCard label="수치 완성도" value={evaluation.placeholder_completion} threshold={1.0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
              <Building2 size={20} className="text-blue-600" /> 특정 기업 맞춤화 (위빙)
            </h3>
            <p className="text-xs text-gray-500 mb-3">지원하려는 기업의 홈페이지 인재상이나 최근 뉴스를 복사해서 붙여넣어보세요.</p>
            <textarea
              className="w-full border border-gray-300 rounded-lg p-4 min-h-[150px] focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="예: 우리 기업은 '도전'과 '혁신'을 중시합니다. 최근에는 친환경 에너지 사업에 집중하고 있으며..."
              value={companyInfo}
              onChange={(e) => setCompanyInfo(e.target.value)}
            />
            <button
              onClick={handleWeave}
              className="mt-4 w-full bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-50 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
            >
              <RefreshCw size={18} /> 기업 정보 반영하기
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className={`rounded-xl p-6 border ${evaluation.gate_passed ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
            <h3 className="font-bold text-gray-900 mb-4">전문가 피드백</h3>
            {evaluation.feedback.length > 0 ? (
              <ul className="space-y-3">
                {evaluation.feedback.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
                    <span className="text-amber-600 font-bold">•</span> {f}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-blue-700 font-medium">완벽합니다! 이제 최종 결과물을 확인하고 제출해보세요.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between mt-10 pt-6 border-t">
        <button
          onClick={() => setStep(3)}
          className="text-gray-500 hover:text-gray-700 px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all"
        >
          <ChevronLeft size={20} /> 수정하러 가기
        </button>
        
        <button
          onClick={handleDownload}
          className={`px-10 py-4 rounded-xl font-black text-lg flex items-center gap-3 transition-all shadow-xl bg-blue-600 hover:bg-blue-700 text-white transform hover:-translate-y-1`}
        >
          <Download size={24} /> 최종 DOCX 다운로드
        </button>
      </div>
    </div>
  );
};

export default QAStep;
