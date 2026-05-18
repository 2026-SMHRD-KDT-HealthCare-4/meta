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
        당신은 논리학 전문가입니다. 지원자의 이전 답변들과 현재 답변 사이의 모순이 있는지 분석하십시오.
        
        [이전 답변들]
        {context}
        
        [현재 답변]
        {text}
        
        결과를 다음 JSON 형식으로만 응답하십시오:
        {{"consistent": true/false, "reason": "이유 설명"}}
        """
        
        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "system", "content": prompt}],
                response_format={ "type": "json_object" }
            )
            result = json.loads(response.choices[0].message.content)
            self.history.append(text)
            return result.get("consistent", True), result.get("reason", "")
        except Exception as e:
            return True, str(e)

# Example Usage:
# engine = LogicEngine()
# consistent, error = engine.check_consistency(...)
