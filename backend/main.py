import os
import json
import random
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from openai import AsyncOpenAI

from daap_engine import DAAPEngine
from logic_engine import LogicEngine
from semantic_engine import SemanticEngine
from evaluator import Evaluator

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# CV 데이터 매핑 함수
def get_expression_score(expression: str, probability: float) -> float:
    # 7가지 기본 감정 점수화 (안정도 기준)
    scores = {
        "neutral": 1.0,
        "happy": 1.0,
        "surprised": 0.9,
        "sad": 0.8,
        "fearful": 0.7,
        "disgusted": 0.7,
        "angry": 0.6
    }
    base_score = scores.get(expression, 1.0)
    # 확률이 낮으면 중립(1.0)에 가깝게 보정
    return 1.0 - (1.0 - base_score) * probability

# 전역 엔진 인스턴스 제거 (웹소켓 세션 내부에서 생성됨)

@app.get("/")
async def root():
    return {"message": "AI Metacognition Interview Simulator API"}

@app.websocket("/ws/interview")
async def interview_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # 세션별로 독립적인 분석 엔진 생성 (세션 리셋 문제 해결)
    session_daap = DAAPEngine()
    session_logic = LogicEngine(client)
    session_semantic = SemanticEngine()
    session_evaluator = Evaluator(client)
    
    last_probe_content = "인터뷰 주제 설정"

    try:
        # 초기 환영 메시지
        await websocket.send_text(json.dumps({
            "type": "probe",
            "content": "메타인지 인터뷰 시스템에 오신 것을 환영합니다. 분석을 시작할 인터뷰 주제를 입력해 주십시오.",
            "metrics": {"depth": 0, "survival_probability": 1.0, "semantic_energy": 0, "logic_consistency": True, "bloom_level": 1, "ciqs": 1}
        }))

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type", "answer")
            content = message.get("content", "")

            if msg_type == "answer":
                user_text = content
                # CV 데이터 추출 (없을 경우 디폴트 'neutral', 0.0)
                expression = message.get("expression", "neutral")
                expr_prob = message.get("expression_probability", 0.0)
                expr_score = get_expression_score(expression, expr_prob)

                # 1. 의미론적 에너지 분석 (시뮬레이션)
                logprobs_mock = [random.uniform(-0.5, -0.01) for _ in range(5)]
                uncertainty = session_semantic.get_metacognitive_uncertainty(user_text, logprobs_mock)
                
                # 2. 논리 정합성 체크 (AI 기반 동적 체크)
                consistent, logic_reason = await session_logic.check_consistency(user_text)
                
                # 초기 주제 설정 시에는 논리 점수를 관대하게 적용 (초기 붕괴 방지)
                consistency_score = 1.0 if consistent or session_daap.current_depth == 0 else 0.4
                
                # 3. 생존 확률 업데이트 (CV 점수 반영)
                survival_prob = session_daap.update_survival(consistency_score, uncertainty, expr_score)
                
                # 4. CIQS 및 블룸 위계 평가 (AI 기반 동적 채점)
                dynamic_scores = await session_evaluator.get_dynamic_scores(user_text, last_probe_content)
                bloom_level = dynamic_scores.get("bloom_level", 2)
                relevance = dynamic_scores.get("relevance", 0.5)
                ciqs = session_evaluator.calculate_ciqs(bloom_level, consistency_score, relevance)
                
                # 5. 다음 탐침 질문 후보 생성 (Safe vs Creative) - 스트리밍 방식으로 지연 시간 체감 감소
                probe_instruction = session_daap.get_next_probe_instruction(user_text)
                
                # 메트릭 먼저 전송하여 UI 업데이트
                await websocket.send_text(json.dumps({
                    "type": "metrics_update",
                    "metrics": {
                        "semantic_energy": uncertainty,
                        "survival_probability": survival_prob,
                        "logic_consistency": consistent,
                        "bloom_level": bloom_level,
                        "ciqs": ciqs,
                        "depth": session_daap.current_depth,
                        "is_collapsed": session_daap.is_collapsed()
                    }
                }))

                options = ["", ""]
                
                async def stream_option(option_idx, temperature):
                    nonlocal options
                    try:
                        stream = await client.chat.completions.create(
                            model="gpt-4o-mini",
                            messages=[{"role": "system", "content": probe_instruction}],
                            temperature=temperature,
                            max_tokens=150,  # 1차 안전장치: 토큰 제한
                            stream=True
                        )
                        async for chunk in stream:
                            # 2차 안전장치: 글자 수 제한 (500자 초과 시 중단)
                            if len(options[option_idx]) > 500:
                                break
                                
                            content = chunk.choices[0].delta.content or ""
                            if content:
                                options[option_idx] += content
                                await websocket.send_text(json.dumps({
                                    "type": "option_chunk",
                                    "index": option_idx,
                                    "content": content
                                }))
                    except Exception as e:
                        options[option_idx] = f"에러 발생: {str(e)}"
                        await websocket.send_text(json.dumps({
                            "type": "option_chunk",
                            "index": option_idx,
                            "content": options[option_idx]
                        }))

                # 두 옵션을 동시에 스트리밍
                await asyncio.gather(
                    stream_option(0, 0.1),
                    stream_option(1, 0.8)
                )

                # 스트리밍 완료 알림
                await websocket.send_text(json.dumps({
                    "type": "question_options_complete",
                    "options": options
                }))
                
                if session_daap.is_collapsed():
                    await websocket.send_text(json.dumps({
                        "type": "terminal",
                        "content": f"인지적 붕괴가 감지되었습니다. 사유: {logic_reason}",
                        "stats": session_daap.get_stats()
                    }))
                    break

            elif msg_type == "select":
                # 질문이 최종 선택됨
                last_probe_content = content
                pass
                
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error in WebSocket: {e}")
        try:
            await websocket.close()
        except:
            pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
