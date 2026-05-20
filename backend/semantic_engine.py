import math
import re

class SemanticEngine:
    def __init__(self, temperature=1.0):
        self.temperature = temperature
        # 한국어 텍스트에서 불확실성(Uncertainty)을 나타내는 언어적 표지(Markers)
        self.hedging_words = [
            r"아마", r"아마도", r"혹시", r"어쩌면", r"대략", r"거의",
            r"~일 것 같다", r"~인 것 같다", r"~수도 있다", r"~지 않을까",
            r"잘 모르지만", r"어느 정도",
            r"약간", r"조금", r"대체로"
        ]
        self.filler_words = [
            r"어\.\.\.", r"음\.\.\.", r"그\.\.\.", r"저기", r"에또", r"그러니까",
            r"어", r"음", r"그", r"아", r"막",
            r"\.\.\.", r"\.\.", r"\s{2,}" # 말줄임표 및 2칸 이상의 공백(침묵의 흔적) 추가
        ]
        # 메타포 및 고차원 비유 지표 (불확실성 상쇄 요인)
        self.metaphor_markers = [
            r"마치", r"비유하자면", r"~처럼", r"~에 비유", r"일종의",
            r"관점에서 보면", r"프레임으로"
        ]

    def get_metacognitive_uncertainty(self, text: str) -> float:
        """
        텍스트의 길이 대비 불확실성 표지어와 필러 워드의 빈도를 계산하여 
        실제 지식 불확실성(Semantic Uncertainty) 점수를 산출합니다.
        메타포(비유) 사용 시에는 이를 '지적 능력'으로 간주하여 패널티를 감면합니다.
        """
        if not text.strip():
            return 0.5

        words = text.split()
        total_words = len(words)
        if total_words == 0:
            return 0.5
            
        uncertainty_score = 0.0

        # 1. 헤징(Hedging) 표현 검사
        for hw in self.hedging_words:
            matches = re.findall(hw, text)
            uncertainty_score += len(matches) * 0.15

        # 2. 필러 워드(Filler) 검사
        for fw in self.filler_words:
            matches = re.findall(rf"\b{fw}\b", text)
            uncertainty_score += len(matches) * 0.10

        # 3. 메타포(Metaphor) 검사 - 불확실성 상쇄 (Bonus)
        metaphor_count = 0
        for mm in self.metaphor_markers:
            matches = re.findall(mm, text)
            metaphor_count += len(matches)
        
        # 메타포가 발견되면 불확실성 점수를 대폭 경감 (추상화 능력으로 인정)
        uncertainty_score -= metaphor_count * 0.20
        uncertainty_score = max(0, uncertainty_score)

        # 4. 문장 길이에 따른 정규화
        base_ratio = uncertainty_score / total_words


        # 5. 짧은 답변(단답형)에 대한 패널티
        # 면접에서 너무 짧은 답변은 정보량(에너지) 부족으로 간주
        length_penalty = 0.0
        if total_words < 5:
            length_penalty = 0.2
        elif total_words < 10:
            length_penalty = 0.1

        # 6. 최종 노이즈 팩터 계산 (0.0 ~ 1.0 범위로 클리핑)
        # 자연스러운 대화에서도 약간의 필러는 사용되므로 sigmoid 계열로 스무딩
        final_uncertainty = base_ratio * 2.0 + length_penalty
        
        # Sigmoid 스무딩을 적용하여 극단적인 값을 방지
        smoothed_uncertainty = 1.0 / (1.0 + math.exp(- (final_uncertainty * 5 - 2.5)))
        
        # 너무 높은/낮은 값 클리핑
        return max(0.05, min(0.95, smoothed_uncertainty))
