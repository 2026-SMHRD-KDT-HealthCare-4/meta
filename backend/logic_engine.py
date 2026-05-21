import openai
import os
import json

class LogicEngine:
    def __init__(self, client):
        self.client = client
        self.history = []

    async def check_consistency(self, text, session_id=None, rag_engine=None):
        """
        AI를 사용하여 현재 답변과 이전 대화, 그리고 이력서(RAG) 사이의 논리적 일관성을 검사합니다.
        """
        rag_context = ""
        if session_id and rag_engine:
            rag_context = await rag_engine.query(session_id, text)

        if not self.history:
            self.history.append(text)
            # 첫 답변이라도 이력서와 대조 가능
            if not rag_context:
                return True, "INITIAL_STATEMENT"

        history_context = "\n".join(self.history)
        
        prompt = f"""
        당신은 논리학 및 지식 검증 전문가입니다. 지원자의 답변을 다음 관점에서 분석하십시오.
        
        1. 내부 일관성(Internal Consistency): 이전 답변들과 현재 답변 사이에 논리적 모순이 있는가?
        2. 이력서 정합성(Resume Grounding): 지원자의 답변이 제출한 이력서/포트폴리오의 '객관적 사실'과 상충되는가?
        
        [이력서 관련 정보]
        {rag_context if rag_context else "정보 없음"}
        
        [이전 답변들]
        {history_context}
        
        [현재 답변]
        {text}
        
        [중요: 모순 판단 기준]
        - 단순히 특정 기술의 심화 내용을 대답하지 못하거나 얕은 지식을 보이는 것은 '모순'이 아닙니다.
        - 이력서에 명시된 '객관적 사실'(예: 근무 기간, 특정 프로젝트 참여 여부, 소속 조직 등)을 부정하거나 완전히 상충되는 진술을 할 때만 'consistent: false'로 판단하십시오.
        - 지식의 오류는 'fact_check_score'에 반영하되, 'consistent'는 사실 관계의 진위 여부에 집중하십시오.
        
        결과를 다음 JSON 형식으로만 응답하십시오:
        {{
            "consistent": true/false, 
            "reason": "모순점 또는 사실적 오류에 대한 구체적 설명",
            "fact_check_score": 0.0~1.0 (지식의 정확성 및 사실 정합성 점수)
        }}
        """
        
        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "system", "content": prompt}],
                response_format={ "type": "json_object" }
            )
            result = json.loads(response.choices[0].message.content)
            self.history.append(text)
            
            # 일관성이 있더라도 사실 점수가 극도로 낮으면(0.2 미만) 부적격 처리 검토
            is_valid = result.get("consistent", True) and result.get("fact_check_score", 1.0) >= 0.2
            return is_valid, result.get("reason", "")
        except Exception as e:
            print(f"LogicEngine error: {e}")
            return True, str(e)

# Example Usage:
# engine = LogicEngine()
# consistent, error = engine.check_consistency(...)
