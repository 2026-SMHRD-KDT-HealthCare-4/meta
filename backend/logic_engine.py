import openai
import os
import json

class LogicEngine:
    def __init__(self, client):
        self.client = client
        self.history = []

    async def check_consistency(self, text, session_id=None, rag_engine=None):
        """
        AI를 사용하여 현재 답변의 다차원적 메타인지 분석(논리, 위계, 확신도, 관련성)을 수행합니다.
        """
        rag_context = ""
        if session_id and rag_engine:
            rag_context = await rag_engine.query(session_id, text)

        history_context = "\n".join(self.history) if self.history else "최초 답변"
        
        prompt = f"""
        당신은 고도의 인지 과학 전문가이자 시니어 면접 분석관입니다. 지원자의 답변을 다음 4가지 메타인지 축으로 분석하십시오.
        
        1. 논리적 정합성(Logic): 이전 답변 및 이력서와의 모순 여부.
        2. 사고의 위계(Cognitive Depth): Bloom의 교육 목표 분류에 기반한 사고 수준 (기억/이해 vs 분석/평가/창조).
        3. 의미론적 확신도(Calibration): 지식의 한계를 인지하고 있는지, 아니면 모르는 것을 아는 척(Hallucination) 하는지.
        4. 전략적 관련성(Relevance): 질문의 핵심 의도를 파악하고 적절한 수준의 정보를 제공하는지.
        
        [이력서 정보]
        {rag_context if rag_context else "정보 없음"}
        
        [대화 맥락]
        {history_context}
        
        [현재 답변]
        {text}
        
        결과를 다음 JSON 형식으로만 응답하십시오:
        {{
            "consistent": true/false, 
            "fact_check_score": 0.0~1.0,
            "metacognitive_insight": "지원자의 인지 과정을 예리하게 분석한 1~2문장의 인사이트 (예: '논리적 일관성은 우수하나, 기술의 원리보다는 현상 위주의 답변에 머물러 있어 LV.3 이상의 깊이 있는 탐침이 권장됩니다.')",
            "reason": "시스템 기록용 기술적 판단 근거"
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
            
            # 메타인지 인사이트를 reason 필드로 통합하여 반환 (UI 호환성)
            insight = result.get("metacognitive_insight", "")
            is_valid = result.get("consistent", True) and result.get("fact_check_score", 1.0) >= 0.2
            
            return is_valid, insight
        except Exception as e:
            print(f"LogicEngine error: {e}")
            return True, "분석 엔진 일시적 오류"

# Example Usage:
# engine = LogicEngine()
# consistent, error = engine.check_consistency(...)
