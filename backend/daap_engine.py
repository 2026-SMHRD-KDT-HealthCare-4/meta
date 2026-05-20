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
        
        # --- 쿠션(Cushion) 로직: 변동 민감도 상향 조정 ---
        # 기존 0.5에서 0.2로 축소하여 성능 변화가 더 즉각적으로 반영되도록 함
        if raw_performance < self.last_round_performance:
            # 하락폭의 20%만 방어 (기존 50% 대비 훨씬 민감해짐)
            cushioned_performance = self.last_round_performance - ((self.last_round_performance - raw_performance) * 0.8)
        else:
            cushioned_performance = raw_performance
            
        self.last_round_performance = raw_performance # 실제 원시 성능은 다음 라운드를 위해 저장
        
        # 생존 확률 업데이트 계수 조정 (0.85+0.15 -> 0.70+0.30)
        # 낮은 성능일 때 더 큰 폭으로 하락하도록 민감도 증가
        self.survival_probability *= (0.70 + 0.30 * cushioned_performance) 
        self.current_depth += 1
        
        return self.survival_probability

    def get_status(self):
        """
        현재 인터뷰 상태를 진단하여 수준별 상태를 반환합니다.
        (보조 시스템용으로 변경: 강제 종료가 아닌 '상태 경고' 중심)
        """
        if self.survival_probability < 0.20:
            return "LIMIT_REACHED", "지원자의 논리적 한계점이 감지되었습니다. 주제 전환을 권장합니다."
        elif self.survival_probability < 0.50:
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
