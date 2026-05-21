import { create } from 'zustand';

interface UserProfile {
  target_job: string;
  age: number;
  tech_stack: string[];
  certifications: string[];
  experience: string;
  strength: string;
  motivation: string;
}

interface JDKeyword {
  keyword: string;
  frequency: number;
}

interface JDContext {
  job_name: string;
  context: string;
  keywords: JDKeyword[];
}

interface DraftSection {
  section_name: string;
  situation: string;
  action_draft: string;
  result_hint: string;
  placeholder_metrics: string[];
}

interface DraftResponse {
  sections: DraftSection[];
}

interface QAEvaluation {
  job_alignment: number;
  content_preservation: number;
  placeholder_completion: number;
  gate_passed: boolean;
  feedback: string[];
}

interface AppState {
  userId: string;
  step: number;
  profile: UserProfile;
  jdContext: JDContext | null;
  draft: DraftResponse | null;
  editedSections: Record<string, string>;
  evaluation: QAEvaluation | null;
  isLoading: boolean;
  error: string | null;

  setUserId: (id: string) => void;
  setStep: (step: number) => void;
  setProfile: (profile: Partial<UserProfile>) => void;
  setJdContext: (context: JDContext | null) => void;
  setDraft: (draft: DraftResponse | null) => void;
  setEditedSection: (section: string, content: string) => void;
  setEvaluation: (evaluation: QAEvaluation | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useCoverLetterStore = create<AppState>((set) => ({
  userId: typeof window !== 'undefined' ? `user_${Math.random().toString(36).substr(2, 9)}` : '',
  step: 1,
  profile: {
    target_job: '',
    age: 0,
    tech_stack: [],
    certifications: [],
    experience: '',
    strength: '',
    motivation: '',
  },
  jdContext: null,
  draft: null,
  editedSections: {},
  evaluation: null,
  isLoading: false,
  error: null,

  setUserId: (id) => set({ userId: id }),
  setStep: (step) => set({ step }),
  setProfile: (profile) => set((state) => ({ profile: { ...state.profile, ...profile } })),
  setJdContext: (context) => set({ jdContext: context }),
  setDraft: (draft) => set({ draft, editedSections: {} }), 
  setEditedSection: (section, content) => set((state) => ({
    editedSections: { ...state.editedSections, [section]: content }
  })),
  setEvaluation: (evaluation) => set({ evaluation }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
