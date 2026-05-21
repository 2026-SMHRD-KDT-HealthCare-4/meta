import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from app.models.schemas import QAEvaluation, DraftResponse, JDKeyword
from typing import List, Dict
import re

class QAEvaluator:
    def __init__(self, vectorizer):
        self.vectorizer = vectorizer

    def calculate_job_alignment(self, edited_text: str, jd_keywords: List[JDKeyword]) -> float:
        if not jd_keywords:
            return 1.0
        
        # In a real-world scenario, simple string matching (contains) can be very brittle.
        # We can use embedding-based similarity to check if the 'concepts' of the keywords 
        # are present in the text, or a more robust tokenization.
        
        # Strategy: Check for direct matches first, then use semantic similarity for the top keywords
        matches = 0
        keyword_texts = [kw.keyword.lower() for kw in jd_keywords]
        
        # Tokenize edited text (simple version)
        edited_tokens = re.findall(r'[ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9]{2,}', edited_text.lower())
        
        for kw_text in keyword_texts:
            # Direct or partial match
            if any(kw_text in token or token in kw_text for token in edited_tokens):
                matches += 1
                
        # If matches are very low, we use embedding similarity as a fallback
        direct_score = matches / len(jd_keywords)
        
        if direct_score < 0.3:
            try:
                # Compare the embedding of the whole text with the embedding of the concatenated keywords
                combined_keywords = " ".join(keyword_texts[:7])
                emb_text = self.vectorizer.openai_ef([edited_text])[0]
                emb_keywords = self.vectorizer.openai_ef([combined_keywords])[0]
                semantic_score = float(cosine_similarity([emb_text], [emb_keywords])[0][0])
                # Combine scores (weighted towards semantic if direct is low)
                return max(direct_score, semantic_score * 0.8)
            except:
                return direct_score
        
        return direct_score

    def calculate_content_preservation(self, original_draft: str, edited_text: str) -> float:
        # Use embeddings to compare semantic similarity
        # This requires the vectorizer's embedding function
        try:
            emb1 = self.vectorizer.openai_ef([original_draft])[0]
            emb2 = self.vectorizer.openai_ef([edited_text])[0]
            
            similarity = cosine_similarity([emb1], [emb2])[0][0]
            return float(similarity)
        except Exception:
            return 0.5

    def calculate_placeholder_completion(self, edited_text: str, placeholders: List[str]) -> float:
        if not placeholders:
            return 1.0
            
        # Check if placeholders like "[수치 입력]" are still present
        remaining = len(re.findall(r'\[.*?\]', edited_text))
        if remaining == 0:
            return 1.0
        
        # This is a simple heuristic. In a real app, we'd track specific placeholders.
        total_placeholders = len(placeholders)
        completed = max(0, total_placeholders - remaining)
        return completed / total_placeholders

    def evaluate(self, 
                 original_draft_response: DraftResponse, 
                 edited_sections: Dict[str, str], 
                 jd_keywords: List[JDKeyword]) -> QAEvaluation:
        
        all_original = " ".join([f"{s.situation} {s.action_draft} {s.result_hint}" for s in original_draft_response.sections])
        all_edited = " ".join(edited_sections.values())
        all_placeholders = []
        for s in original_draft_response.sections:
            all_placeholders.extend(s.placeholder_metrics)
            
        job_alignment = self.calculate_job_alignment(all_edited, jd_keywords)
        content_preservation = self.calculate_content_preservation(all_original, all_edited)
        placeholder_completion = self.calculate_placeholder_completion(all_edited, all_placeholders)
        
        # Gates
        gate_passed = (job_alignment >= 0.5 and 
                       content_preservation >= 0.5 and 
                       placeholder_completion >= 1.0)
        
        feedback = []
        if job_alignment < 0.5:
            feedback.append("직무 관련 키워드가 부족합니다. 핵심 역량을 더 보강해보세요.")
        if content_preservation < 0.5:
            feedback.append("원본 경험의 핵심 내용이 많이 변경되었습니다. 사실 관계를 확인해주세요.")
        if placeholder_completion < 1.0:
            feedback.append("아직 채워지지 않은 플레이스홀더([수치 입력] 등)가 있습니다.")
            
        return QAEvaluation(
            job_alignment=job_alignment,
            content_preservation=content_preservation,
            placeholder_completion=placeholder_completion,
            gate_passed=gate_passed,
            feedback=feedback
        )
