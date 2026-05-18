import json

class Evaluator:
    def __init__(self, client):
        self.client = client

    async def get_dynamic_scores(self, user_text, probe_context):
        """
        AI를 사용하여 답변의 인지 위계와 관련성을 실시간으로 채점합니다.
        """
        prompt = f"""
        당신은 지원자의 답변을 분석하는 인지 과학 전문가입니다.
        다음 답변을 분석하여 JSON 형식으로만 응답하십시오.
        
        지원자 답변: "{user_text}"
        질문 맥락: "{probe_context}"
        
        [분석 항목]
        1. bloom_level: 1(기억)에서 6(창조)까지의 정수.
           - 단순 사실 나열: 1-2
           - 원리 적용 및 비교 분석: 3-4
           - 비판적 평가 및 대안 창조: 5-6
        2. relevance: 질문에 얼마나 부합하는 답변인가? (0.0 ~ 1.0)
        3. faithfulness: 답변 내부의 논리적 충실도 (0.0 ~ 1.0)
        
        JSON 포맷 예시: {{"bloom_level": 4, "relevance": 0.85, "faithfulness": 0.9}}
        """
        
        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "system", "content": prompt}],
                response_format={ "type": "json_object" }
            )
            scores = json.loads(response.choices[0].message.content)
            return scores
        except Exception as e:
            print(f"Scoring Error: {e}")
            return {"bloom_level": 2, "relevance": 0.5, "faithfulness": 0.5}

    def calculate_ciqs(self, bloom_level, consistency, relevance):
        """
        CIQS 종합 점수 계산
        """
        effectiveness = consistency
        bloom_score = bloom_level / 6.0
        balance = relevance # 실제 관련성을 균형 지표로 사용
        
        ciqs = 0.5 * effectiveness + 0.3 * bloom_score + 0.2 * balance
        return ciqs
