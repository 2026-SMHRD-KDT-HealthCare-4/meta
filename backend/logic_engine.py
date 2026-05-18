from z3 import *
import openai
import os
import json

class LogicEngine:
    def __init__(self, client):
        self.client = client
        self.history = []

    async def check_consistency(self, text):
        """
        AI를 사용하여 현재 답변과 이전 대화 사이의 논리적 일관성을 검사합니다.
        """
        if not self.history:
            self.history.append(text)
            return True, "INITIAL_STATEMENT"

        context = "\n".join(self.history)
        prompt = f"""
        당신은 논리학 및 지식 검증 전문가입니다. 지원자의 답변을 다음 두 가지 관점에서 분석하십시오.
        
        1. 내부 일관성(Internal Consistency): 이전 답변들과 현재 답변 사이에 논리적 모순이 있는가?
        2. 사실 정합성(Factual Grounding): 지원자가 주장하는 지식이나 사실이 객관적으로 타당한가? (틀린 지식을 자신 있게 말하는지 확인)
        
        [이전 답변들]
        {context}
        
        [현재 답변]
        {text}
        
        결과를 다음 JSON 형식으로만 응답하십시오:
        {{
            "consistent": true/false, 
            "reason": "모순점 또는 사실적 오류에 대한 구체적 설명",
            "fact_check_score": 0.0~1.0 (지식의 정확성 점수)
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
            
            # 일관성이 있더라도 사실 점수가 너무 낮으면(0.3 미만) 부적격 처리
            is_valid = result.get("consistent", True) and result.get("fact_check_score", 1.0) >= 0.3
            return is_valid, result.get("reason", "")
        except Exception as e:
            return True, str(e)

# Example Usage:
# engine = LogicEngine()
# consistent, error = engine.check_consistency(...)
