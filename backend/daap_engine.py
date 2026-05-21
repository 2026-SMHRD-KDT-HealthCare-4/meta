import random

class DAAPEngine:
    def __init__(self):
        self.current_depth = 0
        self.max_depth = 15
        self.survival_threshold = 0.25 # 임계치를 0.20에서 0.25로 상향 (더 빨리 위험 신호)
        self.survival_probability = 1.0
        self.history = []
        self.last_round_performance = 1.0 

    def update_survival(self, consistency_score, semantic_uncertainty, expression_score=1.0):
        """
        성능 하락 시 더 공격적으로 생존 확률을 깎도록 로직을 강화합니다.
        """
        # 현재 라운드 성능 계산
        raw_performance = consistency_score * (1.0 - semantic_uncertainty) * expression_score
        
        # --- 예민한 쿠션 로직 ---
        # 하락 시 방어막(Cushion)을 거의 제거 (0.8 -> 0.9로 상향하여 하락폭을 더 많이 반영)
        if raw_performance < self.last_round_performance:
            cushioned_performance = self.last_round_performance - ((self.last_round_performance - raw_performance) * 0.9)
        else:
            cushioned_performance = raw_performance
            
        self.last_round_performance = raw_performance 
        
        # 가중치 조정 (0.70+0.30 -> 0.60+0.40): 현재 라운드 실수가 생존 확률에 주는 타격을 33% 증가
        self.survival_probability *= (0.60 + 0.40 * cushioned_performance) 
        
        # 강제 하락폭 추가: 일관성이 깨지거나 불확실성이 극도로 높을 때 추가 페널티 (예민함의 핵심)
        if consistency_score < 0.5 or semantic_uncertainty > 0.7:
            self.survival_probability *= 0.85 # 추가 15% 삭감
            
        self.current_depth += 1
        return self.survival_probability

    def get_status(self):
        """
        사용자 요청에 따라 상태 전이 임계치는 다시 완화하여 긴장감은 유지하되 안정성을 확보합니다.
        """
        if self.survival_probability < 0.20: # 0.25 -> 0.20 (원복)
            return "LIMIT_REACHED", "지원자의 논리적 한계점이 감지되었습니다. 주제 전환을 권장합니다."
        elif self.survival_probability < 0.50: # 0.60 -> 0.50 (원복)
            return "CAUTION", "논리적 일관성이 흔들리고 있습니다. 추가 검증이 필요합니다."
        elif self.current_depth >= self.max_depth:
            return "MAX_DEPTH", "충분한 탐침이 수행되었습니다. 인터뷰를 정리하거나 다른 주제로 넘어가십시오."
        else:
            return "STABLE", "정상적인 논리 흐름을 유지하고 있습니다."

    def is_collapsed(self):
        # UI/로직 호환성을 위해 유지하되, 강제 종료 조건은 대폭 완화하거나 제거 가능
        return self.survival_probability < 0.10 # 임계치를 더 낮춤 (거의 완전 붕괴 시에만 알림)

    def get_stats(self):
        status_code, status_msg = self.get_status()
        return {
            "depth": self.current_depth,
            "survival_probability": self.survival_probability,
            "status_code": status_code,
            "status_msg": status_msg
        }

    def get_next_probe_instruction(self, user_text, rag_context=""):
        """
        Generates instructions for the LLM to create the next Socratic probe strictly in Korean.
        If rag_context is provided, it incorporates candidate's background into the prompt.
        """
        depth_label = "기초(Common)" if self.current_depth < 3 else "심화(Textbook)" if self.current_depth < 7 else "전문(Cutting-edge)"
        
        rag_instruction = ""
        if rag_context:
            rag_instruction = f"""
            [지원자 배경 정보 (이력서/포트폴리오 추출)]
            {rag_context}
            
            위 정보를 바탕으로 지원자의 답변이 본인의 경험이나 기술 스택과 어떻게 연계되는지, 혹은 모순되거나 보완이 필요한 지점이 있는지 날카롭게 파고드십시오.
            """

        return f"""
        당신은 면접관의 질문을 보조하는 고도의 메타인지 분석 에이전트입니다.
        현재 탐침 깊이: {self.current_depth} ({depth_label} 단계)
        지원자의 마지막 발언: {user_text}
        
        {rag_instruction}
        
        [지시사항 - 절대 준수]
        1. 지원자의 답변에서 논리적 허점, 검증되지 않은 가정, 또는 개념적 모호함을 찾아내십시오.
        2. 이력서 정보가 있다면, 답변과 이력서 내용 사이의 간극을 메타인지적으로 질문하십시오.
        3. 만약 지원자의 답변이 너무 짧거나 분석할 내용이 부족하다면, 현재 주제와 관련된 근본적인 정의나 원리를 묻는 질문을 던지십시오.
        4. 반드시 '질문'만 생성하십시오. "정보가 부족하다", "분석 결과" 등의 메타 발언이나 설명은 절대 하지 마십시오.
        5. 지원자가 자신의 인지 과정을 되돌아보게 만드는 날카로운 소크라테스식 질문이어야 합니다.
        
        [언어 및 형식]
        - 반드시 **한국어**로만 답변하십시오. 
        - "~습니까?", "~인가요?"와 같은 격식 있는 의문문 형식을 유지하십시오.
        - 출력 결과에 질문 외에 어떤 텍스트도 포함하지 마십시오.
        """
