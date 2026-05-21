"use client";

import React from 'react';
import { useCoverLetterStore } from '@/app/lib/useCoverLetterStore';
import ProfileStep from '@/app/components/coverletter/ProfileStep';
import JDStep from '@/app/components/coverletter/JDStep';
import EditorStep from '@/app/components/coverletter/EditorStep';
import QAStep from '@/app/components/coverletter/QAStep';
import Link from 'next/link';
import { FileText, User, Search, Edit3, ShieldCheck, ChevronLeft } from 'lucide-react';

const CoverLetterPage: React.FC = () => {
  const { step, isLoading, error } = useCoverLetterStore();

  const renderStep = () => {
    switch (step) {
      case 1: return <ProfileStep />;
      case 2: return <JDStep />;
      case 3: return <EditorStep />;
      case 4: return <QAStep />;
      default: return <ProfileStep />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-black">
      {/* Header */}
      <header className="bg-white shadow-sm py-4 px-6 border-b border-gray-200">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="text-blue-600 w-8 h-8" />
            <h1 className="text-xl font-bold text-gray-900">AI 자기소개서 초안 생성기</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link 
              href="/" 
              className="text-sm font-bold text-gray-500 hover:text-blue-600 transition-colors flex items-center gap-1"
            >
              <ChevronLeft size={16} /> 면접 화면으로
            </Link>
            <div className="text-sm text-gray-500 font-medium">
              RAG-Based Assistant
            </div>
          </div>
        </div>
      </header>

      {/* Progress Stepper */}
      <div className="max-w-5xl mx-auto w-full px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          {[
            { n: 1, label: '경험 입력', icon: User },
            { n: 2, label: '직무 분석', icon: Search },
            { n: 3, label: '초안 편집', icon: Edit3 },
            { n: 4, label: '품질 검증', icon: ShieldCheck },
          ].map(({ n, label, icon: Icon }) => (
            <div key={n} className="flex flex-col items-center flex-1 relative">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 ${
                step >= n ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              } transition-colors duration-300`}>
                <Icon size={20} />
              </div>
              <span className={`mt-2 text-xs font-semibold ${
                step >= n ? 'text-blue-600' : 'text-gray-400'
              }`}>{label}</span>
              {n < 4 && (
                <div className={`absolute top-5 left-1/2 w-full h-0.5 ${
                  step > n ? 'bg-blue-600' : 'bg-gray-200'
                } transition-colors duration-300`} />
              )}
            </div>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="bg-white rounded-xl shadow-md p-8 min-h-[500px] relative text-black">
          {isLoading && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-50 rounded-xl backdrop-blur-sm">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          )}
          {renderStep()}
        </main>
      </div>

      {/* Footer */}
      <footer className="py-6 px-6 text-center text-gray-400 text-sm mt-auto">
        &copy; 2026 AI Cover Letter System. All rights reserved.
      </footer>
    </div>
  );
};

export default CoverLetterPage;
