import axios from 'axios';

const API_BASE_URL = 'http://localhost:8001';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  saveProfile: (userId: string, profile: any) => 
    apiClient.post(`/api/user/profile?user_id=${userId}`, profile),
    
  buildJd: (jobName: string) => 
    apiClient.get(`/api/jd/build?job_name=${jobName}`),
    
  generateDraft: (userId: string, jdContext: any) => 
    apiClient.post(`/api/draft/generate?user_id=${userId}`, jdContext),
    
  weaveDraft: (userId: string, companyInfo: string) => 
    apiClient.post(`/api/draft/weave?user_id=${userId}`, { company_info: companyInfo }),
    
  evaluateDraft: (userId: string, editedSections: any) => 
    apiClient.post(`/api/qa/evaluate?user_id=${userId}`, editedSections),
    
  downloadDocx: (jobName: string, editedSections: any) => 
    apiClient.post(`/api/download/docx?job_name=${jobName}`, editedSections, {
      responseType: 'blob',
    }),
};
