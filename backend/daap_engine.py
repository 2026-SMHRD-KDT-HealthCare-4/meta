import random

class DAAPEngine:
    def __init__(self):
        self.current_depth = 0
        self.max_depth = 15
        self.survival_threshold = 0.20
        self.survival_probability = 1.0
        self.history = []
        self.last_round_performance = 1.0 # 이전 라운드 성능 추적용

    def update_survival(self, consistency_score, semantic_uncertainty, expression_score=1.0):
        """
        Updates the survival probability based on current round performance.
        consistency_score: 0 to 1 (from LogicEngine)
        semantic_uncertainty: 0 to 1 (from SemanticEngine)
        expression_score: 0 to 1 (from CV data, default 1.0)
        """
        # 현재 라운드 원시 성능 계산
        raw_performance = consistency_score * (1.0 - semantic_uncertainty) * expression_score
        
        # --- 쿠션(Cushion) 로직: 급격한 지표 변동 완화 ---
        # 이전 라운드 성능과 현재 성능의 차이가 너무 클 경우 (급격한 하락 시)
        # 차이의 50%만 반영하여 '쿠션'을 줌 (단, 한 번만 방어하고 다음에도 낮으면 하락폭 커짐)
        if raw_performance < self.last_round_performance:
            # 완화된 성능 = 이전 성능 - (성능 하락폭 * 0.5)
            cushioned_performance = self.last_round_performance - ((self.last_round_performance - raw_performance) * 0.5)
        else:
            cushioned_performance = raw_performance
            
        self.last_round_performance = raw_performance # 실제 원시 성능은 다음 라운드를 위해 저장
        
        # 생존 확률 업데이트 (0.8 ~ 1.0 사이의 감쇄 계수 활용)
        # raw_performance 대신 cushioned_performance를 사용하여 급변 방지
        self.survival_probability *= (0.85 + 0.15 * cushioned_performance) 
        self.current_depth += 1
        
        return self.survival_probability

    def is_collapsed(self):
        return self.survival_probability < self.survival_threshold or self.current_depth >= self.max_depth

    def get_next_probe_instruction(self, user_text):
        """
        Generates instructions for the LLM to create the next Socratic probe strictly in Korean.
        """
        depth_label = "기초(Common)" if self.current_depth < 3 else "심화(Textbook)" if self.current_depth < 7 else "전문(Cutting-edge)"
        
        return f"""
        당신은 면접관의 질문을 보조하는 고도의 메타인지 분석 에이전트입니다.
        현재 탐침 깊이: {self.current_depth} ({depth_label} 단계)
        지원자의 마지막 발언: {user_text}
        
        [지시사항 - 절대 준수]
        1. 지원자의 답변에서 논리적 허점, 검증되지 않은 가정, 또는 개념적 모호함을 찾아내십시오.
        2. 만약 지원자의 답변이 너무 짧거나 분석할 내용이 부족하다면, 현재 주제와 관련된 근본적인 정의나 원리를 묻는 질문을 던지십시오.
        3. 반드시 '질문'만 생성하십시오. "정보가 부족하다", "분석 결과" 등의 메타 발언이나 설명은 절대 하지 마십시오.
        4. 지원자가 자신의 인지 과정을 되돌아보게 만드는 날카로운 소크라테스식 질문이어야 합니다.
        
        [언어 및 형식]
        - 반드시 **한국어**로만 답변하십시오. 
        - "~습니까?", "~인가요?"와 같은 격식 있는 의문문 형식을 유지하십시오.
        - 출력 결과에 질문 외에 어떤 텍스트도 포함하지 마십시오.
        """

    def get_stats(self):
        return {
            "depth": self.current_depth,
            "survival_probability": self.survival_probability,
            "is_collapsed": self.is_collapsed()
        }
