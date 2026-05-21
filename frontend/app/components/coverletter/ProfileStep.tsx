import React from 'react';
import { useCoverLetterStore } from '@/app/lib/useCoverLetterStore';
import { api } from '@/app/lib/coverletterApi';
import { ChevronRight, Plus, X } from 'lucide-react';

const ProfileStep: React.FC = () => {
  const { profile, setProfile, setStep, setIsLoading, setError, userId } = useCoverLetterStore();
  const [techInput, setTechInput] = React.useState('');
  const [certInput, setCertInput] = React.useState('');

  const handleNext = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await api.saveProfile(userId, profile);
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.detail || '데이터 저장 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const addTech = () => {
    if (techInput.trim() && !profile.tech_stack.includes(techInput.trim())) {
      setProfile({ tech_stack: [...profile.tech_stack, techInput.trim()] });
      setTechInput('');
    }
  };

  const addCert = () => {
    if (certInput.trim() && !profile.certifications.includes(certInput.trim())) {
      setProfile({ certifications: [...profile.certifications, certInput.trim()] });
      setCertInput('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-800">사용자 경험 및 역량 입력</h2>
        <p className="text-gray-500 text-sm mt-1">자기소개서의 팩트 베이스가 되는 소중한 경험들을 들려주세요.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">지원 희망 직무</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="예: 프론트엔드 개발자"
              value={profile.target_job}
              onChange={(e) => setProfile({ target_job: e.target.value })}
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">나이</label>
            <input
              type="number"
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              value={profile.age}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setProfile({ age: parseInt(e.target.value) || 0 })}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">기술 스택</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={techInput}
                onChange={(e) => setTechInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addTech()}
                placeholder="React, TypeScript..."
              />
              <button onClick={addTech} className="bg-gray-100 hover:bg-gray-200 p-2 rounded-lg transition-colors">
                <Plus size={20} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.tech_stack.map((t) => (
                <span key={t} className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                  {t} <X size={12} className="cursor-pointer" onClick={() => setProfile({ tech_stack: profile.tech_stack.filter(x => x !== t) })} />
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">주요 경험 (Fact Base)</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[120px]"
              placeholder="주요 프로젝트, 인턴십, 동아리 활동 등 상세히 적어주세요."
              value={profile.experience}
              onChange={(e) => setProfile({ experience: e.target.value })}
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">강점 / 강점 키워드</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="예: 사용자 중심 설계, 빠른 습득력"
              value={profile.strength}
              onChange={(e) => setProfile({ strength: e.target.value })}
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">지원 동기 (핵심 키워드)</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="예: 사람들의 일상에 닿는 서비스 개발"
              value={profile.motivation}
              onChange={(e) => setProfile({ motivation: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-10">
        <button
          onClick={handleNext}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1"
        >
          다음 단계로 <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
};

export default ProfileStep;
